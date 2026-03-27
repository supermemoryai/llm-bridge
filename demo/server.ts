import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

// Import llm-bridge from built dist
import {
  toUniversal,
  fromUniversal,
  detectProvider,
  parseOpenAIStream,
  parseAnthropicStream,
  parseGoogleStream,
  type UniversalStreamEvent,
} from "../dist/index.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// Provider config
// ---------------------------------------------------------------------------
const PROVIDERS: Record<
  string,
  { name: string; key: string | undefined; baseUrl: string; model: string; streamPath: string }
> = {
  openai: {
    name: "OpenAI (GPT-4o)",
    key: process.env.OPENAI_API_KEY,
    baseUrl: "https://api.openai.com",
    model: "gpt-4o",
    streamPath: "/v1/chat/completions",
  },
  anthropic: {
    name: "Anthropic (Claude Sonnet 4)",
    key: process.env.ANTHROPIC_API_KEY,
    baseUrl: "https://api.anthropic.com",
    model: "claude-sonnet-4-20250514",
    streamPath: "/v1/messages",
  },
  google: {
    name: "Google (Gemini 2.0 Flash)",
    key: process.env.GOOGLE_AI_API_KEY,
    baseUrl: "https://generativelanguage.googleapis.com",
    model: "gemini-2.0-flash",
    streamPath: "", // built dynamically
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the full URL + headers for a provider request */
function buildProviderRequest(
  provider: string,
  body: any,
  stream: boolean,
): { url: string; headers: Record<string, string>; body: any } {
  const cfg = PROVIDERS[provider]
  if (!cfg?.key) throw new Error(`No API key for ${provider}`)

  if (provider === "openai") {
    return {
      url: `${cfg.baseUrl}/v1/chat/completions`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.key}`,
      },
      body: { ...body, model: body.model || cfg.model, stream },
    }
  }

  if (provider === "anthropic") {
    return {
      url: `${cfg.baseUrl}/v1/messages`,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": cfg.key,
        "anthropic-version": "2023-06-01",
      },
      body: {
        ...body,
        model: body.model || cfg.model,
        max_tokens: body.max_tokens || 4096,
        stream,
      },
    }
  }

  if (provider === "google") {
    const model = body.model || cfg.model
    // Remove model from body for Google (it's in the URL)
    const { model: _, ...googleBody } = body
    const action = stream ? "streamGenerateContent" : "generateContent"
    return {
      url: `${cfg.baseUrl}/v1beta/models/${model}:${action}?key=${cfg.key}${stream ? "&alt=sse" : ""}`,
      headers: { "Content-Type": "application/json" },
      body: googleBody,
    }
  }

  throw new Error(`Unknown provider: ${provider}`)
}

/** Make a non-streaming request to a provider */
async function callProvider(provider: string, body: any): Promise<any> {
  const req = buildProviderRequest(provider, body, false)
  const res = await fetch(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify(req.body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${provider} API error (${res.status}): ${text}`)
  }
  return res.json()
}

/** Make a streaming request and return the raw Response */
async function callProviderStream(
  provider: string,
  body: any,
): Promise<Response> {
  const req = buildProviderRequest(provider, body, true)
  const res = await fetch(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify(req.body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${provider} API error (${res.status}): ${text}`)
  }
  return res
}

/** Pick the right stream parser for a provider */
function getParser(
  provider: string,
): (stream: ReadableStream) => AsyncGenerator<UniversalStreamEvent> {
  switch (provider) {
    case "openai":
      return parseOpenAIStream
    case "anthropic":
      return parseAnthropicStream
    case "google":
      return parseGoogleStream
    default:
      throw new Error(`No stream parser for ${provider}`)
  }
}

/** Override the model in a universal body to match the target provider */
function setTargetModel(universal: any, targetProvider: string) {
  return {
    ...universal,
    model: PROVIDERS[targetProvider]?.model || universal.model,
    provider: targetProvider,
  }
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
const app = new Hono()

// Serve the frontend
app.get("/", (c) => {
  const html = readFileSync(join(__dirname, "index.html"), "utf-8")
  return c.html(html)
})

// Available providers
app.get("/api/providers", (c) => {
  const available = Object.entries(PROVIDERS)
    .filter(([, cfg]) => !!cfg.key)
    .map(([id, cfg]) => ({ id, name: cfg.name, model: cfg.model }))
  return c.json({ providers: available })
})

// ---------------------------------------------------------------------------
// Demo 1: Translate & Route (non-streaming)
// Send a request in one provider's format, translate, and route to another
// ---------------------------------------------------------------------------
app.post("/api/translate-and-route", async (c) => {
  const { sourceFormat, targetProvider, body } = await c.req.json()

  try {
    // Step 1: Parse the source format into universal
    const universal = toUniversal(sourceFormat, body)

    // Step 2: Convert to target provider format (override model for target)
    const targetUniversal = setTargetModel(universal, targetProvider)
    console.log(`[DEBUG] Source model: ${universal.model}, Target model: ${targetUniversal.model}, Target provider: ${targetProvider}`)
    const targetBody = fromUniversal(targetProvider, targetUniversal as any)
    console.log(`[DEBUG] Target body model: ${(targetBody as any).model}`)

    // Step 3: Call the target provider
    const response = await callProvider(targetProvider, targetBody)

    return c.json({
      steps: {
        sourceFormat,
        sourceBody: body,
        universal,
        targetProvider,
        targetBody,
        response,
      },
    })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// ---------------------------------------------------------------------------
// Demo 2: Streaming cross-provider translation
// Stream from one provider, translate events in real-time
// ---------------------------------------------------------------------------
app.post("/api/stream", async (c) => {
  const { sourceFormat, targetProvider, prompt, systemPrompt } =
    await c.req.json()

  // Build the request in the source format
  let sourceBody: any
  if (sourceFormat === "openai") {
    sourceBody = {
      model: PROVIDERS.openai.model,
      messages: [
        ...(systemPrompt
          ? [{ role: "system", content: systemPrompt }]
          : []),
        { role: "user", content: prompt },
      ],
    }
  } else if (sourceFormat === "anthropic") {
    sourceBody = {
      model: PROVIDERS.anthropic.model,
      max_tokens: 4096,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: [{ role: "user", content: prompt }],
    }
  } else if (sourceFormat === "google") {
    sourceBody = {
      model: PROVIDERS.google.model,
      ...(systemPrompt
        ? { systemInstruction: { parts: [{ text: systemPrompt }] } }
        : {}),
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    }
  }

  // Translate to target format
  const universal = toUniversal(sourceFormat, sourceBody)
  const targetBody = fromUniversal(targetProvider, setTargetModel(universal, targetProvider) as any)

  try {
    // Stream from target provider
    const response = await callProviderStream(targetProvider, targetBody)
    if (!response.body) throw new Error("No response body")

    const parser = getParser(targetProvider)

    // Return SSE stream of universal events + text
    return streamSSE(c, async (stream) => {
      // Send the translation metadata first
      await stream.writeSSE({
        event: "meta",
        data: JSON.stringify({
          sourceFormat,
          sourceBody,
          targetProvider,
          targetBody,
        }),
      })

      try {
        for await (const event of parser(response.body!)) {
          // Send the raw universal event
          await stream.writeSSE({
            event: "universal",
            data: JSON.stringify(event),
          })

          // Also send extracted text for easy rendering
          if (event.type === "content_delta" && event.delta.text) {
            await stream.writeSSE({
              event: "text",
              data: event.delta.text,
            })
          }
          if (event.type === "content_delta" && event.delta.thinking) {
            await stream.writeSSE({
              event: "thinking",
              data: event.delta.thinking,
            })
          }
          if (event.type === "message_end") {
            await stream.writeSSE({
              event: "done",
              data: JSON.stringify(event),
            })
          }
        }
      } catch (err: any) {
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({ message: err.message }),
        })
      }
    })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// ---------------------------------------------------------------------------
// Demo 3: Provider Roulette — same prompt to ALL providers simultaneously
// ---------------------------------------------------------------------------
app.post("/api/roulette", async (c) => {
  const { prompt, systemPrompt } = await c.req.json()

  const availableProviders = Object.entries(PROVIDERS)
    .filter(([, cfg]) => !!cfg.key)
    .map(([id]) => id)

  // Build an OpenAI-format request (simplest common format)
  const openaiBody: any = {
    model: "gpt-4o",
    messages: [
      ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
      { role: "user", content: prompt },
    ],
  }

  // Translate to each provider and call in parallel
  const universal = toUniversal("openai", openaiBody)

  const results = await Promise.allSettled(
    availableProviders.map(async (provider) => {
      const targetBody = fromUniversal(provider, setTargetModel(universal, provider) as any)
      const start = Date.now()
      const response = await callProvider(provider, targetBody)
      const elapsed = Date.now() - start

      // Extract the response text
      let text = ""
      if (provider === "openai") {
        text = response.choices?.[0]?.message?.content || ""
      } else if (provider === "anthropic") {
        text =
          response.content
            ?.filter((b: any) => b.type === "text")
            .map((b: any) => b.text)
            .join("") || ""
      } else if (provider === "google") {
        text =
          response.candidates?.[0]?.content?.parts
            ?.map((p: any) => p.text)
            .join("") || ""
      }

      return {
        provider,
        name: PROVIDERS[provider].name,
        model: PROVIDERS[provider].model,
        text,
        elapsed,
        translatedBody: targetBody,
        rawResponse: response,
      }
    }),
  )

  return c.json({
    prompt,
    results: results.map((r, i) => {
      if (r.status === "fulfilled") return { status: "ok", ...r.value }
      return {
        status: "error",
        provider: availableProviders[i],
        name: PROVIDERS[availableProviders[i]].name,
        error: (r.reason as Error).message,
      }
    }),
  })
})

// ---------------------------------------------------------------------------
// Demo 4: Streaming roulette — stream from all providers simultaneously
// ---------------------------------------------------------------------------
app.post("/api/stream-roulette", async (c) => {
  const { prompt, systemPrompt } = await c.req.json()

  const availableProviders = Object.entries(PROVIDERS)
    .filter(([, cfg]) => !!cfg.key)
    .map(([id]) => id)

  // Build OpenAI-format source, translate to each
  const openaiBody: any = {
    model: "gpt-4o",
    messages: [
      ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
      { role: "user", content: prompt },
    ],
  }
  const universal = toUniversal("openai", openaiBody)

  return streamSSE(c, async (stream) => {
    // Launch all streams in parallel
    const streamPromises = availableProviders.map(async (provider) => {
      try {
        const targetBody = fromUniversal(provider, setTargetModel(universal, provider) as any)

        await stream.writeSSE({
          event: "start",
          data: JSON.stringify({ provider, name: PROVIDERS[provider].name }),
        })

        const response = await callProviderStream(provider, targetBody)
        if (!response.body) throw new Error("No response body")

        const parser = getParser(provider)
        for await (const event of parser(response.body)) {
          if (event.type === "content_delta" && event.delta.text) {
            await stream.writeSSE({
              event: "token",
              data: JSON.stringify({ provider, text: event.delta.text }),
            })
          }
          if (event.type === "content_delta" && event.delta.thinking) {
            await stream.writeSSE({
              event: "thinking",
              data: JSON.stringify({
                provider,
                text: event.delta.thinking,
              }),
            })
          }
          if (event.type === "message_end") {
            await stream.writeSSE({
              event: "provider_done",
              data: JSON.stringify({ provider, event }),
            })
          }
        }
      } catch (err: any) {
        await stream.writeSSE({
          event: "provider_error",
          data: JSON.stringify({ provider, error: err.message }),
        })
      }
    })

    await Promise.allSettled(streamPromises)
    await stream.writeSSE({ event: "all_done", data: "{}" })
  })
})

// ---------------------------------------------------------------------------
// Demo 5: Tool calling across providers
// ---------------------------------------------------------------------------
app.post("/api/tool-calling", async (c) => {
  const { targetProvider, prompt } = await c.req.json()

  // Define tools in OpenAI format
  const openaiBody: any = {
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content:
          "You are a helpful assistant. Use the provided tools when appropriate. Always use a tool if the user asks about weather or time.",
      },
      { role: "user", content: prompt },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "get_weather",
          description:
            "Get the current weather for a location. Call this when the user asks about weather.",
          parameters: {
            type: "object",
            properties: {
              location: {
                type: "string",
                description: "City name, e.g. San Francisco",
              },
              unit: {
                type: "string",
                enum: ["celsius", "fahrenheit"],
                description: "Temperature unit",
              },
            },
            required: ["location"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "get_time",
          description:
            "Get the current time in a timezone. Call this when the user asks about time.",
          parameters: {
            type: "object",
            properties: {
              timezone: {
                type: "string",
                description: "IANA timezone, e.g. America/New_York",
              },
            },
            required: ["timezone"],
          },
        },
      },
    ],
    tool_choice: "auto",
  }

  try {
    // Translate to target provider
    const universal = toUniversal("openai", openaiBody)
    const targetBody = fromUniversal(targetProvider, setTargetModel(universal, targetProvider) as any)

    // Call the provider
    const response = await callProvider(targetProvider, targetBody)

    // Check if the model wants to use tools
    let toolCalls: any[] = []
    let responseText = ""

    if (targetProvider === "openai") {
      toolCalls = response.choices?.[0]?.message?.tool_calls || []
      responseText = response.choices?.[0]?.message?.content || ""
    } else if (targetProvider === "anthropic") {
      const content = response.content || []
      toolCalls = content
        .filter((b: any) => b.type === "tool_use")
        .map((b: any) => ({
          id: b.id,
          type: "function",
          function: { name: b.name, arguments: JSON.stringify(b.input) },
        }))
      responseText = content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("")
    } else if (targetProvider === "google") {
      const parts = response.candidates?.[0]?.content?.parts || []
      toolCalls = parts
        .filter((p: any) => p.functionCall)
        .map((p: any, i: number) => ({
          id: `call_${i}`,
          type: "function",
          function: {
            name: p.functionCall.name,
            arguments: JSON.stringify(p.functionCall.args),
          },
        }))
      responseText = parts
        .filter((p: any) => p.text)
        .map((p: any) => p.text)
        .join("")
    }

    // Simulate tool execution
    const toolResults = toolCalls.map((tc: any) => {
      const fn = tc.function || tc
      const name = fn.name
      const args = JSON.parse(fn.arguments || "{}")

      if (name === "get_weather") {
        return {
          tool_call_id: tc.id,
          name,
          result: {
            location: args.location,
            temperature: Math.floor(Math.random() * 30) + 10,
            unit: args.unit || "celsius",
            condition: ["sunny", "cloudy", "rainy", "partly cloudy"][
              Math.floor(Math.random() * 4)
            ],
            humidity: Math.floor(Math.random() * 60) + 30,
            wind_speed: Math.floor(Math.random() * 30) + 5,
          },
        }
      }
      if (name === "get_time") {
        const now = new Date()
        return {
          tool_call_id: tc.id,
          name,
          result: {
            timezone: args.timezone,
            time: now.toLocaleString("en-US", {
              timeZone: args.timezone || "UTC",
            }),
            utc_offset: args.timezone,
          },
        }
      }
      return { tool_call_id: tc.id, name, result: { error: "Unknown tool" } }
    })

    // If there were tool calls, build continuation in the target provider's native format
    let finalResponse = null
    let continuationBody = null
    if (toolCalls.length > 0) {
      if (targetProvider === "openai") {
        continuationBody = {
          ...targetBody,
          messages: [
            ...(targetBody as any).messages,
            { role: "assistant", content: responseText || null, tool_calls: toolCalls },
            ...toolResults.map((tr: any) => ({
              role: "tool",
              tool_call_id: tr.tool_call_id,
              content: JSON.stringify(tr.result),
            })),
          ],
        }
      } else if (targetProvider === "anthropic") {
        // Anthropic: assistant has tool_use blocks, user has tool_result blocks
        const assistantContent: any[] = []
        if (responseText) assistantContent.push({ type: "text", text: responseText })
        for (const tc of toolCalls) {
          const fn = tc.function || tc
          assistantContent.push({
            type: "tool_use",
            id: tc.id,
            name: fn.name,
            input: JSON.parse(fn.arguments || "{}"),
          })
        }
        const toolResultContent = toolResults.map((tr: any) => ({
          type: "tool_result",
          tool_use_id: tr.tool_call_id,
          content: JSON.stringify(tr.result),
        }))
        continuationBody = {
          ...targetBody,
          messages: [
            ...(targetBody as any).messages,
            { role: "assistant", content: assistantContent },
            { role: "user", content: toolResultContent },
          ],
        }
      } else if (targetProvider === "google") {
        // Google: model has functionCall parts, user has functionResponse parts
        const modelParts = toolCalls.map((tc: any) => {
          const fn = tc.function || tc
          return { functionCall: { name: fn.name, args: JSON.parse(fn.arguments || "{}") } }
        })
        const responseParts = toolResults.map((tr: any) => ({
          functionResponse: { name: tr.name, response: tr.result },
        }))
        continuationBody = {
          ...targetBody,
          contents: [
            ...((targetBody as any).contents || []),
            { role: "model", parts: modelParts },
            { role: "user", parts: responseParts },
          ],
        }
      }

      if (continuationBody) {
        finalResponse = await callProvider(targetProvider, continuationBody)
      }
    }

    return c.json({
      steps: {
        sourceBody: openaiBody,
        translatedBody: targetBody,
        initialResponse: response,
        toolCalls,
        toolResults,
        continuationBody,
        finalResponse,
      },
    })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const port = 3456
console.log(`
╔══════════════════════════════════════════════════════════╗
║           LLM Bridge Playground                         ║
║           http://localhost:${port}                          ║
╠══════════════════════════════════════════════════════════╣
║  Available providers:                                    ║`)

for (const [id, cfg] of Object.entries(PROVIDERS)) {
  const status = cfg.key ? "✅" : "❌"
  console.log(`║  ${status} ${cfg.name.padEnd(40)}       ║`)
}

console.log(
  `╚══════════════════════════════════════════════════════════╝\n`,
)

serve({ fetch: app.fetch, port })
