import { ProviderType } from "../types/providers"

export function detectProvider(targetUrl: string, body: unknown): ProviderType {
  const hostname = new URL(targetUrl).hostname.toLowerCase()

  // Anthropic format: separate `system` parameter, custom tool format
  if (hostname.includes("anthropic.com") || hostname.includes("claude.ai")) {
    return "anthropic"
  }

  // Google format: `contents` with `parts`, `systemInstruction`, `generationConfig`
  if (
    hostname.includes("generativelanguage.googleapis.com") ||
    hostname.includes("aiplatform.googleapis.com") ||
    hostname.includes("googleapis.com")
  ) {
    return "google"
  }

  // Body-based detection for when URL isn't clear
  if (body && typeof body === "object") {
    const bodyObj = body as any

    // Anthropic format indicators
    if (
      bodyObj.anthropic_version ||
      (typeof bodyObj.system === "string" &&
        bodyObj.messages &&
        !bodyObj.contents) ||
      bodyObj.max_tokens_to_sample
    ) {
      return "anthropic"
    }

    // Google format indicators
    if (
      bodyObj.contents ||
      bodyObj.systemInstruction ||
      bodyObj.generationConfig ||
      (bodyObj.tools &&
        Array.isArray(bodyObj.tools) &&
        bodyObj.tools[0]?.functionDeclarations)
    ) {
      return "google"
    }
  }

  // Default to OpenAI format (used by OpenAI, Azure, Together, Groq, Fireworks,
  // Mistral, Cohere, Perplexity, OpenRouter, and most other providers)
  return "openai"
}
