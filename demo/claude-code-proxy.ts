/**
 * Claude Code -> Gemini Proxy
 *
 * Accepts Anthropic Messages API requests at /v1/messages,
 * translates them to Google Gemini format, streams the response,
 * and translates back to Anthropic SSE format.
 *
 * Usage:
 *   bun --env-file=.env run demo/claude-code-proxy.ts
 *
 * Then point Claude Code at it:
 *   ANTHROPIC_BASE_URL=http://localhost:4141 ANTHROPIC_API_KEY=placeholder claude
 */

import {
  toUniversal,
  fromUniversal,
  parseGoogleStream,
  emitAnthropicStream,
} from "../dist/index.mjs"

const GOOGLE_API_KEY = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash"
const PORT = parseInt(process.env.PORT || "4141")

if (!GOOGLE_API_KEY) {
  console.error("Set GOOGLE_AI_API_KEY or GEMINI_API_KEY")
  process.exit(1)
}

function buildGeminiUrl(model: string, stream: boolean): string {
  const action = stream ? "streamGenerateContent" : "generateContent"
  const base = "https://generativelanguage.googleapis.com/v1beta/models"
  return `${base}/${model}:${action}?key=${GOOGLE_API_KEY}${stream ? "&alt=sse" : ""}`
}

function mapModel(anthropicModel: string): string {
  if (process.env.GEMINI_MODEL) return process.env.GEMINI_MODEL
  if (anthropicModel.includes("opus")) return "gemini-2.5-pro"
  if (anthropicModel.includes("haiku")) return "gemini-2.5-flash"
  return "gemini-2.5-flash"
}

const server = Bun.serve({
  port: PORT,

  async fetch(req) {
    const url = new URL(req.url)

    if (req.method === "GET" && url.pathname === "/") {
      return new Response("Claude Code <-> Gemini proxy running")
    }

    // Token counting stub
    if (req.method === "POST" && url.pathname === "/v1/messages/count_tokens") {
      const body = await req.json()
      return Response.json({ input_tokens: JSON.stringify(body).length / 4 | 0 })
    }

    if (req.method !== "POST" || url.pathname !== "/v1/messages") {
      return new Response("Not found", { status: 404 })
    }

    const anthropicBody = await req.json()
    const wantsStream = anthropicBody.stream === true
    const geminiModel = mapModel(anthropicBody.model || "")

    console.log(`[proxy] ${anthropicBody.model} -> ${geminiModel} (stream=${wantsStream})`)

    // Anthropic -> Universal -> Google
    const universal = toUniversal("anthropic", anthropicBody)
    universal.model = geminiModel
    universal.provider = "google"

    const googleBody = fromUniversal("google", universal) as any
    delete googleBody.stream

    // Strip thinkingConfig for models that don't support it
    const supportsThinking = geminiModel.includes("2.5") || geminiModel.includes("3")
    if (!supportsThinking && googleBody.generationConfig?.thinkingConfig) {
      delete googleBody.generationConfig.thinkingConfig
    }

    const geminiUrl = buildGeminiUrl(geminiModel, wantsStream)

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(googleBody),
    })

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text()
      console.error(`[proxy] Gemini error ${geminiResponse.status}:`, errorText)
      return Response.json(
        { type: "error", error: { type: "api_error", message: `Gemini ${geminiResponse.status}: ${errorText}` } },
        { status: geminiResponse.status },
      )
    }

    if (!wantsStream) {
      const geminiData = await geminiResponse.json()
      const parts = geminiData.candidates?.[0]?.content?.parts || []
      const text = parts.filter((p: any) => p.text).map((p: any) => p.text).join("")
      const usage = geminiData.usageMetadata || {}

      return Response.json({
        id: `msg_${Date.now()}`,
        type: "message",
        role: "assistant",
        model: anthropicBody.model,
        content: [{ type: "text", text }],
        stop_reason: "end_turn",
        usage: { input_tokens: usage.promptTokenCount || 0, output_tokens: usage.candidatesTokenCount || 0 },
      })
    }

    // Streaming: Google SSE -> Universal events -> Anthropic SSE
    if (!geminiResponse.body) {
      return new Response("No response body from Gemini", { status: 502 })
    }

    const universalEvents = parseGoogleStream(geminiResponse.body)

    // Patch model name back to what Claude Code expects
    async function* patchModel(events: AsyncIterable<any>) {
      for await (const event of events) {
        if (event.type === "message_start") {
          yield { ...event, model: anthropicBody.model }
        } else {
          yield event
        }
      }
    }

    const anthropicStream = emitAnthropicStream(patchModel(universalEvents))

    return new Response(anthropicStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  },
})

console.log(`
  Claude Code <-> Gemini Proxy
  http://localhost:${server.port}
  Model: ${GEMINI_MODEL}

  Usage:
    ANTHROPIC_BASE_URL=http://localhost:${server.port} ANTHROPIC_API_KEY=placeholder claude
`)
