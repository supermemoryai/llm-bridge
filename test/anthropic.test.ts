import { describe, it, expect } from "vitest"
import { toUniversal, fromUniversal } from "../src/models/index.js"

describe("Anthropic format conversion", () => {
  describe("basic text messages", () => {
    it("should convert user text message to universal", () => {
      const body = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [
          { role: "user" as const, content: "Hello, Claude!" },
        ],
      }

      const universal = toUniversal("anthropic", body)

      expect(universal.provider).toBe("anthropic")
      expect(universal.model).toBe("claude-sonnet-4-20250514")
      expect(universal.max_tokens).toBe(1024)
      expect(universal.messages).toHaveLength(1)
      expect(universal.messages[0].role).toBe("user")
      expect(universal.messages[0].content).toHaveLength(1)
      expect(universal.messages[0].content[0].type).toBe("text")
      expect(universal.messages[0].content[0].text).toBe("Hello, Claude!")
    })

    it("should convert user and assistant messages to universal", () => {
      const body = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [
          { role: "user" as const, content: "What is 2+2?" },
          { role: "assistant" as const, content: "2+2 equals 4." },
          { role: "user" as const, content: "And 3+3?" },
        ],
      }

      const universal = toUniversal("anthropic", body)

      expect(universal.messages).toHaveLength(3)
      expect(universal.messages[0].role).toBe("user")
      expect(universal.messages[0].content[0].text).toBe("What is 2+2?")
      expect(universal.messages[1].role).toBe("assistant")
      expect(universal.messages[1].content[0].text).toBe("2+2 equals 4.")
      expect(universal.messages[2].role).toBe("user")
      expect(universal.messages[2].content[0].text).toBe("And 3+3?")
    })

    it("should convert array content blocks to universal", () => {
      const body = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [
          {
            role: "user" as const,
            content: [
              { type: "text" as const, text: "Describe this image:" },
            ],
          },
        ],
      }

      const universal = toUniversal("anthropic", body)

      expect(universal.messages[0].content).toHaveLength(1)
      expect(universal.messages[0].content[0].type).toBe("text")
      expect(universal.messages[0].content[0].text).toBe("Describe this image:")
    })
  })

  describe("system message", () => {
    it("should convert string system prompt to universal", () => {
      const body = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: "You are a helpful assistant who speaks French.",
        messages: [
          { role: "user" as const, content: "Hello" },
        ],
      }

      const universal = toUniversal("anthropic", body)

      expect(universal.system).toBe("You are a helpful assistant who speaks French.")
    })

    it("should convert array system prompt to universal", () => {
      const body = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: [
          { type: "text" as const, text: "You are a helpful assistant." },
          { type: "text" as const, text: "Be concise in your responses." },
        ],
        messages: [
          { role: "user" as const, content: "Hello" },
        ],
      }

      const universal = toUniversal("anthropic", body)

      expect(universal.system).toBe("You are a helpful assistant. Be concise in your responses.")
    })

    it("should convert array system prompt with cache_control to universal", () => {
      const body = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: [
          {
            type: "text" as const,
            text: "You are a helpful assistant with a long context.",
            cache_control: { type: "ephemeral" as const },
          },
        ],
        messages: [
          { role: "user" as const, content: "Hello" },
        ],
      }

      const universal = toUniversal("anthropic", body)

      expect(universal.system).toEqual({
        content: "You are a helpful assistant with a long context.",
        cache_control: { type: "ephemeral" },
        _original: { provider: "anthropic", raw: body.system },
      })
    })
  })

  describe("images", () => {
    it("should convert base64 image source to universal", () => {
      const body = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [
          {
            role: "user" as const,
            content: [
              {
                type: "image" as const,
                source: {
                  type: "base64" as const,
                  media_type: "image/png" as const,
                  data: "iVBORw0KGgo...",
                },
              },
              { type: "text" as const, text: "What is in this image?" },
            ],
          },
        ],
      }

      const universal = toUniversal("anthropic", body)

      expect(universal.messages[0].content).toHaveLength(2)
      const imageContent = universal.messages[0].content[0]
      expect(imageContent.type).toBe("image")
      expect(imageContent.media?.data).toBe("iVBORw0KGgo...")
      expect(imageContent.media?.mimeType).toBe("image/png")
      const textContent = universal.messages[0].content[1]
      expect(textContent.type).toBe("text")
      expect(textContent.text).toBe("What is in this image?")
    })

    it("should convert URL image source to universal", () => {
      const body = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [
          {
            role: "user" as const,
            content: [
              {
                type: "image" as const,
                source: {
                  type: "url" as const,
                  url: "https://example.com/photo.jpg",
                  media_type: "image/jpeg",
                },
              },
              { type: "text" as const, text: "Describe this." },
            ],
          },
        ],
      }

      const universal = toUniversal("anthropic", body)

      const imageContent = universal.messages[0].content[0]
      expect(imageContent.type).toBe("image")
      expect(imageContent.media?.url).toBe("https://example.com/photo.jpg")
      expect(imageContent.media?.mimeType).toBe("image/jpeg")
    })
  })

  describe("tool definitions and tool_choice", () => {
    it("should convert tool definitions with input_schema to universal", () => {
      const body = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [
          { role: "user" as const, content: "What's the weather in Paris?" },
        ],
        tools: [
          {
            name: "get_weather",
            description: "Get the current weather in a location",
            input_schema: {
              type: "object" as const,
              properties: {
                location: { type: "string", description: "City name" },
                unit: { type: "string", enum: ["celsius", "fahrenheit"] },
              },
              required: ["location"],
            },
          },
        ],
      }

      const universal = toUniversal("anthropic", body)

      expect(universal.tools).toHaveLength(1)
      expect(universal.tools![0].name).toBe("get_weather")
      expect(universal.tools![0].description).toBe("Get the current weather in a location")
      expect(universal.tools![0].parameters).toEqual(body.tools[0].input_schema)
    })

    it("should convert tool_choice 'auto' to universal", () => {
      const body = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [
          { role: "user" as const, content: "Hello" },
        ],
        tools: [
          {
            name: "greet",
            description: "Greet user",
            input_schema: { type: "object" as const, properties: {} },
          },
        ],
        tool_choice: "auto" as any,
      }

      const universal = toUniversal("anthropic", body)

      expect(universal.tool_choice).toBe("auto")
    })

    it("should convert tool_choice 'any' to universal", () => {
      const body = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [
          { role: "user" as const, content: "Hello" },
        ],
        tools: [
          {
            name: "greet",
            description: "Greet user",
            input_schema: { type: "object" as const, properties: {} },
          },
        ],
        tool_choice: "any" as any,
      }

      const universal = toUniversal("anthropic", body)

      expect(universal.tool_choice).toBe("any")
    })
  })

  describe("tool use blocks", () => {
    it("should convert assistant tool_use content blocks to universal", () => {
      const body = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [
          { role: "user" as const, content: "What's the weather?" },
          {
            role: "assistant" as const,
            content: [
              { type: "text" as const, text: "Let me check the weather for you." },
              {
                type: "tool_use" as const,
                id: "toolu_01A09q90qw90lq917835lhak",
                name: "get_weather",
                input: { location: "San Francisco", unit: "celsius" },
              },
            ],
          },
        ],
      }

      const universal = toUniversal("anthropic", body)

      const assistantMsg = universal.messages[1]
      expect(assistantMsg.role).toBe("assistant")
      expect(assistantMsg.content).toHaveLength(2)

      const textBlock = assistantMsg.content[0]
      expect(textBlock.type).toBe("text")
      expect(textBlock.text).toBe("Let me check the weather for you.")

      const toolUseBlock = assistantMsg.content[1]
      expect(toolUseBlock.type).toBe("tool_call")
      expect(toolUseBlock.tool_call?.id).toBe("toolu_01A09q90qw90lq917835lhak")
      expect(toolUseBlock.tool_call?.name).toBe("get_weather")
      expect(toolUseBlock.tool_call?.arguments).toEqual({ location: "San Francisco", unit: "celsius" })
    })
  })

  describe("tool result blocks", () => {
    it("should convert tool_result to universal", () => {
      const body = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [
          {
            role: "user" as const,
            content: [
              {
                type: "tool_result" as const,
                tool_use_id: "toolu_01A09q90qw90lq917835lhak",
                content: "15°C, partly cloudy",
              },
            ],
          },
        ],
      }

      const universal = toUniversal("anthropic", body)

      const toolResult = universal.messages[0].content[0]
      expect(toolResult.type).toBe("tool_result")
      expect(toolResult.tool_result?.tool_call_id).toBe("toolu_01A09q90qw90lq917835lhak")
      expect(toolResult.tool_result?.result).toBe("15°C, partly cloudy")
      expect(toolResult.tool_result?.is_error).toBe(false)
    })

    it("should convert tool_result with is_error to universal", () => {
      const body = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [
          {
            role: "user" as const,
            content: [
              {
                type: "tool_result" as const,
                tool_use_id: "toolu_error_123",
                content: "Error: Location not found",
                is_error: true,
              },
            ],
          },
        ],
      }

      const universal = toUniversal("anthropic", body)

      const toolResult = universal.messages[0].content[0]
      expect(toolResult.type).toBe("tool_result")
      expect(toolResult.tool_result?.is_error).toBe(true)
      expect(toolResult.tool_result?.result).toBe("Error: Location not found")
    })
  })

  describe("extended thinking", () => {
    it("should convert thinking param in request to universal thinking config", () => {
      const body = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 16000,
        thinking: {
          type: "enabled",
          budget_tokens: 10000,
        },
        messages: [
          { role: "user" as const, content: "Solve this complex math problem." },
        ],
      } as any

      const universal = toUniversal("anthropic", body)

      expect(universal.thinking).toBeDefined()
      expect(universal.thinking!.enabled).toBe(true)
      expect(universal.thinking!.budget_tokens).toBe(10000)
    })

    it("should convert thinking content block to universal (with signature)", () => {
      const body = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 16000,
        messages: [
          { role: "user" as const, content: "Solve this." },
          {
            role: "assistant" as const,
            content: [
              {
                type: "thinking" as const,
                thinking: "Let me reason through this step by step...",
                signature: "ErUBCkYIAxgCIkD3sMj2test_sig",
              },
              {
                type: "text" as const,
                text: "The answer is 42.",
              },
            ],
          },
        ],
      }

      const universal = toUniversal("anthropic", body)

      const assistantMsg = universal.messages[1]
      expect(assistantMsg.content).toHaveLength(2)

      const thinkingBlock = assistantMsg.content[0]
      expect(thinkingBlock.type).toBe("thinking")
      expect(thinkingBlock.thinking).toBe("Let me reason through this step by step...")
      expect(thinkingBlock.signature).toBe("ErUBCkYIAxgCIkD3sMj2test_sig")

      const textBlock = assistantMsg.content[1]
      expect(textBlock.type).toBe("text")
      expect(textBlock.text).toBe("The answer is 42.")
    })

    it("should convert redacted_thinking content block to universal", () => {
      const body = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 16000,
        messages: [
          { role: "user" as const, content: "Explain." },
          {
            role: "assistant" as const,
            content: [
              {
                type: "redacted_thinking" as const,
                data: "base64encodeddata...",
              },
              {
                type: "text" as const,
                text: "Here is my response.",
              },
            ],
          },
        ],
      }

      const universal = toUniversal("anthropic", body)

      const assistantMsg = universal.messages[1]
      expect(assistantMsg.content).toHaveLength(2)

      const redactedBlock = assistantMsg.content[0]
      expect(redactedBlock.type).toBe("redacted_thinking")

      const textBlock = assistantMsg.content[1]
      expect(textBlock.type).toBe("text")
      expect(textBlock.text).toBe("Here is my response.")
    })
  })

  describe("cache_control on content blocks", () => {
    it("should detect cache_control on content blocks and preserve in metadata", () => {
      const body = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [
          {
            role: "user" as const,
            content: [
              {
                type: "text" as const,
                text: "Here is a very long document to cache...",
                cache_control: { type: "ephemeral" as const },
              },
            ],
          },
        ],
      }

      const universal = toUniversal("anthropic", body)

      expect(universal.messages[0].metadata.cache_control).toEqual({ type: "ephemeral" })
    })

    it("should not set cache_control when not present", () => {
      const body = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [
          {
            role: "user" as const,
            content: [
              { type: "text" as const, text: "Normal message" },
            ],
          },
        ],
      }

      const universal = toUniversal("anthropic", body)

      expect(universal.messages[0].metadata.cache_control).toBeUndefined()
    })
  })

  describe("provider params", () => {
    it("should preserve temperature, top_p, and stream", () => {
      const body = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        temperature: 0.7,
        top_p: 0.9,
        stream: true,
        messages: [
          { role: "user" as const, content: "Hello" },
        ],
      }

      const universal = toUniversal("anthropic", body)

      expect(universal.temperature).toBe(0.7)
      expect(universal.top_p).toBe(0.9)
      expect(universal.stream).toBe(true)
    })

    it("should preserve stop_sequences in provider_params", () => {
      const body = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        stop_sequences: ["\n\nHuman:", "\n\nAssistant:"],
        messages: [
          { role: "user" as const, content: "Hello" },
        ],
      }

      const universal = toUniversal("anthropic", body)

      expect(universal.provider_params?.stop_sequences).toEqual(["\n\nHuman:", "\n\nAssistant:"])
    })
  })

  describe("round-trip: anthropic → universal → anthropic", () => {
    it("should round-trip basic text messages", () => {
      const original = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [
          { role: "user" as const, content: "Hello, Claude!" },
          { role: "assistant" as const, content: "Hello! How can I help you?" },
          { role: "user" as const, content: "Tell me about TypeScript." },
        ],
      }

      const universal = toUniversal("anthropic", original)
      const result = fromUniversal("anthropic", universal) as any

      // When messages are unmodified, the original is returned directly
      expect(result.model).toBe(original.model)
      expect(result.max_tokens).toBe(original.max_tokens)
      expect(result.messages).toHaveLength(3)
    })

    it("should round-trip system prompt", () => {
      const original = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: "You are a pirate.",
        messages: [
          { role: "user" as const, content: "Hello!" },
        ],
      }

      const universal = toUniversal("anthropic", original)
      const result = fromUniversal("anthropic", universal) as any

      expect(result.system).toBe("You are a pirate.")
    })

    it("should round-trip tools", () => {
      const original = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [
          { role: "user" as const, content: "Get weather" },
        ],
        tools: [
          {
            name: "get_weather",
            description: "Get weather for a location",
            input_schema: {
              type: "object" as const,
              properties: {
                location: { type: "string" },
              },
              required: ["location"],
            },
          },
        ],
      }

      const universal = toUniversal("anthropic", original)
      const result = fromUniversal("anthropic", universal) as any

      expect(result.tools).toHaveLength(1)
      expect(result.tools[0].name).toBe("get_weather")
    })

    it("should round-trip thinking config", () => {
      const original = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 16000,
        thinking: {
          type: "enabled",
          budget_tokens: 8000,
        },
        messages: [
          { role: "user" as const, content: "Think deeply." },
        ],
      } as any

      const universal = toUniversal("anthropic", original)
      const result = fromUniversal("anthropic", universal) as any

      expect(result.thinking).toBeDefined()
      expect(result.thinking.type).toBe("enabled")
      expect(result.thinking.budget_tokens).toBe(8000)
    })

    it("should round-trip thinking content block with signature (multi-turn)", () => {
      // Simulates a multi-turn conversation where a previous assistant response
      // included a thinking block with a signature. The signature MUST be preserved
      // for Anthropic to accept the request.
      const original = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 16000,
        thinking: { type: "enabled", budget_tokens: 10000 },
        messages: [
          { role: "user" as const, content: "Solve this problem." },
          {
            role: "assistant" as const,
            content: [
              {
                type: "thinking" as const,
                thinking: "Let me reason step by step...",
                signature: "ErUBCkYIAxgCIkD3sMj2example_signature_base64",
              },
              {
                type: "text" as const,
                text: "The answer is 42.",
              },
            ],
          },
          { role: "user" as const, content: "Can you explain further?" },
        ],
      } as any

      // Step 1: Parse to universal
      const universal = toUniversal("anthropic", original)

      // Verify signature is captured in universal format
      const assistantMsg = universal.messages[1]
      const thinkingBlock = assistantMsg.content[0]
      expect(thinkingBlock.type).toBe("thinking")
      expect(thinkingBlock.thinking).toBe("Let me reason step by step...")
      expect(thinkingBlock.signature).toBe("ErUBCkYIAxgCIkD3sMj2example_signature_base64")

      // Step 2: Convert back to Anthropic format
      const result = fromUniversal("anthropic", universal) as any

      // Verify signature is preserved in the output
      const assistantContent = result.messages[1].content
      const outputThinking = assistantContent.find((b: any) => b.type === "thinking")
      expect(outputThinking).toBeDefined()
      // The _original fast path should preserve the full block including signature
      expect(outputThinking.signature).toBe("ErUBCkYIAxgCIkD3sMj2example_signature_base64")
      expect(outputThinking.thinking).toBe("Let me reason step by step...")
    })

    it("should preserve signature on thinking block via slow path (cross-provider)", () => {
      // Simulates a scenario where a thinking block comes from a different provider
      // (no _original.provider === "anthropic"), so the slow reconstruction path is used.
      // The signature should still be preserved if it exists on the universal content.
      const universal: any = {
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        max_tokens: 16000,
        messages: [
          {
            id: "msg_1",
            role: "user",
            content: [{ type: "text", text: "Explain." }],
            metadata: { provider: "anthropic" },
          },
          {
            id: "msg_2",
            role: "assistant",
            content: [
              {
                type: "thinking",
                thinking: "Cross-provider thinking content",
                signature: "sig_from_cross_provider_roundtrip",
                // No _original field — simulates cross-provider path
              },
              {
                type: "text",
                text: "Here is my answer.",
              },
            ],
            metadata: { provider: "anthropic" },
          },
          {
            id: "msg_3",
            role: "user",
            content: [{ type: "text", text: "Follow up?" }],
            metadata: { provider: "anthropic" },
          },
        ],
      }

      const result = fromUniversal("anthropic", universal) as any

      const assistantContent = result.messages[1].content
      const thinkingBlock = assistantContent.find((b: any) => b.type === "thinking")
      expect(thinkingBlock).toBeDefined()
      expect(thinkingBlock.thinking).toBe("Cross-provider thinking content")
      expect(thinkingBlock.signature).toBe("sig_from_cross_provider_roundtrip")
    })

    it("should round-trip temperature and stop_sequences", () => {
      const original = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        temperature: 0.5,
        top_p: 0.95,
        stop_sequences: ["STOP"],
        messages: [
          { role: "user" as const, content: "Hello" },
        ],
      }

      const universal = toUniversal("anthropic", original)
      const result = fromUniversal("anthropic", universal) as any

      expect(result.temperature).toBe(0.5)
      expect(result.top_p).toBe(0.95)
      expect(result.stop_sequences).toEqual(["STOP"])
    })
  })

  describe("fromUniversal: anthropic output", () => {
    it("should convert universal tool_choice string to Anthropic object format", () => {
      const body = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [
          { role: "user" as const, content: "Hello" },
        ],
        tools: [
          {
            name: "greet",
            description: "Greet user",
            input_schema: { type: "object" as const, properties: {} },
          },
        ],
        tool_choice: "auto" as any,
      }

      const universal = toUniversal("anthropic", body)

      // Modify to force re-generation (add a message without originalIndex)
      universal.messages.push({
        content: [{ type: "text", text: "extra" }],
        id: "injected",
        metadata: { provider: "anthropic" },
        role: "user",
      })

      const result = fromUniversal("anthropic", universal) as any

      expect(result.tool_choice).toEqual({ type: "auto" })
    })

    it("should convert universal tool_choice with name to Anthropic specific tool format", () => {
      const universal = {
        provider: "anthropic" as const,
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [
          {
            content: [{ type: "text" as const, text: "Use the calculator" }],
            id: "msg1",
            metadata: { provider: "anthropic" as const },
            role: "user" as const,
          },
        ],
        tools: [
          {
            name: "calculator",
            description: "Do math",
            parameters: { type: "object", properties: {} },
          },
        ],
        tool_choice: { name: "calculator" } as const,
      }

      const result = fromUniversal("anthropic", universal as any) as any

      expect(result.tool_choice).toEqual({ type: "tool", name: "calculator" })
    })

    it("should convert universal image content to Anthropic base64 format", () => {
      const universal = {
        provider: "anthropic" as const,
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [
          {
            content: [
              {
                type: "image" as const,
                media: {
                  data: "base64data",
                  mimeType: "image/jpeg",
                },
              },
            ],
            id: "msg1",
            metadata: { provider: "anthropic" as const },
            role: "user" as const,
          },
        ],
      }

      const result = fromUniversal("anthropic", universal as any) as any

      const imageBlock = result.messages[0].content[0]
      expect(imageBlock.type).toBe("image")
      expect(imageBlock.source.type).toBe("base64")
      expect(imageBlock.source.data).toBe("base64data")
      expect(imageBlock.source.media_type).toBe("image/jpeg")
    })

    it("should convert universal URL image content to Anthropic URL format", () => {
      const universal = {
        provider: "anthropic" as const,
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [
          {
            content: [
              {
                type: "image" as const,
                media: {
                  url: "https://example.com/image.png",
                },
              },
            ],
            id: "msg1",
            metadata: { provider: "anthropic" as const },
            role: "user" as const,
          },
        ],
      }

      const result = fromUniversal("anthropic", universal as any) as any

      const imageBlock = result.messages[0].content[0]
      expect(imageBlock.type).toBe("image")
      expect(imageBlock.source.type).toBe("url")
      expect(imageBlock.source.url).toBe("https://example.com/image.png")
    })

    it("should convert universal thinking content back to Anthropic format", () => {
      const universal = {
        provider: "anthropic" as const,
        model: "claude-sonnet-4-20250514",
        max_tokens: 16000,
        messages: [
          {
            content: [
              { type: "thinking" as const, thinking: "Let me think..." },
              { type: "text" as const, text: "The answer is 42." },
            ],
            id: "msg1",
            metadata: { provider: "anthropic" as const },
            role: "assistant" as const,
          },
        ],
      }

      const result = fromUniversal("anthropic", universal as any) as any

      expect(result.messages[0].content[0].type).toBe("thinking")
      expect(result.messages[0].content[0].thinking).toBe("Let me think...")
      expect(result.messages[0].content[1].type).toBe("text")
      expect(result.messages[0].content[1].text).toBe("The answer is 42.")
    })

    it("should convert universal redacted_thinking back to Anthropic format", () => {
      const universal = {
        provider: "anthropic" as const,
        model: "claude-sonnet-4-20250514",
        max_tokens: 16000,
        messages: [
          {
            content: [
              { type: "redacted_thinking" as const },
              { type: "text" as const, text: "Response." },
            ],
            id: "msg1",
            metadata: { provider: "anthropic" as const },
            role: "assistant" as const,
          },
        ],
      }

      const result = fromUniversal("anthropic", universal as any) as any

      expect(result.messages[0].content[0].type).toBe("redacted_thinking")
      expect(result.messages[0].content[1].type).toBe("text")
      expect(result.messages[0].content[1].text).toBe("Response.")
    })

    it("should convert universal tool_result with is_error back to Anthropic", () => {
      const universal = {
        provider: "anthropic" as const,
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [
          {
            content: [
              {
                type: "tool_result" as const,
                tool_result: {
                  tool_call_id: "toolu_err456",
                  name: "get_weather",
                  result: "Error: service unavailable",
                  is_error: true,
                },
              },
            ],
            id: "msg1",
            metadata: { provider: "anthropic" as const },
            role: "user" as const,
          },
        ],
      }

      const result = fromUniversal("anthropic", universal as any) as any

      const toolResultBlock = result.messages[0].content[0]
      expect(toolResultBlock.type).toBe("tool_result")
      expect(toolResultBlock.tool_use_id).toBe("toolu_err456")
      expect(toolResultBlock.is_error).toBe(true)
      expect(toolResultBlock.content).toBe("Error: service unavailable")
    })
  })
})
