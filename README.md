# 🌉 LLM Bridge

**The Universal Translation Layer for Large Language Model APIs**

LLM Bridge is a powerful TypeScript library that provides seamless translation between different LLM provider APIs (OpenAI, Anthropic Claude, Google Gemini) while preserving **zero data loss** and enabling perfect reconstruction of original requests.

[![Tests](https://img.shields.io/badge/tests-146%20passing-brightgreen)](./test)
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

✅ **Perfect Translation** - Convert between OpenAI, Anthropic, and Google formats  
✅ **Zero Data Loss** - Every field is preserved with `_original` reconstruction  
✅ **Multimodal Support** - Images, documents, and rich content across providers  
✅ **Tool Calling** - Function calling translation between different formats  
✅ **Error Handling** - Unified error types with provider-specific translation  
✅ **Type Safety** - Full TypeScript support with strict typing  

## 📦 Installation

```bash
npm install llm-bridge
# or
yarn add llm-bridge
# or
pnpm add llm-bridge
```

## 🔧 Quick Start

### Basic Usage

```typescript
import { toUniversal, fromUniversal, translateBetweenProviders } from 'llm-bridge'

// Convert OpenAI request to universal format
const openaiRequest = {
  model: "gpt-4",
  messages: [
    { role: "system", content: "You are a helpful assistant" },
    { role: "user", content: "Hello!" }
  ],
  temperature: 0.7,
  max_tokens: 1000
}

const universal = toUniversal("openai", openaiRequest)
console.log(universal.provider) // "openai"
console.log(universal.model)    // "gpt-4"
console.log(universal.system)   // "You are a helpful assistant"

// Convert universal format back to any provider
const anthropicRequest = fromUniversal("anthropic", universal)
const googleRequest = fromUniversal("google", universal)

// Or translate directly between providers
const anthropicRequest2 = translateBetweenProviders("openai", "anthropic", openaiRequest)
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
OpenAI ←→ Universal ←→ Anthropic
  ↕                    ↕
Google ←→ Universal ←→ Custom
```

### 2. **Multimodal Content Support**

Handle images and documents seamlessly across providers:

```typescript
// OpenAI format with base64 image
const openaiMultimodal = {
  model: "gpt-4-vision-preview",
  messages: [{
    role: "user",
    content: [
      { type: "text", text: "What's in this image?" },
      { 
        type: "image_url", 
        image_url: { 
          url: "data:image/jpeg;base64,iVBORw0KGgoAAAA...",
          detail: "high"
        }
      }
    ]
  }]
}

// Translate to Anthropic format
const anthropicMultimodal = translateBetweenProviders("openai", "anthropic", openaiMultimodal)

// Result: Anthropic-compatible format
// {
//   model: "gpt-4-vision-preview",
//   messages: [{
//     role: "user", 
//     content: [
//       { type: "text", text: "What's in this image?" },
//       { 
//         type: "image",
//         source: {
//           type: "base64",
//           media_type: "image/jpeg", 
//           data: "iVBORw0KGgoAAAA..."
//         }
//       }
//     ]
//   }]
// }
```

### 3. **Function/Tool Calling Translation**

Seamlessly translate tool calls between different provider formats:

```typescript
// OpenAI tool calling format
const openaiWithTools = {
  model: "gpt-4",
  messages: [
    {
      role: "assistant",
      tool_calls: [{
        id: "call_123",
        type: "function", 
        function: {
          name: "get_weather",
          arguments: '{"location": "San Francisco"}'
        }
      }]
    },
    {
      role: "tool",
      content: '{"temperature": 72, "condition": "sunny"}',
      tool_call_id: "call_123"
    }
  ],
  tools: [{
    type: "function",
    function: {
      name: "get_weather",
      description: "Get weather information",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string" }
        }
      }
    }
  }]
}

// Translate to Google Gemini format
const geminiWithTools = translateBetweenProviders("openai", "google", openaiWithTools)

// Result: Google-compatible tool calling format
// {
//   contents: [
//     {
//       role: "model",
//       parts: [{
//         functionCall: {
//           name: "get_weather", 
//           args: { location: "San Francisco" }
//         }
//       }]
//     },
//     {
//       role: "user",
//       parts: [{
//         functionResponse: {
//           name: "get_weather",
//           response: { temperature: 72, condition: "sunny" }
//         }
//       }]
//     }
//   ],
//   tools: [...]
// }
```

### 4. **Error Handling & Translation**

Unified error handling with provider-specific error translation:

```typescript
import { buildUniversalError, translateError } from 'llm-bridge'

// Create a universal error
const error = buildUniversalError(
  "rate_limit_error", 
  "Rate limit exceeded",
  "openai",
  { retryAfter: 60 }
)

// Translate to different provider formats
const anthropicError = translateError(error.universal, "anthropic")
const googleError = translateError(error.universal, "google")

// Each provider gets the appropriate error format:
// OpenAI: { error: { type: "insufficient_quota", message: "Rate limit exceeded" } }
// Anthropic: { type: "error", error: { type: "rate_limit_error", message: "Rate limit exceeded" } }  
// Google: { error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Rate limit exceeded" } }
```

### 5. **Provider Detection**

Automatically detect which provider format you're working with:

```typescript
import { detectProvider } from 'llm-bridge'

const provider1 = detectProvider({ model: "gpt-4", messages: [...] })        // "openai"
const provider2 = detectProvider({ model: "claude-3-opus", max_tokens: 100 }) // "anthropic"  
const provider3 = detectProvider({ contents: [...] })                        // "google"
```

## 🏗️ Advanced Usage

### Middleware Pattern

```typescript
import { toUniversal, fromUniversal } from 'llm-bridge'

// Create a universal middleware
async function universalLLMMiddleware(request: any, targetProvider: string) {
  // Convert any provider format to universal
  const sourceProvider = detectProvider(request)
  const universal = toUniversal(sourceProvider, request)
  
  // Apply universal transformations
  universal.temperature = Math.min(universal.temperature || 0, 1)
  universal.max_tokens = Math.min(universal.max_tokens || 1000, 4000)
  
  // Convert to target provider
  const targetRequest = fromUniversal(targetProvider, universal)
  
  // Make the API call
  const response = await callProvider(targetProvider, targetRequest)
  
  return response
}

// Use with any provider
const result1 = await universalLLMMiddleware(openaiRequest, "anthropic")
const result2 = await universalLLMMiddleware(anthropicRequest, "google")
```

### Load Balancing & Fallbacks

```typescript
async function robustLLMCall(request: any) {
  const providers = ["openai", "anthropic", "google"]
  
  for (const provider of providers) {
    try {
      const universal = toUniversal(detectProvider(request), request)
      const providerRequest = fromUniversal(provider, universal)
      
      return await callProvider(provider, providerRequest)
    } catch (error) {
      console.log(`${provider} failed, trying next provider...`)
      continue
    }
  }
  
  throw new Error("All providers failed")
}
```

### Cost Optimization

```typescript
import { getModelCosts, countUniversalTokens } from 'llm-bridge'

function optimizeModelChoice(request: any) {
  const universal = toUniversal(detectProvider(request), request)
  const tokens = countUniversalTokens(universal)
  
  const models = [
    { provider: "openai", model: "gpt-4o-mini" },
    { provider: "anthropic", model: "claude-3-haiku" },
    { provider: "google", model: "gemini-1.5-flash" }
  ]
  
  // Calculate cost for each model
  const costs = models.map(({ provider, model }) => {
    const modelCosts = getModelCosts(model)
    const inputCost = (tokens.inputTokens / 1000) * modelCosts.inputCostPer1K
    const outputCost = (tokens.outputTokens / 1000) * modelCosts.outputCostPer1K
    
    return { provider, model, totalCost: inputCost + outputCost }
  })
  
  // Return cheapest option
  return costs.sort((a, b) => a.totalCost - b.totalCost)[0]
}
```

## 🔌 API Reference

### Core Functions

- `toUniversal(provider, body)` - Convert provider format to universal
- `fromUniversal(provider, universal)` - Convert universal to provider format  
- `translateBetweenProviders(from, to, body)` - Direct provider-to-provider translation
- `detectProvider(body)` - Auto-detect provider from request format

### Utility Functions

- `getModelDetails(model)` - Get model information and capabilities
- `getModelCosts(model)` - Get pricing information for model
- `countUniversalTokens(universal)` - Estimate token usage
- `createObservabilityData(universal)` - Generate telemetry data

### Error Handling

- `buildUniversalError(type, message, provider, options)` - Create universal error
- `translateError(error, targetProvider)` - Translate error between providers
- `parseProviderError(error, provider)` - Parse provider-specific errors

## 🎨 Examples

### Multi-Provider Chat Application

```typescript
import { translateBetweenProviders, detectProvider } from 'llm-bridge'

class UniversalChatBot {
  async chat(message: string, preferredProvider = "openai") {
    const request = {
      model: this.getModelForProvider(preferredProvider),
      messages: [
        { role: "system", content: "You are a helpful assistant" },
        { role: "user", content: message }
      ],
      temperature: 0.7
    }
    
    try {
      // Try preferred provider first
      return await this.callProvider(preferredProvider, request)
    } catch (error) {
      // Fallback to other providers
      const fallbacks = ["anthropic", "google", "openai"]
        .filter(p => p !== preferredProvider)
      
      for (const provider of fallbacks) {
        try {
          const translated = translateBetweenProviders(
            preferredProvider, 
            provider, 
            request
          )
          return await this.callProvider(provider, translated)
        } catch (fallbackError) {
          continue
        }
      }
      
      throw new Error("All providers failed")
    }
  }
  
  private getModelForProvider(provider: string) {
    const models = {
      openai: "gpt-4",
      anthropic: "claude-3-opus-20240229", 
      google: "gemini-1.5-pro"
    }
    return models[provider] || "gpt-4"
  }
}
```

### Image Analysis Across Providers

```typescript
async function analyzeImage(imageUrl: string, provider: string) {
  // Create OpenAI-style request
  const request = {
    model: "gpt-4-vision-preview", 
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "Analyze this image in detail" },
        { type: "image_url", image_url: { url: imageUrl } }
      ]
    }]
  }
  
  // Translate to target provider
  const translated = translateBetweenProviders("openai", provider, request)
  
  // Call the provider
  return await callProvider(provider, translated)
}

// Works with any provider
const openaiResult = await analyzeImage(imageUrl, "openai")
const claudeResult = await analyzeImage(imageUrl, "anthropic") 
const geminiResult = await analyzeImage(imageUrl, "google")
```

## 🧪 Testing

Run the comprehensive test suite:

```bash
npm test
```

Our test suite includes:
- ✅ 146 passing tests
- ✅ Provider format conversion
- ✅ Universal format translation
- ✅ Multimodal content handling
- ✅ Tool calling translation
- ✅ Error handling and translation
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