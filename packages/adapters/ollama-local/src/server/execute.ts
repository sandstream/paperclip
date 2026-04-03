import fs from "node:fs/promises";
import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";

interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OllamaChatResponse {
  message?: { content?: string };
  done?: boolean;
  eval_count?: number;
  eval_duration?: number;
  prompt_eval_count?: number;
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const config = ctx.config;
  const host = (config.host as string) || "http://localhost:11434";
  const model = (config.model as string) || "qwen2.5-coder:14b";
  const numCtx = (config.num_ctx as number) || 8192;
  const timeoutSec = (config.timeoutSec as number) || 300;

  // Build system prompt from instructions file
  let systemPrompt = "You are a helpful AI assistant working on a software project.";
  const instructionsPath = config.instructionsFilePath as string | undefined;
  if (instructionsPath) {
    try {
      const instructions = await fs.readFile(instructionsPath, "utf-8");
      systemPrompt = instructions;
    } catch {
      // ignore if file not found
    }
  }

  // Build the user prompt from context (Paperclip passes contextSnapshot as context)
  const agentName = ctx.agent?.name ?? "Agent";
  const issueId = (ctx.context?.issueId as string) ?? null;
  const wakeReason = (ctx.context?.wakeReason as string) ?? "heartbeat";
  
  let runPrompt = (config.promptTemplate as string) ||
    `You are ${agentName}, an AI agent. This is a ${wakeReason} run. Check your assigned tasks and make progress on them. Be concise in your response.`;
  
  if (issueId) {
    runPrompt = `You are ${agentName}, an AI agent. You have been assigned issue ${issueId}. Review the issue and make progress on it.`;
  }

  const messages: OllamaMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: String(runPrompt) },
  ];

  await ctx.onLog("stderr", `[ollama] Calling ${host} with model ${model}\n`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSec * 1000);

  try {
    const res = await fetch(`${host}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        options: { num_ctx: numCtx },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: `Ollama returned HTTP ${res.status}: ${text}`,
      };
    }

    let fullResponse = "";
    let evalCount = 0;
    let evalDuration = 0;
    let promptEvalCount = 0;

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter(Boolean);

      for (const line of lines) {
        try {
          const data = JSON.parse(line) as OllamaChatResponse;
          if (data.message?.content) {
            fullResponse += data.message.content;
            await ctx.onLog("stdout", data.message.content);
          }
          if (data.done) {
            evalCount = data.eval_count ?? 0;
            evalDuration = data.eval_duration ?? 0;
            promptEvalCount = data.prompt_eval_count ?? 0;
          }
        } catch {
          // ignore parse errors
        }
      }
    }

    const tokensPerSec = evalDuration > 0 ? evalCount / (evalDuration / 1e9) : 0;
    await ctx.onLog(
      "stderr",
      `[ollama] Done. ${evalCount} tokens @ ${tokensPerSec.toFixed(1)} tok/s\n`
    );

    return {
      exitCode: 0,
      signal: null,
      timedOut: false,
      usage: {
        inputTokens: promptEvalCount,
        outputTokens: evalCount,
      },
    };
  } catch (err: unknown) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    return {
      exitCode: 1,
      signal: null,
      timedOut: isAbort,
      errorMessage: isAbort ? `Ollama timed out after ${timeoutSec}s` : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}
