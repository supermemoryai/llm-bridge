## Using LLM Bridge with the OpenAI Responses API

This guide shows how to use llm-bridge with the OpenAI Responses API, how it differs from Chat Completions, and how to migrate incrementally. You’ll find practical examples, streaming, tools, structured outputs, state, and testing tips.

### Key ideas

- The bridge auto-detects the Responses API via the URL path `/v1/responses` and translates to a universal format for safe editing, then back to provider format.
- You can pass Responses fields directly: `instructions`, `input`, `previous_response_id`, `store`, `tools`, `text.format`, `stream`.
- The `editFunction` lets you inject guardrails, memory, or optimizations in a provider‑agnostic way.

---

## Quick start

```ts
import { handleUniversalRequest } from "llm-bridge"

export async function createOneShotResponse(): Promise<void> {
  const body = {
    model: "gpt-4o-mini",
    instructions: "You are a helpful assistant. Be concise.",
    input: "Write a one-sentence bedtime story about a unicorn.",
  }

  const { response, observabilityData } = await handleUniversalRequest(
    "https://api.openai.com/v1/responses",
    body,
    {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    "POST",
    async function edit(universal) {
      // Optionally modify universal here
      return { request: universal, contextModified: false }
    },
  )

  const json = await response.json()
  console.log(json.output_text)
  console.log(observabilityData)
}
```

---

## Responses vs Chat Completions (what changes)

- **Input shape**

  - Chat: `messages: [{ role, content }]`
  - Responses: `input: string | message[]` and `instructions` for the system prompt

- **State**

  - Chat: client must resend full history
  - Responses: `previous_response_id` + optional `store: true`

- **Structured outputs**

  - Chat: `response_format`
  - Responses: `text.format` (e.g., `json_object` or `json_schema`)

- **Tools**

  - Chat: function calling only
  - Responses: built-in tools (e.g., `web_search_preview`, `file_search`, `code_interpreter`) plus functions

- **Streaming**
  - Chat: token deltas
  - Responses: evented SSE stream; the bridge passes these events through unchanged

---

## Common tasks with Responses

### 1) One‑shot text generation

```ts
import { handleUniversalRequest } from "llm-bridge"

export async function generateOnce(): Promise<void> {
  const body = {
    model: "gpt-4o-mini",
    instructions: "You are a helpful assistant.",
    input:
      "Summarize this in one sentence: The quick brown fox jumps over the lazy dog.",
  }

  const { response } = await handleUniversalRequest(
    "https://api.openai.com/v1/responses",
    body,
    {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    "POST",
    async function edit(universal) {
      return { request: universal, contextModified: false }
    },
  )

  const json = await response.json()
  console.log(json.output_text)
}
```

### 2) Stateful continuation

```ts
import { handleUniversalRequest } from "llm-bridge"

export async function continueConversation(previousId: string): Promise<void> {
  const body = {
    model: "gpt-4o-mini",
    input: "And its population?",
    previous_response_id: previousId,
    store: true,
  }

  const { response } = await handleUniversalRequest(
    "https://api.openai.com/v1/responses",
    body,
    {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    "POST",
    async function edit(universal) {
      // `previous_response_id` is preserved automatically in universal.provider_params
      return { request: universal, contextModified: false }
    },
  )

  const json = await response.json()
  console.log(json.output_text)
}
```

### 3) Built‑in tools

```ts
import { handleUniversalRequest } from "llm-bridge"

export async function withTools(): Promise<void> {
  const body = {
    model: "gpt-4o-mini",
    input: "Who is the current president of France?",
    tools: [{ type: "web_search_preview" }],
  }

  const { response } = await handleUniversalRequest(
    "https://api.openai.com/v1/responses",
    body,
    {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    "POST",
    async function edit(universal) {
      return { request: universal, contextModified: false }
    },
  )

  const json = await response.json()
  console.log(json.output_text)
}
```

### 4) Structured outputs (JSON)

```ts
import { handleUniversalRequest } from "llm-bridge"

export async function structuredOutput(): Promise<void> {
  const body = {
    model: "gpt-4o-mini",
    input: "Return a JSON object with keys name and age",
    text: { format: "json_object" },
  }

  const { response } = await handleUniversalRequest(
    "https://api.openai.com/v1/responses",
    body,
    {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    "POST",
    async function edit(universal) {
      return { request: universal, contextModified: false }
    },
  )

  const json = await response.json()
  console.log(json.output_text) // JSON string
}
```

### 5) Streaming (SSE passthrough)

```ts
import { handleUniversalRequest } from "llm-bridge"

export async function streamHaiku(): Promise<void> {
  const body = {
    model: "gpt-4o-mini",
    input: "Write a short haiku about programming",
    stream: true,
  }

  const { response } = await handleUniversalRequest(
    "https://api.openai.com/v1/responses",
    body,
    {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    "POST",
    async function edit(universal) {
      return { request: universal, contextModified: false }
    },
  )

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    process.stdout.write(decoder.decode(value)) // raw SSE passthrough
  }
}
```

---

## How this differs from Chat Completions in practice

### Chat Completions-style request

```ts
import { handleUniversalRequest } from "llm-bridge"

export async function chatStyle(): Promise<void> {
  const body = {
    model: "gpt-4",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Hello!" },
    ],
  }

  const { response } = await handleUniversalRequest(
    "https://api.openai.com/v1/chat/completions",
    body,
    {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    "POST",
    async function edit(universal) {
      // Same edit seam, different provider shape
      return { request: universal, contextModified: false }
    },
  )

  const json = await response.json()
  console.log(json.choices?.[0]?.message?.content)
}
```

### Responses-style request (preferred)

```ts
import { handleUniversalRequest } from "llm-bridge"

export async function responsesStyle(): Promise<void> {
  const body = {
    model: "gpt-4o-mini",
    instructions: "You are a helpful assistant.",
    input: "Hello!",
    store: true,
  }

  const { response } = await handleUniversalRequest(
    "https://api.openai.com/v1/responses",
    body,
    {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    "POST",
    async function edit(universal) {
      return { request: universal, contextModified: false }
    },
  )

  const json = await response.json()
  console.log(json.output_text)
}
```

Notes:

- With Responses, you no longer resend the whole history; use `previous_response_id`.
- Structured outputs move to `text.format`.
- Built-in tools (e.g., `web_search_preview`) are supported directly.
- Streaming emits semantic events; the bridge relays them as raw SSE.

---

## Editing via universal format

Every `handleUniversalRequest` call converts to a universal format, runs your `editFunction`, then converts back to provider format. This is where you add policy, memory, or optimization logic.

```ts
export async function edit(universal) {
  const enhanced = {
    ...universal,
    system: `${universal.system || ""}\nFollow company style guidelines.`,
  }
  return { request: enhanced, contextModified: true }
}
```

What’s preserved automatically:

- All unknown Response fields via `_original` and `provider_params`
- State fields like `previous_response_id`, `store`, `include`
- Built-in tools configuration

---

## Testing and examples

- Real‑world tests (skipped unless you set `OPENAI_API_KEY` and `RUN_LIVE_TESTS=true`):

  - `user_tests/responses-real-world.test.ts`
  - `user_tests/responses-streaming.test.ts`

- End‑to‑end examples:
  - `examples/openai-responses.ts`
  - `user_tests/responses-app-example.ts` (a small assistant with memory + middleware)

Run non‑live tests only (format translation):

```bash
npm test user_tests/responses-real-world.test.ts -- --grep "Format Translation"
```

---

## Migration tips

- Start by switching the endpoint to `/v1/responses` and split your prompt into `instructions` + `input`.
- If you currently manage chat history, switch to `store: true` and pass `previous_response_id` between turns.
- Move structured outputs from `response_format` → `text.format`.
- Keep function tools; adopt built‑in tools as needed.

---

## FAQ

- **Do I need to change my edit logic?**
  No. The `editFunction` continues to work on the universal request.

- **How is streaming handled?**
  The bridge relays provider SSE as-is. Parse events client-side as needed.

- **Can I mix built-in tools and functions?**
  Yes. Built-in tools are preserved; function tools are optionally extracted into `universal.tools` and reconstructed.

- **Is this backward compatible?**
  Yes. Chat Completions remain supported; you can adopt Responses incrementally.
