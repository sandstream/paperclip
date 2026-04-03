import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = ctx.config as Record<string, unknown>;
  const host = (config.host as string) || "http://localhost:11434";
  const model = (config.model as string) || "qwen2.5-coder:14b";

  // Check Ollama connectivity
  try {
    const res = await fetch(`${host}/api/version`);
    if (!res.ok) {
      checks.push({
        code: "ollama_unreachable",
        level: "error",
        message: `Ollama returned HTTP ${res.status} at ${host}`,
        hint: "Make sure Ollama is running and accessible.",
      });
    } else {
      const data = await res.json() as { version?: string };
      checks.push({
        code: "ollama_reachable",
        level: "info",
        message: `Ollama ${data.version ?? "unknown"} is running at ${host}`,
      });
    }
  } catch (err) {
    checks.push({
      code: "ollama_unreachable",
      level: "error",
      message: `Cannot reach Ollama at ${host}: ${err}`,
      hint: "Run 'ollama serve' or check OLLAMA_HOST setting.",
    });
    return {
      adapterType: ctx.adapterType,
      status: "fail",
      checks,
      testedAt: new Date().toISOString(),
    };
  }

  // Check model availability
  try {
    const res = await fetch(`${host}/api/tags`);
    if (res.ok) {
      const data = await res.json() as { models?: Array<{ name: string }> };
      const available = (data.models ?? []).map((m) => m.name);
      const modelAvailable = available.some((m) => m === model || m.startsWith(model.split(":")[0]));
      if (modelAvailable) {
        checks.push({
          code: "ollama_model_available",
          level: "info",
          message: `Model ${model} is available`,
        });
      } else {
        checks.push({
          code: "ollama_model_missing",
          level: "error",
          message: `Model ${model} is not pulled`,
          detail: `Available: ${available.slice(0, 5).join(", ")}`,
          hint: `Run: ollama pull ${model}`,
        });
      }
    }
  } catch {
    checks.push({
      code: "ollama_tags_check_failed",
      level: "warn",
      message: "Could not verify model availability",
    });
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
