/**
 * Basic Translation Example
 *
 * Demonstrates how to translate between different LLM provider formats
 * using LLM Bridge's core translation functions.
 */

import { toUniversal, fromUniversal, translateBetweenProviders } from "../src"

// Example 1: OpenAI to Universal to Anthropic
console.log("Example 1: OpenAI -> Universal -> Anthropic")

const openaiRequest = {
  model: "gpt-4",
  messages: [
    { role: "system", content: "You are a helpful AI assistant" },
    { role: "user", content: "Explain quantum computing in simple terms" },
  ],
  temperature: 0.7,
  max_tokens: 500,
} as any

console.log("Original OpenAI Request:")
console.log(JSON.stringify(openaiRequest, null, 2))

// Step 1: Convert to universal format
const universal = toUniversal("openai", openaiRequest)
console.log("\nUniversal Format:")
console.log(`Provider: ${universal.provider}`)
console.log(`Model: ${universal.model}`)
console.log(`System: ${typeof universal.system === "string" ? universal.system : universal.system?.content}`)
console.log(`Messages: ${universal.messages.length} messages`)
console.log(`Temperature: ${universal.temperature}`)

// Step 2: Convert to Anthropic format
const anthropicRequest = fromUniversal("anthropic", { ...universal, provider: "anthropic" } as any)
console.log("\nAnthropic Format:")
console.log(JSON.stringify(anthropicRequest, null, 2))

// Example 2: Direct provider-to-provider translation
console.log("\n\nExample 2: Direct Translation (OpenAI -> Google)")

const googleRequest = translateBetweenProviders("openai", "google", openaiRequest)
console.log("Google Gemini Format:")
console.log(JSON.stringify(googleRequest, null, 2))

// Example 3: Multimodal content translation
console.log("\n\nExample 3: Multimodal Content Translation")

const multimodalRequest = {
  model: "gpt-4o",
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: "What do you see in this image?" },
        {
          type: "image_url",
          image_url: {
            url: "data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAA...",
            detail: "high",
          },
        },
      ],
    },
  ],
} as any

const multimodalAnthropic = translateBetweenProviders("openai", "anthropic", multimodalRequest)
console.log("Multimodal Anthropic Format:")
console.log(JSON.stringify(multimodalAnthropic, null, 2))

// Example 4: OpenAI Responses API translation
console.log("\n\nExample 4: OpenAI Responses API -> Anthropic")

const responsesRequest = {
  model: "gpt-4o",
  input: [
    { role: "user", content: "What is the meaning of life?" },
  ],
  temperature: 0.5,
} as any

const responsesUniversal = toUniversal("openai-responses", responsesRequest)
console.log("Universal from Responses API:")
console.log(`Provider: ${responsesUniversal.provider}`)
console.log(`Messages: ${responsesUniversal.messages.length}`)

const responsesToAnthropic = translateBetweenProviders("openai-responses", "anthropic", responsesRequest)
console.log("Anthropic Format:")
console.log(JSON.stringify(responsesToAnthropic, null, 2))

// Example 5: Perfect reconstruction
console.log("\n\nExample 5: Perfect Reconstruction (Zero Data Loss)")

const originalRequest = {
  model: "gpt-4-turbo-preview",
  messages: [{ role: "user", content: "Hello world" }],
  temperature: 0.5,
  response_format: { type: "json_object" },
  seed: 12345,
  top_p: 0.9,
} as any

const universalFormat = toUniversal("openai", originalRequest)
const reconstructed = fromUniversal("openai", universalFormat)

console.log("Perfect reconstruction verified:")
console.log("seed preserved:", (reconstructed as any).seed === 12345)
console.log("top_p preserved:", (reconstructed as any).top_p === 0.9)

console.log("\nBasic translation examples completed!")
