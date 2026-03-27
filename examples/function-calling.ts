/**
 * Function Calling Translation Example
 *
 * Demonstrates how to translate function/tool calling between different
 * LLM providers using LLM Bridge's universal format.
 */

import { toUniversal, fromUniversal, translateBetweenProviders } from "../src"

// Example tool definitions
const weatherTool = {
  name: "get_weather",
  description: "Get current weather information for a location",
  parameters: {
    type: "object",
    properties: {
      location: {
        type: "string",
        description: "The city and state, e.g. San Francisco, CA",
      },
      unit: {
        type: "string",
        enum: ["celsius", "fahrenheit"],
        description: "Temperature unit",
      },
    },
    required: ["location"],
  },
}

const calculatorTool = {
  name: "calculate",
  description: "Perform mathematical calculations",
  parameters: {
    type: "object",
    properties: {
      expression: {
        type: "string",
        description: "Mathematical expression to evaluate",
      },
    },
    required: ["expression"],
  },
}

console.log("Function Calling Translation Demo\n")

// Example 1: OpenAI Tool Calling Format
console.log("Example 1: OpenAI Tool Calling Format")

const openaiToolRequest = {
  model: "gpt-4",
  messages: [
    {
      role: "user",
      content: "What's the weather like in San Francisco and what's 15 + 27?",
    },
    {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "call_weather_123",
          type: "function",
          function: {
            name: "get_weather",
            arguments: JSON.stringify({ location: "San Francisco, CA", unit: "fahrenheit" }),
          },
        },
        {
          id: "call_calc_456",
          type: "function",
          function: {
            name: "calculate",
            arguments: JSON.stringify({ expression: "15 + 27" }),
          },
        },
      ],
    },
    {
      role: "tool",
      content: JSON.stringify({ temperature: 72, condition: "sunny", humidity: 65 }),
      tool_call_id: "call_weather_123",
    },
    {
      role: "tool",
      content: JSON.stringify({ result: 42 }),
      tool_call_id: "call_calc_456",
    },
  ],
  tools: [
    { type: "function", function: weatherTool },
    { type: "function", function: calculatorTool },
  ],
}

// Convert to universal format
const universal = toUniversal("openai", openaiToolRequest as any)
console.log("\nUniversal Format:")
console.log(`Tools: ${universal.tools?.length || 0}`)
console.log(`Messages: ${universal.messages.length}`)
console.log(`Tool calls in assistant message: ${universal.messages[1].tool_calls?.length || 0}`)

// Example 2: Translate to Anthropic Format
console.log("\nExample 2: Translation to Anthropic Format")

const anthropicFormat = translateBetweenProviders("openai", "anthropic", openaiToolRequest as any)
console.log("Anthropic Tool Calling Format:")
console.log(JSON.stringify(anthropicFormat, null, 2))

// Example 3: Translate to Google Format
console.log("\nExample 3: Translation to Google Format")

const googleFormat = translateBetweenProviders("openai", "google", openaiToolRequest as any)
console.log("Google Function Calling Format:")
console.log(JSON.stringify(googleFormat, null, 2))

// Example 4: Anthropic to OpenAI Translation
console.log("\nExample 4: Anthropic -> OpenAI Translation")

const anthropicToolRequest = {
  model: "claude-sonnet-4-20250514",
  max_tokens: 1000,
  messages: [
    {
      role: "user",
      content: "Calculate the area of a circle with radius 5",
    },
    {
      role: "assistant",
      content: [
        {
          type: "text",
          text: "I'll help you calculate the area of a circle with radius 5.",
        },
        {
          type: "tool_use",
          id: "toolu_123",
          name: "calculate",
          input: { expression: "3.14159 * 5 * 5" },
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "toolu_123",
          content: "78.54",
        },
      ],
    },
  ],
  tools: [
    {
      name: "calculate",
      description: "Perform mathematical calculations",
      input_schema: calculatorTool.parameters,
    },
  ],
}

const anthropicToOpenai = translateBetweenProviders("anthropic", "openai", anthropicToolRequest as any)
console.log("Anthropic -> OpenAI Translation:")
console.log(JSON.stringify(anthropicToOpenai, null, 2))

// Example 5: Google to Universal Translation
console.log("\nExample 5: Google -> Universal Translation")

const googleToolRequest = {
  contents: [
    {
      role: "user",
      parts: [{ text: "What's the weather in Tokyo?" }],
    },
    {
      role: "model",
      parts: [
        {
          functionCall: {
            name: "get_weather",
            args: { location: "Tokyo, Japan", unit: "celsius" },
          },
        },
      ],
    },
    {
      role: "user",
      parts: [
        {
          functionResponse: {
            name: "get_weather",
            response: { temperature: 18, condition: "cloudy", humidity: 80 },
          },
        },
      ],
    },
  ],
  tools: [
    {
      functionDeclarations: [
        {
          name: "get_weather",
          description: "Get weather information",
          parameters: weatherTool.parameters,
        },
      ],
    },
  ],
}

const googleUniversal = toUniversal("google", googleToolRequest as any)
console.log("Google -> Universal:")
console.log(`Tools: ${googleUniversal.tools?.length}`)
console.log(`Function calls: ${googleUniversal.messages[1].content.filter((c) => c.type === "tool_call").length}`)
console.log(`Function responses: ${googleUniversal.messages[2].content.filter((c) => c.type === "tool_result").length}`)

// Convert to other formats
fromUniversal("anthropic", { ...googleUniversal, provider: "anthropic" } as any)
fromUniversal("openai", { ...googleUniversal, provider: "openai" } as any)

console.log("\nSuccessful translations:")
console.log("   Google -> Anthropic: done")
console.log("   Google -> OpenAI: done")

// Example 6: Round-trip Verification
console.log("\nExample 6: Round-trip Verification")

const universal1 = toUniversal("openai", openaiToolRequest as any)
const reconstructed = fromUniversal("openai", universal1)

const toolCountMatches = openaiToolRequest.tools?.length === (reconstructed as any).tools?.length

console.log("Round-trip verification:")
console.log(`   Tool count matches: ${toolCountMatches}`)
console.log(`   Tool call IDs preserved: ${JSON.stringify(reconstructed).includes("call_weather_123")}`)

console.log("\nFunction calling translation examples completed!")
