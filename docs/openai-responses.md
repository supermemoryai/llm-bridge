## OpenAI Responses API Support

This library now natively understands OpenAI's Responses API request shape and can emit Responses bodies when targeting the Responses endpoint. It remains fully stateless: it does not persist any conversation state; it simply translates requests to a universal format and back, passing through OpenAI state hints like `store` and `previous_response_id` unchanged.

### What’s supported

- **Request parsing**: Converts a Responses API request (`model`, `instructions`, `input`, etc.) into the universal request shape.
- **Emission to Responses**: Emits a valid Responses create body from the universal request.
- **State hints pass-through**: Preserves and forwards Responses state fields such as `store` and `previous_response_id` without altering them.
- **Tools**:
  - Custom function tools map to/from `universal.tools` (JSON Schema based).
  - Built-in tools (e.g., `web_search_preview`, `file_search`, `code_interpreter`, etc.) are preserved and round-tripped via `provider_params.responses_builtin_tools`.
- **Streaming**: Universal `stream: true|false` maps to Responses `stream` with the same boolean.
- **Token limits**: Universal `max_tokens` maps to Responses `max_output_tokens` when emitting.

### Shape selection (when we emit Responses vs Chat)

- If your target URL includes `/v1/responses`, the handler automatically annotates the universal request so that the OpenAI formatter emits a **Responses** body.
- Alternatively, you can force Responses emission by setting `provider_params.openai_target = "responses"` on the universal request before calling `fromUniversal("openai", ...)`.

### Request field mapping (high level)

- **instructions** ↔ universal `system` (string)
- **input** ↔ universal `messages` (roles: `user` | `system` | `developer`)
- **max_output_tokens** ↔ universal `max_tokens`
- **temperature/top_p** ↔ universal `temperature` / `top_p`
- **tools**:
  - `type: "function"` tools ↔ `universal.tools`
  - built-in tools (e.g., `web_search_preview`) ↔ `universal.provider_params.responses_builtin_tools`
- **tool_choice**:
  - `"auto" | "none" | "required"` ↔ same in universal `tool_choice`
  - `{ type: "function", name: "..." }` ↔ universal `tool_choice = { name }`
- **state hints** (pass-through in `provider_params`):
  - `store`, `previous_response_id`, `include`, `text`, `parallel_tool_calls`, `service_tier`, `truncation`, `background`, `user`, `metadata`

### Using the handler with Responses endpoint

When you call the universal handler against `/v1/responses`, it emits a Responses body and forwards `store` and `previous_response_id`:

```ts
import { handleUniversalRequest } from "llm-bridge"

async function editFunction(request) {
  // Keep it stateless: just pass through state hints
  return {
    request: {
      ...request,
      provider_params: {
        ...(request.provider_params ?? {}),
        previous_response_id: "resp_123",
        store: true,
      },
    },
    contextModified: false,
  }
}

const { response } = await handleUniversalRequest(
  "https://api.openai.com/v1/responses",
  {
    model: "gpt-4o",
    input: [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "Hello" }],
      },
    ],
    store: true,
  },
  { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  "POST",
  editFunction,
)
```

### Using the translators directly

You can work with the translators without the handler.

```ts
import { toUniversal, fromUniversal } from "llm-bridge"

// 1) Responses -> Universal
const responsesReq = {
  model: "gpt-4o",
  instructions: "You are helpful.",
  input: [
    {
      type: "message",
      role: "user",
      content: [
        { type: "input_text", text: "Hi" },
        {
          type: "input_image",
          detail: "auto",
          image_url: "https://example.com/image.png",
        },
      ],
    },
  ],
  store: true,
  previous_response_id: "resp_abc",
  tools: [
    { type: "function", name: "get_weather", parameters: { type: "object" } },
    { type: "web_search_preview" }, // built-in tool
  ],
}

const universal = toUniversal("openai", responsesReq)

// 2) Universal -> Responses
// - Built-in tools are preserved via provider_params.responses_builtin_tools
// - state hints are passed through
const emitted = fromUniversal("openai", {
  ...universal,
  provider_params: {
    ...(universal.provider_params ?? {}),
    openai_target: "responses", // force Responses emission if needed
  },
})
```

### Built-in tools vs custom function tools

- Custom function tools are always available on `universal.tools` with their JSON Schema `parameters`.
- Built-in tools are available in `universal.provider_params.responses_builtin_tools` and round-trip back to Responses `tools`.

### Notes

- The library remains stateless: it never stores Responses; it only forwards `store` and `previous_response_id` values from the request.
- You can continue using Chat Completions. The translator will emit Chat bodies unless the target URL is `/v1/responses` or you set `provider_params.openai_target = "responses"`.
- For more on the Responses API, see the official docs: [Responses API](https://platform.openai.com/docs/api-reference/responses).
