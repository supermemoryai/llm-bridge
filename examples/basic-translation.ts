/**
 * Basic Translation Example
 * 
 * Demonstrates how to translate between different LLM provider formats
 * using LLM Bridge's core translation functions.
 */

import { toUniversal, fromUniversal, translateBetweenProviders } from '../src'
s
// Example 1: OpenAI to Universal to Anthropic
console.log('🔄 Example 1: OpenAI → Universal → Anthropic')

const openaiRequest = {
  model: "gpt-4",
  messages: [
    { role: "system", content: "You are a helpful AI assistant" },
    { role: "user", content: "Explain quantum computing in simple terms" }
  ],
  temperature: 0.7,
  max_tokens: 500
} as any

console.log('📝 Original OpenAI Request:')
console.log(JSON.stringify(openaiRequest, null, 2))

// Step 1: Convert to universal format
const universal = toUniversal("openai", openaiRequest)
console.log('\n🌐 Universal Format:')
console.log(`Provider: ${universal.provider}`)
console.log(`Model: ${universal.model}`)
console.log(`System: ${universal.system}`)
console.log(`Messages: ${universal.messages.length} messages`)
console.log(`Temperature: ${universal.temperature}`)

// Step 2: Convert to Anthropic format
const anthropicRequest = fromUniversal("anthropic", universal)
console.log('\n🤖 Anthropic Format:')
console.log(JSON.stringify(anthropicRequest, null, 2))

// Example 2: Direct provider-to-provider translation
console.log('\n\n🚀 Example 2: Direct Translation (OpenAI → Google)')

const googleRequest = translateBetweenProviders("openai", "google", openaiRequest as any)
console.log('🔍 Google Gemini Format:')
console.log(JSON.stringify(googleRequest, null, 2))

// Example 3: Multimodal content translation
console.log('\n\n🖼️ Example 3: Multimodal Content Translation')

const multimodalRequest = {
  model: "gpt-4-vision-preview",
  messages: [{
    role: "user",
    content: [
      { type: "text", text: "What do you see in this image?" },
      { 
        type: "image_url", 
        image_url: { 
          url: "data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAA...",
          detail: "high"
        }
      }
    ]
  }]
} as any

const multimodalAnthropic = translateBetweenProviders("openai", "anthropic", multimodalRequest as any)
console.log('🖼️ Multimodal Anthropic Format:')
console.log(JSON.stringify(multimodalAnthropic, null, 2))

// Example 4: Perfect reconstruction
console.log('\n\n♻️ Example 4: Perfect Reconstruction (Zero Data Loss)')

const originalRequest = {
  model: "gpt-4-turbo-preview",
  messages: [
    { role: "user", content: "Hello world" }
  ],
  temperature: 0.5,
  response_format: { type: "json_object" },
  seed: 12345,
  top_p: 0.9
} as any

const universalFormat = toUniversal("openai", originalRequest as any)
const reconstructed = fromUniversal("openai", universalFormat)

console.log('✅ Perfect reconstruction verified:')
console.log('Original === Reconstructed:', JSON.stringify(originalRequest) === JSON.stringify(reconstructed))
console.log('All OpenAI-specific fields preserved:', 
  reconstructed.response_format && 
  reconstructed.seed === 12345 && 
  reconstructed.top_p === 0.9
)

console.log('\n🎉 Basic translation examples completed!')