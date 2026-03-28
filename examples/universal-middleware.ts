/**
 * Universal LLM Middleware Example
 *
 * Demonstrates how to create a universal LLM proxy using Bun.serve() that can
 * accept requests in any provider format and route them to any target provider.
 */

import { toUniversal, fromUniversal, detectProvider } from "../src"
import type { ProviderType } from "../src"

// Mock provider clients (replace with actual SDK calls in production)
async function callProvider(provider: ProviderType, request: any) {
  switch (provider) {
    case "openai":
      return {
        choices: [{ message: { content: `OpenAI response` } }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      }
    case "anthropic":
      return {
        content: [{ text: `Anthropic response` }],
        usage: { input_tokens: 95, output_tokens: 48 },
      }
    case "google":
      return {
        candidates: [{ content: { parts: [{ text: `Google response` }] } }],
        usageMetadata: { promptTokenCount: 98, candidatesTokenCount: 52 },
      }
    default:
      return { choices: [{ message: { content: "Response" } }] }
  }
}

// The middleware handler
async function handleLLMRequest(req: Request): Promise<Response> {
  const requestId = req.headers.get("x-request-id") || `req-${Date.now()}`
  const body = await req.json()

  const { targetProvider = "openai", targetUrl, ...requestBody } = body

  // Auto-detect source format using URL hint or body structure
  const sourceUrl = targetUrl || "https://api.openai.com/v1/chat/completions"
  const sourceProvider = detectProvider(sourceUrl, requestBody)
  console.log(`[${requestId}] ${sourceProvider} -> ${targetProvider}`)

  // Convert to universal format
  const universal = toUniversal(sourceProvider, requestBody as any)

  // Apply policies: clamp temperature and max_tokens
  if (universal.temperature && universal.temperature > 1) universal.temperature = 1
  if (universal.max_tokens && universal.max_tokens > 4000) universal.max_tokens = 4000

  // Convert to target provider format
  const targetRequest = fromUniversal(targetProvider as ProviderType, {
    ...universal,
    provider: targetProvider,
  } as any)

  // Call target provider
  const response = await callProvider(targetProvider as ProviderType, targetRequest)

  return Response.json({
    response,
    metadata: { sourceProvider, targetProvider, requestId },
  })
}

// Bun.serve() setup
const server = Bun.serve({
  port: Number(process.env.PORT) || 3000,
  routes: {
    "/v1/chat/completions": {
      POST: handleLLMRequest,
    },
    "/health": {
      GET: () => Response.json({ status: "healthy", timestamp: new Date().toISOString() }),
    },
  },
  fetch(req) {
    return new Response("Not Found", { status: 404 })
  },
})

console.log(`Universal LLM Middleware listening on ${server.url}`)
console.log("POST /v1/chat/completions - Universal LLM endpoint")
console.log("GET  /health - Health check")
console.log("")
console.log("Usage:")
console.log(`curl -X POST ${server.url}v1/chat/completions \\`)
console.log('  -H "Content-Type: application/json" \\')
console.log('  -d \'{"model":"gpt-4","messages":[{"role":"user","content":"Hello"}],"targetProvider":"anthropic"}\'')

// Demo: show translations without making real requests
function demonstrateTranslations() {
  console.log("\n--- Translation Demo ---\n")

  // OpenAI -> Anthropic
  const openaiReq = {
    model: "gpt-4",
    messages: [
      { role: "system", content: "You are a helpful assistant" },
      { role: "user", content: "What is the capital of France?" },
    ],
    temperature: 0.7,
  }

  const universal1 = toUniversal("openai", openaiReq as any)
  const anthropicReq = fromUniversal("anthropic", { ...universal1, provider: "anthropic" } as any)
  console.log("OpenAI -> Anthropic:", JSON.stringify(anthropicReq, null, 2))

  // Anthropic -> Google
  const anthropicBody = {
    model: "claude-sonnet-4-20250514",
    system: "You are a helpful assistant",
    messages: [{ role: "user", content: "Explain machine learning briefly" }],
    max_tokens: 100,
  }

  const universal2 = toUniversal("anthropic", anthropicBody as any)
  const googleReq = fromUniversal("google", { ...universal2, provider: "google" } as any)
  console.log("\nAnthropic -> Google:", JSON.stringify(googleReq, null, 2))

  // Google -> OpenAI
  const googleBody = {
    contents: [{ role: "user", parts: [{ text: "What are the benefits of renewable energy?" }] }],
    generationConfig: { temperature: 0.8, maxOutputTokens: 200 },
  }

  const universal3 = toUniversal("google", googleBody as any)
  const openaiOut = fromUniversal("openai", { ...universal3, provider: "openai" } as any)
  console.log("\nGoogle -> OpenAI:", JSON.stringify(openaiOut, null, 2))
}

demonstrateTranslations()

export { handleLLMRequest }
