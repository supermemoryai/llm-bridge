import { test, expect, describe } from "vitest"
import { toUniversal, fromUniversal } from "../src/models"
import { translateBetweenProviders } from "../src/models/translate"
import { createSystemMessage, createUserMessage } from "../src/helpers/utils"
import type {
  OpenAIBody,
  AnthropicBody,
  GeminiBody,
} from "../src/types/providers"

describe("Universal Format Conversion", () => {
  describe("OpenAI to Universal", () => {
    test("should convert basic OpenAI chat request", () => {
      const openaiBody = {
        model: "gpt-4",
        messages: [
          { role: "system", content: "You are a helpful assistant" },
          { role: "user", content: "Hello, how are you?" },
          { role: "assistant", content: "I'm doing well, thank you!" },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }

      const universal = toUniversal("openai", openaiBody as OpenAIBody)

      expect(universal.provider).toBe("openai")
      expect(universal.model).toBe("gpt-4")
      expect(universal.temperature).toBe(0.7)
      expect(universal.max_tokens).toBe(1000)
      expect(universal.system).toBe("You are a helpful assistant")
      expect(universal.messages).toHaveLength(2)
      expect(universal.messages[0].role).toBe("user")
      expect(universal.messages[0].content[0].text).toBe("Hello, how are you?")
      expect(universal.messages[1].role).toBe("assistant")
      expect(universal.messages[1].content[0].text).toBe(
        "I'm doing well, thank you!",
      )
    })

    test("should handle multimodal content", () => {
      const openaiBody = {
        model: "gpt-4-vision-preview",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "What's in this image?" },
              {
                type: "image_url",
                image_url: {
                  url: "https://example.com/image.jpg",
                  detail: "high",
                },
              },
            ],
          },
        ],
      }

      const universal = toUniversal("openai", openaiBody as OpenAIBody)

      expect(universal.messages[0].content).toHaveLength(2)
      expect(universal.messages[0].content[0].type).toBe("text")
      expect(universal.messages[0].content[0].text).toBe(
        "What's in this image?",
      )
      expect(universal.messages[0].content[1].type).toBe("image")
      expect(universal.messages[0].content[1].media?.url).toBe(
        "https://example.com/image.jpg",
      )
      expect(universal.messages[0].content[1].media?.detail).toBe("high")
    })

    test("should handle tool calls", () => {
      const openaiBody = {
        model: "gpt-4",
        messages: [
          {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_123",
                type: "function",
                function: {
                  name: "get_weather",
                  arguments: '{"location": "San Francisco"}',
                },
              },
            ],
          },
          {
            role: "tool",
            content: '{"temperature": 72, "condition": "sunny"}',
            tool_call_id: "call_123",
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "get_weather",
              description: "Get weather information",
              parameters: {
                type: "object" as const,
                properties: {
                  location: { type: "string" as const },
                },
              },
            },
          },
        ],
      }

      const universal = toUniversal("openai", openaiBody as OpenAIBody)

      // Check tool calls
      expect(universal.messages[0].tool_calls).toHaveLength(1)
      expect(universal.messages[0].tool_calls![0].id).toBe("call_123")
      expect(universal.messages[0].tool_calls![0].name).toBe("get_weather")
      expect(universal.messages[0].tool_calls![0].arguments).toEqual({
        location: "San Francisco",
      })

      // Check tool result (converted to tool_result content type)
      expect(universal.messages[1].content[0].type).toBe("tool_result")
      expect(universal.messages[1].content[0].tool_result?.result).toBe(
        '{"temperature": 72, "condition": "sunny"}',
      )
      expect(universal.messages[1].content[0].tool_result?.tool_call_id).toBe("call_123")
      expect(universal.messages[1].metadata.tool_call_id).toBe("call_123")

      // Check tools definition
      expect(universal.tools).toHaveLength(1)
      expect(universal.tools![0].name).toBe("get_weather")
      expect(universal.tools![0].description).toBe("Get weather information")
    })
  })

  describe("Anthropic to Universal", () => {
    test("should convert basic Anthropic request", () => {
      const anthropicBody = {
        model: "claude-3-opus-20240229",
        system: "You are a helpful assistant",
        messages: [
          { role: "user", content: "Hello Claude!" },
          { role: "assistant", content: "Hello! How can I help you today?" },
        ],
        max_tokens: 1000,
        temperature: 0.7,
      }

      const universal = toUniversal("anthropic", anthropicBody as AnthropicBody)

      expect(universal.provider).toBe("anthropic")
      expect(universal.model).toBe("claude-3-opus-20240229")
      expect(universal.system).toBe("You are a helpful assistant")
      expect(universal.max_tokens).toBe(1000)
      expect(universal.temperature).toBe(0.7)
      expect(universal.messages).toHaveLength(2)
    })

    test("should handle Anthropic multimodal content", () => {
      const anthropicBody = {
        model: "claude-3-opus-20240229",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Describe this image:" },
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/jpeg",
                  data: "iVBORw0KGgoAAAANSUhEUgAA...",
                },
              },
            ],
          },
        ],
        max_tokens: 1000,
      }

      const universal = toUniversal("anthropic", anthropicBody as AnthropicBody)

      expect(universal.messages[0].content).toHaveLength(2)
      expect(universal.messages[0].content[1].type).toBe("image")
      expect(universal.messages[0].content[1].media?.data).toBe(
        "iVBORw0KGgoAAAANSUhEUgAA...",
      )
      expect(universal.messages[0].content[1].media?.mimeType).toBe(
        "image/jpeg",
      )
    })

    test("should handle cache control", () => {
      const anthropicBody = {
        model: "claude-3-opus-20240229",
        system: [
          {
            type: "text",
            text: "You are a helpful assistant",
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Hello",
                cache_control: { type: "ephemeral" },
              },
            ],
          },
        ],
        max_tokens: 1000,
      }

      const universal = toUniversal("anthropic", anthropicBody as AnthropicBody)

      expect(universal.system).toBeTypeOf("object")
      const systemPrompt = universal.system as any
      expect(systemPrompt.cache_control).toEqual({ type: "ephemeral" })
      expect(universal.messages[0].metadata.cache_control).toEqual({
        type: "ephemeral",
      })
    })
  })

  describe("Google to Universal", () => {
    test("should convert basic Google request", () => {
      const googleBody = {
        contents: [
          {
            role: "user",
            parts: [{ text: "Hello Gemini!" }],
          },
          {
            role: "model",
            parts: [{ text: "Hello! How can I assist you today?" }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1000,
        },
      }

      const universal = toUniversal("google", googleBody as GeminiBody)

      expect(universal.provider).toBe("google")
      expect(universal.temperature).toBe(0.7)
      expect(universal.max_tokens).toBe(1000)
      expect(universal.messages).toHaveLength(2)
      expect(universal.messages[0].role).toBe("user")
      expect(universal.messages[1].role).toBe("assistant")
    })

    test("should handle Google multimodal content", () => {
      const googleBody = {
        contents: [
          {
            role: "user",
            parts: [
              { text: "What do you see in this image?" },
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: "iVBORw0KGgoAAAANSUhEUgAA...",
                },
              },
              {
                fileData: {
                  mimeType: "application/pdf",
                  fileUri: "gs://bucket/document.pdf",
                },
              },
            ],
          },
        ],
      }

      const universal = toUniversal("google", googleBody as GeminiBody)

      expect(universal.messages[0].content).toHaveLength(3)
      expect(universal.messages[0].content[0].type).toBe("text")
      expect(universal.messages[0].content[1].type).toBe("image")
      expect(universal.messages[0].content[1].media?.data).toBe(
        "iVBORw0KGgoAAAANSUhEUgAA...",
      )
      expect(universal.messages[0].content[1].media?.mimeType).toBe(
        "image/jpeg",
      )
      expect(universal.messages[0].content[2].type).toBe("document")
      expect(universal.messages[0].content[2].media?.fileUri).toBe(
        "gs://bucket/document.pdf",
      )
      expect(universal.messages[0].content[2].media?.mimeType).toBe(
        "application/pdf",
      )
    })

    test("should handle Google function calling", () => {
      const googleBody = {
        contents: [
          {
            role: "model",
            parts: [
              {
                functionCall: {
                  name: "get_weather",
                  args: { location: "New York" },
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
                  response: { temperature: 68, condition: "cloudy" },
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
                description: "Get weather data",
                parameters: {
                  type: "object" as const,
                  properties: {
                    location: { type: "string" as const },
                  },
                },
              },
            ],
          },
        ],
      }

      const universal = toUniversal("google", googleBody as GeminiBody)

      // Check tool calls
      expect(universal.messages[0].content[0].type).toBe("tool_call")
      expect(universal.messages[0].content[0].tool_call?.name).toBe(
        "get_weather",
      )
      expect(universal.messages[0].content[0].tool_call?.arguments).toEqual({
        location: "New York",
      })

      // Check tool results (Google format should parse functionResponse correctly)
      expect(universal.messages[1].content[0].type).toBe("tool_result")
      expect(universal.messages[1].content[0].tool_result?.name).toBe(
        "get_weather",
      )
      expect(universal.messages[1].content[0].tool_result?.result).toEqual({
        temperature: 68,
        condition: "cloudy",
      })

      // Check tools
      expect(universal.tools).toHaveLength(1)
      expect(universal.tools![0].name).toBe("get_weather")
    })
  })

  describe("Universal to Provider conversion", () => {
    test("should convert universal back to OpenAI format", () => {
      const openaiBody = {
        model: "gpt-4",
        messages: [
          { role: "system", content: "You are helpful" },
          { role: "user", content: "Hello" },
        ],
        temperature: 0.8,
      }

      const universal = toUniversal("openai", openaiBody as OpenAIBody)
      const converted = fromUniversal("openai", universal)

      expect(converted.model).toBe("gpt-4")
      expect(converted.temperature).toBe(0.8)
      expect(converted.messages).toHaveLength(2)
      expect(converted.messages[0].role).toBe("system")
      expect(converted.messages[0].content).toBe("You are helpful")
    })

    test("should preserve original data in round-trip conversion", () => {
      const original = {
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Test message" },
              {
                type: "image_url",
                image_url: {
                  url: "https://example.com/test.jpg",
                  detail: "high",
                },
              },
            ],
          },
        ],
        temperature: 0.5,
        response_format: { type: "json_object" },
        seed: 12345,
      }

      const universal = toUniversal("openai", original as OpenAIBody)
      const converted = fromUniversal("openai", universal)

      expect(converted).toEqual(original)
    })

    test("should convert universal system messages to Google systemInstruction format", () => {
      const universalBody = {
        _original: {
          provider: "google",
          raw: "",
        },
        max_tokens: 4096,
        messages: [
          {
            content: [
              {
                _original: {
                  provider: "google",
                  raw: "Based on all the messages below, generate a concise summary of the conversation.",
                },
                text: "Based on all the messages below, generate a concise summary of the conversation.",
                type: "text" as const,
              },
            ],
            id: "system_msg_1",
            metadata: {
              provider: "google",
            },
            role: "system" as const,
          },
          {
            content: [
              {
                text: "what do you know about me bro?",
                type: "text" as const,
              },
            ],
            id: "user_msg_1",
            metadata: {
              provider: "google",
            },
            role: "user" as const,
          },
          {
            content: [
              {
                text: "I know you're curious about your identity and want to be recognized.",
                type: "text" as const,
              },
            ],
            id: "assistant_msg_1",
            metadata: {
              provider: "google",
            },
            role: "assistant" as const,
          },
        ],
        model: "gemini-2.0-flash",
        provider: "google",
        stream: false,
        temperature: 0.7,
      }

      const converted = fromUniversal("google", universalBody as any)

      // System message should be moved to systemInstruction
      expect(converted.systemInstruction).toBeDefined()
      expect((converted.systemInstruction as any).parts).toHaveLength(1)
      expect((converted.systemInstruction as any).parts[0].text).toBe(
        "Based on all the messages below, generate a concise summary of the conversation."
      )

      // Contents should only have user and assistant messages
      expect(converted.contents).toHaveLength(2)
      expect(converted.contents[0].role).toBe("user")
      expect(converted.contents[1].role).toBe("model")
      expect(converted.contents[0].parts[0].text).toBe("what do you know about me bro?")
      expect(converted.contents[1].parts[0].text).toBe("I know you're curious about your identity and want to be recognized.")
    })

    test("should handle multimodal system messages in Google format", () => {
      const universalBody = {
        _original: {
          provider: "google",
          raw: "",
        },
        max_tokens: 4096,
        messages: [
          {
            content: [
              {
                text: "You are a helpful assistant.",
                type: "text" as const,
              },
              {
                text: "Additional context.",
                type: "text" as const,
              },
            ],
            id: "system_msg_1",
            metadata: {
              provider: "google",
            },
            role: "system" as const,
          },
          {
            content: [
              {
                text: "Hello!",
                type: "text" as const,
              },
            ],
            id: "user_msg_1",
            metadata: {
              provider: "google",
            },
            role: "user" as const,
          },
        ],
        model: "gemini-2.0-flash",
        provider: "google",
        stream: false,
        temperature: 0.7,
      }

      const converted = fromUniversal("google", universalBody as any)

      // System message should combine multiple text parts
      expect(converted.systemInstruction).toBeDefined()
      expect((converted.systemInstruction as any).parts).toHaveLength(2)
      expect((converted.systemInstruction as any).parts[0].text).toBe("You are a helpful assistant.")
      expect((converted.systemInstruction as any).parts[1].text).toBe("Additional context.")

      // Contents should only have user message
      expect(converted.contents).toHaveLength(1)
      expect(converted.contents[0].role).toBe("user")
      expect(converted.contents[0].parts[0].text).toBe("Hello!")
    })

    test("should combine universal.system and system messages in Google format", () => {
      const universalBody = {
        _original: {
          provider: "google",
          raw: "",
        },
        max_tokens: 4096,
        system: "You are a helpful assistant.",
        messages: [
          {
            content: [
              {
                text: "Additional instruction from message.",
                type: "text" as const,
              },
            ],
            id: "system_msg_1",
            metadata: {
              provider: "google",
            },
            role: "system" as const,
          },
          {
            content: [
              {
                text: "Hello!",
                type: "text" as const,
              },
            ],
            id: "user_msg_1",
            metadata: {
              provider: "google",
            },
            role: "user" as const,
          },
        ],
        model: "gemini-2.0-flash",
        provider: "google",
        stream: false,
        temperature: 0.7,
      }

      const converted = fromUniversal("google", universalBody as any)

      // System instruction should combine both universal.system and system messages
      expect(converted.systemInstruction).toBeDefined()
      expect((converted.systemInstruction as any).parts).toHaveLength(2)
      expect((converted.systemInstruction as any).parts[0].text).toBe("You are a helpful assistant.")
      expect((converted.systemInstruction as any).parts[1].text).toBe("Additional instruction from message.")

      // Contents should only have user message
      expect(converted.contents).toHaveLength(1)
      expect(converted.contents[0].role).toBe("user")
    })

    test("should handle invalid _original.raw format gracefully", () => {
      const universalBody = {
        _original: {
          provider: "google",
          raw: "",
        },
        max_tokens: 4096,
        messages: [
          {
            content: [
              {
                _original: {
                  provider: "google",
                  raw: "Invalid string format", // This is a string but should be an object with text property
                },
                text: "Hello",
                type: "text" as const,
              },
            ],
            id: "user_msg_1",
            metadata: {
              provider: "google",
            },
            role: "user" as const,
          },
        ],
        model: "gemini-2.0-flash",
        provider: "google",
        stream: false,
        temperature: 0.7,
      }

      // Should not throw an error, but gracefully fall back to using the universal content
      const result = fromUniversal("google", universalBody as any)

      expect(result).toBeDefined()
      expect(result.contents).toHaveLength(1)
      expect(result.contents[0].parts[0]).toEqual({ text: "Hello" })
      expect(result.generationConfig?.maxOutputTokens).toBe(4096)
      expect(result.generationConfig?.temperature).toBe(0.7)
    })

    test("should work with helper functions (no _original needed)", () => {
      const systemMsg = createSystemMessage("You are a helpful assistant", { provider: "google" })
      const userMsg = createUserMessage("Hello!", { provider: "google" })

      const universalBody = {
        _original: {
          provider: "google",
          raw: "",
        },
        max_tokens: 4096,
        messages: [systemMsg, userMsg],
        model: "gemini-2.0-flash",
        provider: "google",
        stream: false,
        temperature: 0.7,
      }

      const converted = fromUniversal("google", universalBody as any)

      // Should work without throwing errors
      expect(converted.systemInstruction).toBeDefined()
      expect((converted.systemInstruction as any).parts[0].text).toBe("You are a helpful assistant")
      expect(converted.contents).toHaveLength(1)
      expect(converted.contents[0].role).toBe("user")
      expect(converted.contents[0].parts[0].text).toBe("Hello!")
    })
  })

  describe("Cross-provider translation", () => {
    test("should translate OpenAI to Anthropic format", () => {
      const openaiBody = {
        model: "gpt-4",
        messages: [
          { role: "system", content: "You are helpful" },
          { role: "user", content: "Hello" },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }

      const anthropicBody = translateBetweenProviders(
        "openai",
        "anthropic",
        openaiBody as OpenAIBody,
      )

      expect(anthropicBody.model).toBe("gpt-4")
      expect(anthropicBody.system).toBe("You are helpful")
      expect(anthropicBody.messages).toHaveLength(1)
      expect(anthropicBody.messages[0].role).toBe("user")
      expect(anthropicBody.temperature).toBe(0.7)
      expect(anthropicBody.max_tokens).toBe(1000)
    })

    test("should translate complex multimodal content between providers", () => {
      const openaiBody = {
        model: "gpt-4-vision-preview",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Analyze this image" },
              {
                type: "image_url",
                image_url: {
                  url: "data:image/jpeg;base64,iVBORw0KGgoAAAA...",
                  detail: "high",
                },
              },
            ],
          },
        ],
      }

      const anthropicBody = translateBetweenProviders(
        "openai",
        "anthropic",
        openaiBody as OpenAIBody,
      )

      expect(anthropicBody.messages[0].content).toHaveLength(2)
      expect((anthropicBody.messages[0].content[0] as any).type).toBe("text")
      expect((anthropicBody.messages[0].content[1] as any).type).toBe("image")
      expect((anthropicBody.messages[0].content[1] as any).source?.type).toBe(
        "base64",
      )
      expect(
        (anthropicBody.messages[0].content[1] as any).source?.media_type,
      ).toBe("image/jpeg")
    })
  })

  describe("Error handling", () => {
    test("should throw on unsupported provider", () => {
      expect(() => {
        toUniversal("unsupported" as any, {} as OpenAIBody)
      }).toThrow("Unsupported provider")
    })

    test("should handle malformed input gracefully", () => {
      const malformedBody = {
        model: "gpt-4",
        messages: "not an array",
      }

      expect(() => {
        toUniversal("openai", malformedBody as any)
      }).not.toThrow()
    })
  })
})
