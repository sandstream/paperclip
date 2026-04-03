export const type = "ollama_local";
export const label = "Ollama (local)";

export const models: Array<{ id: string; label: string }> = [
  { id: "ollama/qwen2.5-coder:14b", label: "Qwen2.5-Coder 14B" },
  { id: "ollama/qwen2.5-coder:32b", label: "Qwen2.5-Coder 32B" },
  { id: "ollama/llama3.3", label: "Llama 3.3" },
];

export const agentConfigurationDoc = `# ollama_local agent configuration

Adapter: ollama_local

Use when:
- You want to run a local LLM via Ollama (free, no API cost)
- Heartbeat agents, simple tasks, low-complexity tickets
- You have Ollama running locally or on a remote host

Don't use when:
- You need complex multi-step reasoning (use claude_local with Opus)
- You need tool use with MCP (use claude_local)

Core fields:
- host (string, optional): Ollama API base URL (default: "http://localhost:11434")
- model (string, required): Ollama model name (e.g. "qwen2.5-coder:14b")
- num_ctx (number, optional): context window size (default: 8192)
- cwd (string, optional): working directory
- instructionsFilePath (string, optional): path to AGENTS.md instructions file

Operational fields:
- timeoutSec (number, optional): run timeout in seconds
- graceSec (number, optional): SIGTERM grace period in seconds

Notes:
- Ollama must be running and accessible at the configured host
- Models must be pulled first: ollama pull qwen2.5-coder:14b
- Best for: heartbeats, simple research, outreach templates, status checks
`;
