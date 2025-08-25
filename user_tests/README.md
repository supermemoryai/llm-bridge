# User Tests - Real-World OpenAI Responses API Examples

This folder contains real-world tests and examples demonstrating how to use the llm-bridge library with OpenAI's Responses API.

## Prerequisites

1. **OpenAI API Key**: Set your API key as an environment variable:

   ```bash
   export OPENAI_API_KEY="sk-..."
   ```

2. **Enable Live Tests**: To run tests that make actual API calls:
   ```bash
   export RUN_LIVE_TESTS=true
   ```

## Test Files

### 1. `responses-real-world.test.ts`

Comprehensive tests demonstrating:

- Simple Responses API requests
- Stateful conversations with `previous_response_id`
- Context injection via middleware
- Structured outputs with `text.format`
- Memory injection patterns
- Token optimization middleware
- Content guardrails
- Cross-provider translation

### 2. `responses-streaming.test.ts`

Streaming-focused tests showing:

- Server-Sent Events (SSE) handling
- Stream processing with middleware
- Stream interruption/cancellation
- Retry patterns with state
- Conversation branching
- ZDR/encrypted reasoning

### 3. `responses-app-example.ts`

Complete application example featuring:

- `AIAssistant` class for conversational AI
- State management with `ConversationStore`
- Middleware pipeline (optimization, memory, safety)
- Multi-turn conversations
- Built-in tools usage
- Error handling

## Running the Tests

### Run All Tests (Including Mock Tests)

```bash
npm test user_tests/
```

### Run Only Format Translation Tests (No API Key Required)

```bash
npm test user_tests/responses-real-world.test.ts -- --grep "Format Translation"
```

### Run Live API Tests

```bash
# Set environment variables
export OPENAI_API_KEY="sk-..."
export RUN_LIVE_TESTS=true

# Run all live tests
npm test user_tests/

# Run specific test file
npm test user_tests/responses-real-world.test.ts

# Run specific test
npm test user_tests/responses-real-world.test.ts -- --grep "simple Responses API"
```

### Run the Example Application

```bash
# Make sure API key is set
export OPENAI_API_KEY="sk-..."

# Run the example
npx ts-node user_tests/responses-app-example.ts
```

## Key Features Demonstrated

### 1. Stateful Conversations

```typescript
const response = await handleUniversalRequest(
  "https://api.openai.com/v1/responses",
  {
    model: "gpt-4o-mini",
    input: "Continue our discussion",
    previous_response_id: "resp_abc123",
    store: true,
  },
  headers,
  "POST",
  editFunction,
)
```

### 2. Middleware Enhancement

```typescript
;async (universal) => {
  // Inject context
  const enhanced = {
    ...universal,
    system: universal.system + " Additional context here.",
    messages: [...contextMessages, ...universal.messages],
  }
  return { request: enhanced, contextModified: true }
}
```

### 3. Built-in Tools

```typescript
const request: OpenAIResponsesBody = {
  model: "gpt-4o-mini",
  input: "Search for information",
  tools: [{ type: "web_search_preview" }, { type: "file_search" }],
}
```

### 4. Streaming (OpenAI SDK)

```typescript
import OpenAI from "openai"
import { toUniversal, fromUniversal } from "../src/models"
import { OpenAIResponsesBody } from "../src/models/openai-responses-format"

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
const targetUrl = "https://api.openai.com/v1/responses"

const request: OpenAIResponsesBody = {
  model: "gpt-4o-mini",
  input: "Write a story",
  stream: true,
}

const universal = toUniversal("openai", request, targetUrl)
const stream = await client.responses.stream({
  model: universal.model,
  input: universal.messages[0].content[0].text!,
})

let text = ""
stream.on("event", (event) => {
  if (event.type === "response.output_text.delta") text += event.delta
})
await stream.done()
```

### 5. Cross-Provider Translation

```typescript
// Start with Responses format
const universal = toUniversal(
  "openai",
  responsesBody,
  "https://api.openai.com/v1/responses",
)

// Convert to Anthropic
universal.provider = "anthropic"
const anthropicBody = fromUniversal("anthropic", universal)

// Or to Google
universal.provider = "google"
const googleBody = fromUniversal("google", universal)
```

## Important Notes

1. **API Costs**: These tests make real API calls when `RUN_LIVE_TESTS=true`. Be aware of API usage costs.

2. **Rate Limits**: The tests include timeouts and may hit rate limits if run repeatedly.

3. **Model Availability**: Tests use `gpt-4o-mini` by default. Ensure you have access to this model.

4. **Responses API Access**: The OpenAI Responses API may require specific access. Check your OpenAI account.

5. **Test Isolation**: Each test creates its own conversation state. Tests can be run independently.

## Troubleshooting

### "Skipping live tests"

- Ensure both `OPENAI_API_KEY` and `RUN_LIVE_TESTS=true` are set

### API Errors

- Check your API key is valid
- Verify you have access to the Responses API
- Check rate limits and quotas

### Stream Tests Failing

- Some environments may not support streaming properly
- Try running tests individually

### Type Errors

- Run `npm run build` to ensure TypeScript compilation works
- Check imports are correct

## Contributing

When adding new tests:

1. Follow the existing pattern of checking `RUN_LIVE_TESTS`
2. Use appropriate timeouts for API calls
3. Include both live and mock test variants where possible
4. Document any special requirements or setup
