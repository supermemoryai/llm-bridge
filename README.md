# 🌉 LLM Bridge

**The Universal Translation Layer for Large Language Model APIs**

LLM Bridge is a powerful TypeScript library that provides seamless translation between different LLM provider APIs (OpenAI Chat Completions, OpenAI Responses API, Anthropic Claude, Google Gemini) while preserving **zero data loss** and enabling perfect reconstruction of original requests.

[![Tests](https://img.shields.io/badge/tests-355%20passing-brightgreen)](./test)
[![Coverage](https://img.shields.io/badge/coverage-comprehensive-green)](./test)

## 🚀 Why LLM Bridge Exists

### The Problem
When building Infinite Chat API, we needed a way to create a proxy that supports multiple LLM providers.
However, this is a difficult challenge, as I wrote in this blog post: [The API layer for using intelligence is completely broken.](https://x.com/DhravyaShah/status/1941272729552027932).

The particular challenges are in:
- Manipulating and creating proxies for different LLM providers
- Multi-modality
- Tool call chains
- Error handling


### The Solution
LLM Bridge provides a **universal format** that acts as a common language between all major LLM providers, enabling:

✅ **Perfect Translation** - Convert between OpenAI, Anthropic, Google, and OpenAI Responses API formats  
✅ **Zero Data Loss** - Every field is preserved with `_original` reconstruction  
✅ **Streaming Support** - Parse and emit SSE streams across all providers  
✅ **Extended Thinking** - Anthropic thinking blocks, Google thought parts, OpenAI reasoning  
✅ **Structured Output** - JSON schema response formats across all providers  
✅ **Multimodal Support** - Images, documents, and rich content across providers  
✅ **Tool Calling** - Function calling translation between different formats  
✅ **Error Handling** - Unified error types with provider-specific translation  
✅ **Type Safety** - Full TypeScript support with strict typing  

## 📦 Installation

```bash
npm install llm-bridge
```

## 🔧 Quick Start

### Basic Usage

```typescript
import { toUniversal, fromUniversal, translateBetweenProviders } from 'llm-bridge'

// Convert OpenAI request to universal format
const openaiRequest = {
  model: "gpt-4o",
  messages: [
    { role: "system", content: "You are a helpful assistant" },
    { role: "user", content: "Hello!" }
  ],
  temperature: 0.7,
  max_tokens: 1000
}

const universal = toUniversal("openai", openaiRequest)
console.log(universal.provider) // "openai"
console.log(universal.model)    // "gpt-4o"
console.log(universal.system)   // "You are a helpful assistant"

// Convert universal format back to any provider
const anthropicRequest = fromUniversal("anthropic", universal)
const googleRequest = fromUniversal("google", universal)

// Or translate directly between providers
const anthropicRequest2 = translateBetweenProviders("openai", "anthropic", openaiRequest)
```

### OpenAI Responses API

```typescript
// Convert OpenAI Responses API format
const responsesRequest = {
  model: "gpt-4o",
  input: [
    { role: "user", content: "What is the weather?" }
  ],
  tools: [
    { type: "function", name: "get_weather", parameters: { type: "object", properties: { location: { type: "string" } } } }
  ],
  max_output_tokens: 1000
}

const universal = toUniversal("openai-responses", responsesRequest)
const anthropicRequest = fromUniversal("anthropic", universal)
```

### Streaming

```typescript
import { parseOpenAIStream, emitAnthropicStream } from 'llm-bridge'

// Parse an OpenAI SSE stream into universal events
const universalEvents = parseOpenAIStream(openaiSSEStream)

// Re-emit as Anthropic SSE format
const anthropicStream = emitAnthropicStream(universalEvents)

// Or use the handler for full stream translation
import { handleUniversalStreamRequest } from 'llm-bridge'

const outputStream = handleUniversalStreamRequest(
  inputStream,
  "openai",    // source provider
  "anthropic", // target provider
  async (event) => event // optional transform
)
```

### Extended Thinking

```typescript
// Anthropic extended thinking
const anthropicRequest = {
  model: "claude-sonnet-4-20250514",
  max_tokens: 16000,
  thinking: { type: "enabled", budget_tokens: 10000 },
  messages: [{ role: "user", content: "Solve this complex problem..." }]
}

const universal = toUniversal("anthropic", anthropicRequest)
console.log(universal.thinking) // { enabled: true, budget_tokens: 10000 }

// Convert to Google format with thinking
const googleRequest = fromUniversal("google", universal)
// Includes thinkingConfig: { thinkingBudget: 10000 }
```

### Structured Output

```typescript
// OpenAI structured output
const openaiRequest = {
  model: "gpt-4o",
  messages: [{ role: "user", content: "Extract the name and age" }],
  response_format: {
    type: "json_schema",
    json_schema: {
      name: "person",
      schema: { type: "object", properties: { name: { type: "string" }, age: { type: "number" } } }
    }
  }
}

const universal = toUniversal("openai", openaiRequest)
// universal.structured_output contains the normalized schema

// Convert to Google format
const googleRequest = fromUniversal("google", universal)
// Includes generationConfig: { responseMimeType: "application/json", responseSchema: {...} }
```

### Perfect Reconstruction

```typescript
// Round-trip conversion with zero data loss
const original = { /* your OpenAI request */ }
const universal = toUniversal("openai", original)
const reconstructed = fromUniversal("openai", universal)

console.log(reconstructed === original) // Perfect equality!
```

## 🎯 Core Features

### 1. **Universal Format Translation**

LLM Bridge converts between provider-specific formats through a universal intermediate format:

```
OpenAI Chat ←→ Universal ←→ Anthropic
     ↕                        ↕
OpenAI Responses ←→ Universal ←→ Google
```

### 2. **Supported Providers**

| Provider | Format | Features |
|----------|--------|----------|
| **OpenAI Chat Completions** | `openai` | Messages, tools, developer role, reasoning_effort, structured output |
| **OpenAI Responses API** | `openai-responses` | Input items, reasoning config, built-in tools (web_search, file_search) |
| **Anthropic Claude** | `anthropic` | Messages, tools, extended thinking, cache_control, URL images |
| **Google Gemini** | `google` | Contents, function declarations, thinkingConfig, structured output |

### 3. **Streaming Support**

Parse and emit Server-Sent Events (SSE) streams for all providers:

- **Parsers**: Convert provider SSE streams → universal stream events
- **Emitters**: Convert universal stream events → provider SSE streams
- **Handler**: Full stream translation pipeline with optional transforms

### 4. **Multimodal Content Support**

Handle images and documents seamlessly across providers:

```typescript
// OpenAI format with image
const openaiMultimodal = {
  model: "gpt-4o",
  messages: [{
    role: "user",
    content: [
      { type: "text", text: "What's in this image?" },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,..." } }
    ]
  }]
}

// Translate to Anthropic (base64 source) or Google (inlineData)
const anthropicRequest = translateBetweenProviders("openai", "anthropic", openaiMultimodal)
const googleRequest = translateBetweenProviders("openai", "google", openaiMultimodal)
```

### 5. **Function/Tool Calling Translation**

Seamlessly translate tool calls between different provider formats:

```typescript
const openaiWithTools = {
  model: "gpt-4o",
  messages: [
    {
      role: "assistant",
      tool_calls: [{
        id: "call_123",
        type: "function",
        function: { name: "get_weather", arguments: '{"location": "SF"}' }
      }]
    },
    {
      role: "tool",
      content: '{"temperature": 72}',
      tool_call_id: "call_123"
    }
  ],
  tools: [{
    type: "function",
    function: {
      name: "get_weather",
      description: "Get weather info",
      parameters: { type: "object", properties: { location: { type: "string" } } }
    }
  }]
}

// Translate to Google Gemini (functionCall/functionResponse)
const geminiRequest = translateBetweenProviders("openai", "google", openaiWithTools)

// Translate to Anthropic (tool_use/tool_result blocks)
const anthropicRequest = translateBetweenProviders("openai", "anthropic", openaiWithTools)
```

### 6. **Error Handling & Translation**

Unified error handling with provider-specific error translation:

```typescript
import { buildUniversalError, translateError } from 'llm-bridge'

const error = buildUniversalError("rate_limit_error", "Rate limit exceeded", "openai", { retryAfter: 60 })

const anthropicError = translateError(error.universal, "anthropic")
const googleError = translateError(error.universal, "google")
```

### 7. **Provider Detection**

Automatically detect which provider format you're working with:

```typescript
import { detectProvider } from 'llm-bridge'

detectProvider("https://api.openai.com/v1/chat/completions", body)  // "openai"
detectProvider("https://api.anthropic.com/v1/messages", body)       // "anthropic"
detectProvider("https://generativelanguage.googleapis.com/...", body) // "google"
detectProvider("https://api.openai.com/v1/responses", body)         // "openai-responses"
```

## 🔌 API Reference

### Core Functions

- `toUniversal(provider, body)` - Convert provider format to universal
- `fromUniversal(provider, universal)` - Convert universal to provider format
- `translateBetweenProviders(from, to, body)` - Direct provider-to-provider translation
- `detectProvider(url, body)` - Auto-detect provider from URL and request format

### Streaming Functions

- `parseOpenAIStream(stream)` - Parse OpenAI Chat Completions SSE stream
- `parseAnthropicStream(stream)` - Parse Anthropic Messages SSE stream
- `parseGoogleStream(stream)` - Parse Google Gemini SSE stream
- `parseOpenAIResponsesStream(stream)` - Parse OpenAI Responses API SSE stream
- `emitOpenAIStream(events)` - Emit OpenAI SSE format
- `emitAnthropicStream(events)` - Emit Anthropic SSE format
- `emitGoogleStream(events)` - Emit Google SSE format
- `handleUniversalStreamRequest(stream, source, target, transform?)` - Full stream translation pipeline

### Utility Functions

- `getModelDetails(model)` - Get model information and capabilities
- `getModelCosts(model)` - Get pricing information for model
- `countUniversalTokens(universal)` - Estimate token usage
- `createObservabilityData(universal)` - Generate telemetry data

### Error Handling

- `buildUniversalError(type, message, provider, options)` - Create universal error
- `translateError(error, targetProvider)` - Translate error between providers
- `parseProviderError(error, provider)` - Parse provider-specific errors

## 🧪 Testing

Run the comprehensive test suite:

```bash
npm test
```

Our test suite includes:
- ✅ 355+ passing tests
- ✅ Provider format conversion (OpenAI, Anthropic, Google, OpenAI Responses)
- ✅ Cross-provider round-trip translation
- ✅ Streaming parser and emitter tests
- ✅ Extended thinking and structured output
- ✅ Multimodal content handling
- ✅ Tool calling lifecycle across all providers
- ✅ Error handling and validation
- ✅ Edge cases and malformed input
- ✅ Type safety verification

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙋‍♂️ Support

- 📖 [Documentation](./docs)
- 🐛 [Report Issues](https://github.com/user/llm-bridge/issues)
- 💬 [Discussions](https://github.com/user/llm-bridge/discussions)

---

**Made with ❤️ by [team supermemory](https://supermemory.ai)**
