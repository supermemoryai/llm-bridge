import { describe, it, expect } from "vitest"
import { toUniversal, fromUniversal } from "../src/models"

/**
 * Comprehensive tests verifying all fixes from the provider translation audit.
 * Each test targets a specific bug that was found and fixed.
 */

describe("Google format fixes", () => {
  describe("functionCall ID preservation", () => {
    it("should preserve functionCall.id from Gemini API when available", () => {
      const googleBody = {
        contents: [
          {
            role: "model",
            parts: [
              {
                functionCall: {
                  id: "gemini-call-abc123",
                  name: "get_weather",
                  args: { location: "London" },
                },
              },
            ],
          },
        ],
      }

      const universal = toUniversal("google", googleBody as any)
      const toolCall = universal.messages[0].content[0]
      expect(toolCall.type).toBe("tool_call")
      expect(toolCall.tool_call?.id).toBe("gemini-call-abc123")
    })

    it("should generate synthetic ID when functionCall.id is missing", () => {
      const googleBody = {
        contents: [
          {
            role: "model",
            parts: [
              {
                functionCall: {
                  name: "get_weather",
                  args: { location: "London" },
                },
              },
            ],
          },
        ],
      }

      const universal = toUniversal("google", googleBody as any)
      const toolCall = universal.messages[0].content[0]
      expect(toolCall.type).toBe("tool_call")
      expect(toolCall.tool_call?.id).toMatch(/^call_/)
    })
  })

  describe("functionResponse ID in output", () => {
    it("should include id field in functionResponse when converting to Google", () => {
      const universal = toUniversal("google", {
        contents: [
          {
            role: "model",
            parts: [{ functionCall: { name: "get_weather", args: { location: "London" } } }],
          },
          {
            role: "user",
            parts: [{ functionResponse: { name: "get_weather", response: { temp: 20 } } }],
          },
        ],
      } as any)

      // Modify to trigger reconstruction
      universal.messages.push({
        content: [{ type: "text", text: "Thanks!" }],
        id: "new-msg",
        metadata: { provider: "google" },
        role: "user",
      })

      const result = fromUniversal("google", universal as any) as any
      const frPart = result.contents[1].parts[0]
      expect(frPart.functionResponse).toBeDefined()
      expect(frPart.functionResponse.id).toBeDefined()
    })
  })

  describe("functionResponse response normalization", () => {
    it("should wrap string result in { output: ... } for Gemini", () => {
      const universal: any = {
        provider: "google",
        model: "gemini-pro",
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "tool_call",
                tool_call: { id: "call_1", name: "search", arguments: { q: "test" } },
              },
            ],
            id: "m1",
            metadata: { provider: "google" },
          },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_result: {
                  tool_call_id: "call_1",
                  name: "search",
                  result: "Found 5 results",
                },
              },
            ],
            id: "m2",
            metadata: { provider: "google" },
          },
        ],
      }

      const result = fromUniversal("google", universal) as any
      const frPart = result.contents[1].parts[0]
      expect(frPart.functionResponse.response).toEqual({ output: "Found 5 results" })
    })

    it("should pass through object result directly for Gemini", () => {
      const universal: any = {
        provider: "google",
        model: "gemini-pro",
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "tool_call",
                tool_call: { id: "call_1", name: "search", arguments: { q: "test" } },
              },
            ],
            id: "m1",
            metadata: { provider: "google" },
          },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_result: {
                  tool_call_id: "call_1",
                  name: "search",
                  result: { count: 5, items: ["a", "b"] },
                },
              },
            ],
            id: "m2",
            metadata: { provider: "google" },
          },
        ],
      }

      const result = fromUniversal("google", universal) as any
      const frPart = result.contents[1].parts[0]
      expect(frPart.functionResponse.response).toEqual({ count: 5, items: ["a", "b"] })
    })

    it("should flatten Anthropic content block arrays for Gemini", () => {
      const universal: any = {
        provider: "google",
        model: "gemini-pro",
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "tool_call",
                tool_call: { id: "call_1", name: "search", arguments: {} },
              },
            ],
            id: "m1",
            metadata: { provider: "google" },
          },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_result: {
                  tool_call_id: "call_1",
                  name: "search",
                  result: [{ type: "text", text: "Result 1" }, { type: "text", text: "Result 2" }],
                },
              },
            ],
            id: "m2",
            metadata: { provider: "google" },
          },
        ],
      }

      const result = fromUniversal("google", universal) as any
      const frPart = result.contents[1].parts[0]
      expect(frPart.functionResponse.response).toEqual({ output: "Result 1\nResult 2" })
    })
  })

  describe("model name preservation", () => {
    it("should use model from body when available", () => {
      const googleBody = {
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: "Hello" }] }],
      }

      const universal = toUniversal("google", googleBody as any)
      expect(universal.model).toBe("gemini-2.5-flash")
    })

    it("should fallback to gemini-pro when model not in body", () => {
      const googleBody = {
        contents: [{ role: "user", parts: [{ text: "Hello" }] }],
      }

      const universal = toUniversal("google", googleBody as any)
      expect(universal.model).toBe("gemini-pro")
    })
  })

  describe("systemInstruction.parts array safety", () => {
    it("should handle non-array parts gracefully", () => {
      const googleBody = {
        contents: [{ role: "user", parts: [{ text: "Hello" }] }],
        systemInstruction: { parts: "not an array" },
      }

      // Should not throw
      const universal = toUniversal("google", googleBody as any)
      expect(universal.system).toBeUndefined()
    })
  })

  describe("redacted_thinking handling", () => {
    it("should convert redacted_thinking to empty thought part for Google", () => {
      const universal: any = {
        provider: "google",
        model: "gemini-pro",
        messages: [
          {
            role: "assistant",
            content: [
              { type: "redacted_thinking" },
              { type: "text", text: "Hello" },
            ],
            id: "m1",
            metadata: { provider: "google" },
          },
        ],
      }

      const result = fromUniversal("google", universal) as any
      expect(result.contents[0].parts[0]).toEqual({ thought: true, text: "" })
      expect(result.contents[0].parts[1]).toEqual({ text: "Hello" })
    })
  })

  describe("fileData handling", () => {
    it("should use fileData when media has fileUri", () => {
      const universal: any = {
        provider: "google",
        model: "gemini-pro",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                media: {
                  fileUri: "gs://bucket/document.pdf",
                  mimeType: "application/pdf",
                },
              },
            ],
            id: "m1",
            metadata: { provider: "google" },
          },
        ],
      }

      const result = fromUniversal("google", universal) as any
      expect(result.contents[0].parts[0].fileData).toBeDefined()
      expect(result.contents[0].parts[0].fileData.fileUri).toBe("gs://bucket/document.pdf")
      expect(result.contents[0].parts[0].inlineData).toBeUndefined()
    })
  })

  describe("safety_settings conditional", () => {
    it("should not include safety_settings when undefined", () => {
      const googleBody = {
        contents: [{ role: "user", parts: [{ text: "Hello" }] }],
      }

      const universal = toUniversal("google", googleBody as any)
      expect(universal.provider_params?.safety_settings).toBeUndefined()
    })

    it("should include safety_settings when defined", () => {
      const googleBody = {
        contents: [{ role: "user", parts: [{ text: "Hello" }] }],
        safetySettings: [{ category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" }],
      }

      const universal = toUniversal("google", googleBody as any)
      expect(universal.provider_params?.safety_settings).toBeDefined()
    })
  })

  describe("schema stripping for tools", () => {
    it("should strip additionalProperties from tool parameters", () => {
      const universal: any = {
        provider: "google",
        model: "gemini-pro",
        messages: [{ role: "user", content: [{ type: "text", text: "Hi" }], id: "m1", metadata: { provider: "google" } }],
        tools: [
          {
            name: "search",
            description: "Search the web",
            parameters: {
              type: "object",
              properties: { query: { type: "string" } },
              additionalProperties: false,
              required: ["query"],
            },
          },
        ],
      }

      const result = fromUniversal("google", universal) as any
      const params = result.tools[0].functionDeclarations[0].parameters
      expect(params.additionalProperties).toBeUndefined()
      expect(params.type).toBe("object")
      expect(params.properties.query.type).toBe("string")
    })
  })

  describe("thinkingConfig in generationConfig", () => {
    it("should read thinkingConfig from generationConfig", () => {
      const googleBody = {
        contents: [{ role: "user", parts: [{ text: "Hello" }] }],
        generationConfig: {
          thinkingConfig: {
            thinkingBudget: 4096,
            thinkingLevel: "medium",
          },
        },
      }

      const universal = toUniversal("google", googleBody as any)
      expect(universal.thinking?.enabled).toBe(true)
      expect(universal.thinking?.budget_tokens).toBe(4096)
      expect(universal.thinking?.effort).toBe("medium")
    })

    it("should write thinkingConfig inside generationConfig", () => {
      const universal: any = {
        provider: "google",
        model: "gemini-pro",
        messages: [{ role: "user", content: [{ type: "text", text: "Hi" }], id: "m1", metadata: { provider: "google" } }],
        thinking: { enabled: true, budget_tokens: 8192, effort: "high" },
      }

      const result = fromUniversal("google", universal) as any
      expect(result.generationConfig?.thinkingConfig).toBeDefined()
      expect(result.generationConfig.thinkingConfig.thinkingBudget).toBe(8192)
      expect(result.generationConfig.thinkingConfig.thinkingLevel).toBe("high")
    })

    it("should clamp thinkingBudget to Gemini max of 24576", () => {
      const universal: any = {
        provider: "google",
        model: "gemini-pro",
        messages: [{ role: "user", content: [{ type: "text", text: "Hi" }], id: "m1", metadata: { provider: "google" } }],
        thinking: { enabled: true, budget_tokens: 100000 },
      }

      const result = fromUniversal("google", universal) as any
      expect(result.generationConfig.thinkingConfig.thinkingBudget).toBe(24576)
    })
  })

  describe("tool name lookup from tool_call_id", () => {
    it("should resolve tool name from earlier tool_call when tool_result has no name", () => {
      const universal: any = {
        provider: "google",
        model: "gemini-pro",
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "tool_call",
                tool_call: { id: "call_abc", name: "get_weather", arguments: { city: "NYC" } },
              },
            ],
            id: "m1",
            metadata: { provider: "google" },
          },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_result: {
                  tool_call_id: "call_abc",
                  name: "", // Empty name (Anthropic style)
                  result: { temp: 72 },
                },
              },
            ],
            id: "m2",
            metadata: { provider: "google" },
          },
        ],
      }

      const result = fromUniversal("google", universal) as any
      const frPart = result.contents[1].parts[0]
      expect(frPart.functionResponse.name).toBe("get_weather")
    })
  })
})

describe("Anthropic format fixes", () => {
  describe("URL image media_type preservation", () => {
    it("should include media_type in URL-based image source", () => {
      const universal: any = {
        provider: "anthropic",
        model: "claude-3-sonnet",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                media: {
                  url: "https://example.com/image.png",
                  mimeType: "image/png",
                },
              },
            ],
            id: "m1",
            metadata: { provider: "anthropic" },
          },
        ],
      }

      const result = fromUniversal("anthropic", universal) as any
      const imageBlock = result.messages[0].content[0]
      expect(imageBlock.type).toBe("image")
      expect(imageBlock.source.type).toBe("url")
      expect(imageBlock.source.url).toBe("https://example.com/image.png")
      expect(imageBlock.source.media_type).toBe("image/png")
    })
  })

  describe("max_tokens safety", () => {
    it("should default to 1024 when max_tokens is undefined", () => {
      const universal: any = {
        provider: "anthropic",
        model: "claude-3-sonnet",
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: "Hello" }],
            id: "m1",
            metadata: { provider: "anthropic" },
          },
        ],
      }

      const result = fromUniversal("anthropic", universal) as any
      expect(result.max_tokens).toBe(1024)
    })

    it("should use provided max_tokens when available", () => {
      const universal: any = {
        provider: "anthropic",
        model: "claude-3-sonnet",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: "Hello" }],
            id: "m1",
            metadata: { provider: "anthropic" },
          },
        ],
      }

      const result = fromUniversal("anthropic", universal) as any
      expect(result.max_tokens).toBe(4096)
    })
  })

  describe("cache control system prompt reconstruction", () => {
    it("should reconstruct system prompt with cache_control as array", () => {
      const universal: any = {
        provider: "anthropic",
        model: "claude-3-sonnet",
        max_tokens: 1024,
        system: {
          content: "You are a helpful assistant.",
          cache_control: { type: "ephemeral" },
        },
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: "Hello" }],
            id: "m1",
            metadata: { provider: "anthropic" },
          },
        ],
      }

      const result = fromUniversal("anthropic", universal) as any
      expect(Array.isArray(result.system)).toBe(true)
      expect(result.system[0].type).toBe("text")
      expect(result.system[0].text).toBe("You are a helpful assistant.")
      expect(result.system[0].cache_control).toEqual({ type: "ephemeral" })
    })

    it("should keep plain string system prompt when no cache_control", () => {
      const universal: any = {
        provider: "anthropic",
        model: "claude-3-sonnet",
        max_tokens: 1024,
        system: "You are a helpful assistant.",
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: "Hello" }],
            id: "m1",
            metadata: { provider: "anthropic" },
          },
        ],
      }

      const result = fromUniversal("anthropic", universal) as any
      expect(result.system).toBe("You are a helpful assistant.")
    })
  })

  describe("developer message text safety", () => {
    it("should not produce 'undefined' text from developer messages with missing text", () => {
      const universal: any = {
        provider: "anthropic",
        model: "claude-3-sonnet",
        max_tokens: 1024,
        messages: [
          {
            role: "developer",
            content: [
              { type: "text", text: "Be helpful" },
              { type: "text" }, // Missing text field
              { type: "image", media: { url: "https://example.com/img.png" } },
            ],
            id: "d1",
            metadata: { provider: "anthropic" },
          },
          {
            role: "user",
            content: [{ type: "text", text: "Hello" }],
            id: "m1",
            metadata: { provider: "anthropic" },
          },
        ],
      }

      const result = fromUniversal("anthropic", universal) as any
      // System should contain "Be helpful" but NOT "undefined"
      expect(result.system).toContain("Be helpful")
      expect(result.system).not.toContain("undefined")
    })
  })

  describe("thinking signature preservation", () => {
    it("should preserve thinking block signature in round-trip", () => {
      const anthropicBody = {
        model: "claude-3-sonnet",
        max_tokens: 1024,
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "thinking",
                thinking: "Let me think about this...",
                signature: "sig_abc123xyz",
              },
              {
                type: "text",
                text: "Here's my answer.",
              },
            ],
          },
        ],
      }

      const universal = toUniversal("anthropic", anthropicBody as any)
      const thinkingContent = universal.messages[0].content[0]
      expect(thinkingContent.signature).toBe("sig_abc123xyz")

      // Round-trip back
      const result = fromUniversal("anthropic", universal as any) as any
      const thinkingBlock = result.messages[0].content[0]
      expect(thinkingBlock.signature).toBe("sig_abc123xyz")
    })
  })
})

describe("OpenAI Chat format fixes", () => {
  describe("null content handling", () => {
    it("should handle null content in assistant messages with tool_calls", () => {
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
                function: { name: "get_weather", arguments: '{"city":"NYC"}' },
              },
            ],
          },
        ],
      }

      const universal = toUniversal("openai", openaiBody as any)
      // Content should be empty array, not [{ text: "null" }]
      expect(universal.messages[0].content).toEqual([])
      expect(universal.messages[0].tool_calls).toHaveLength(1)
    })
  })

  describe("JSON.parse safety in tool calls", () => {
    it("should handle malformed JSON in tool call arguments", () => {
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
                function: { name: "search", arguments: "not valid json{" },
              },
            ],
          },
        ],
      }

      // Should not throw
      const universal = toUniversal("openai", openaiBody as any)
      expect(universal.messages[0].tool_calls).toHaveLength(1)
      expect(universal.messages[0].tool_calls![0].arguments).toEqual({})
      expect(universal.messages[0].tool_calls![0].metadata?.raw_arguments).toBe("not valid json{")
    })
  })

  describe("audio content reconstruction", () => {
    it("should reconstruct input_audio parts in complex content", () => {
      const universal: any = {
        provider: "openai",
        model: "gpt-4o-audio",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "What does this say?" },
              {
                type: "audio",
                media: { data: "base64audiodata", mimeType: "audio/wav" },
              },
            ],
            id: "m1",
            metadata: { provider: "openai" },
          },
        ],
      }

      const result = fromUniversal("openai", universal) as any
      const parts = result.messages[0].content
      expect(parts).toHaveLength(2)
      expect(parts[0].type).toBe("text")
      expect(parts[1].type).toBe("input_audio")
      expect(parts[1].input_audio.data).toBe("base64audiodata")
      expect(parts[1].input_audio.format).toBe("wav")
    })
  })

  describe("image data URL reconstruction", () => {
    it("should reconstruct data URL from base64 when no URL available", () => {
      const universal: any = {
        provider: "openai",
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                media: { data: "iVBORw0KGgo=", mimeType: "image/png" },
              },
            ],
            id: "m1",
            metadata: { provider: "openai" },
          },
        ],
      }

      const result = fromUniversal("openai", universal) as any
      const parts = result.messages[0].content
      expect(parts[0].type).toBe("image_url")
      expect(parts[0].image_url.url).toBe("data:image/png;base64,iVBORw0KGgo=")
    })
  })

  describe("tool result role handling", () => {
    it("should extract tool_call_id from tool_result content when metadata is missing", () => {
      const universal: any = {
        provider: "openai",
        model: "gpt-4",
        messages: [
          {
            role: "tool",
            content: [
              {
                type: "tool_result",
                tool_result: {
                  tool_call_id: "call_xyz",
                  name: "search",
                  result: "Found results",
                },
              },
            ],
            id: "m1",
            metadata: { provider: "openai" },
          },
        ],
      }

      const result = fromUniversal("openai", universal) as any
      expect(result.messages[0].tool_call_id).toBe("call_xyz")
      expect(result.messages[0].name).toBe("search")
    })
  })
})

describe("Cross-provider tool calling round-trips", () => {
  it("should translate Anthropic tool call to Google format correctly", () => {
    // Start with Anthropic format
    const anthropicBody = {
      model: "claude-3-sonnet",
      max_tokens: 1024,
      messages: [
        { role: "user", content: "What's the weather?" },
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "toolu_abc123",
              name: "get_weather",
              input: { location: "NYC" },
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_abc123",
              content: "Sunny, 72F",
            },
          ],
        },
      ],
    }

    // Convert to universal
    const universal = toUniversal("anthropic", anthropicBody as any)

    // Convert to Google
    universal.provider = "google" as any
    const googleResult = fromUniversal("google", universal as any) as any

    // Verify tool call
    const toolCallPart = googleResult.contents[1].parts[0]
    expect(toolCallPart.functionCall).toBeDefined()
    expect(toolCallPart.functionCall.name).toBe("get_weather")
    expect(toolCallPart.functionCall.args).toEqual({ location: "NYC" })

    // Verify tool result
    const toolResultPart = googleResult.contents[2].parts[0]
    expect(toolResultPart.functionResponse).toBeDefined()
    expect(toolResultPart.functionResponse.name).toBe("get_weather")
    expect(toolResultPart.functionResponse.response).toEqual({ output: "Sunny, 72F" })
    expect(toolResultPart.functionResponse.id).toBe("toolu_abc123")
  })

  it("should translate OpenAI tool call to Anthropic format correctly", () => {
    const openaiBody = {
      model: "gpt-4",
      messages: [
        { role: "user", content: "Search for cats" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_123",
              type: "function",
              function: { name: "search", arguments: '{"query":"cats"}' },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "call_123",
          content: "Found 10 results about cats",
        },
      ],
    }

    const universal = toUniversal("openai", openaiBody as any)
    universal.provider = "anthropic" as any
    ;(universal as any).max_tokens = 1024
    const anthropicResult = fromUniversal("anthropic", universal as any) as any

    // messages[0] = user ("Search for cats")
    // messages[1] = assistant (with tool_use blocks reconstructed from tool_calls)
    // messages[2] = tool (with tool_result)
    expect(anthropicResult.messages[0].role).toBe("user")

    const assistantMsg = anthropicResult.messages[1]
    expect(assistantMsg.role).toBe("assistant")
    // tool_calls are reconstructed as tool_use blocks in content
    const toolUseBlocks = assistantMsg.content.filter((b: any) => b.type === "tool_use")
    expect(toolUseBlocks.length).toBe(1)
    expect(toolUseBlocks[0].name).toBe("search")
    expect(toolUseBlocks[0].id).toBe("call_123")

    // Verify tool result
    const toolMsg = anthropicResult.messages[2]
    expect(toolMsg.role).toBe("tool")
    const toolResultBlock = toolMsg.content[0]
    expect(toolResultBlock.type).toBe("tool_result")
    expect(toolResultBlock.tool_use_id).toBe("call_123")
  })

  it("should translate Google tool call to OpenAI format correctly", () => {
    const googleBody = {
      contents: [
        { role: "user", parts: [{ text: "Get weather" }] },
        {
          role: "model",
          parts: [
            {
              functionCall: {
                name: "get_weather",
                args: { city: "London" },
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
                response: { temperature: 15, unit: "C" },
              },
            },
          ],
        },
      ],
    }

    const universal = toUniversal("google", googleBody as any)
    universal.provider = "openai" as any
    const openaiResult = fromUniversal("openai", universal as any) as any

    // Google model role maps to assistant in universal, then back to assistant in OpenAI
    // The first message is user ("Get weather"), second is assistant (tool call), third is user (tool result)
    expect(openaiResult.messages[0].role).toBe("user")
    expect(openaiResult.messages[1].role).toBe("assistant")

    // The tool result message has role "user" in Google but contains tool_result content
    // In OpenAI format, it should be reconstructed properly
    const toolResultMsg = openaiResult.messages[2]
    expect(toolResultMsg).toBeDefined()
  })
})

describe("Streaming emitter stop_reason mapping", () => {
  async function* yieldEvents(events: any[]) {
    for (const e of events) yield e
  }

  // Helper to collect SSE data from a ReadableStream
  async function collectSSE(stream: ReadableStream): Promise<string[]> {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    const chunks: string[] = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(decoder.decode(value))
    }
    return chunks
  }

  it("should map 'end_turn' to 'stop' for OpenAI emitter", async () => {
    const { emitOpenAIStream } = await import("../src/streaming/emitters")
    const events = yieldEvents([
      { type: "message_start", id: "msg_1", model: "gpt-4" },
      { type: "content_delta", delta: { text: "Hello" } },
      { type: "message_end", stop_reason: "end_turn" },
    ])

    const stream = emitOpenAIStream(events)
    const chunks = await collectSSE(stream)
    const allText = chunks.join("")
    // Find the chunk with finish_reason
    expect(allText).toContain('"finish_reason":"stop"')
  })

  it("should map 'tool_use' to 'tool_calls' for OpenAI emitter", async () => {
    const { emitOpenAIStream } = await import("../src/streaming/emitters")
    const events = yieldEvents([
      { type: "message_start", id: "msg_1", model: "gpt-4" },
      { type: "tool_call_start", tool_call: { id: "call_1", name: "search" } },
      { type: "tool_call_delta", tool_call: { id: "call_1", arguments_delta: '{"q":"test"}' } },
      { type: "tool_call_end", tool_call: { id: "call_1" } },
      { type: "message_end", stop_reason: "tool_use" },
    ])

    const stream = emitOpenAIStream(events)
    const chunks = await collectSSE(stream)
    const allText = chunks.join("")
    expect(allText).toContain('"finish_reason":"tool_calls"')
  })

  it("should map 'end_turn' to Anthropic 'end_turn'", async () => {
    const { emitAnthropicStream } = await import("../src/streaming/emitters")
    const events = yieldEvents([
      { type: "message_start", id: "msg_1", model: "claude-3" },
      { type: "content_delta", delta: { text: "Hello" } },
      { type: "message_end", stop_reason: "end_turn" },
    ])

    const stream = emitAnthropicStream(events)
    const chunks = await collectSSE(stream)
    const allText = chunks.join("")
    expect(allText).toContain('"stop_reason":"end_turn"')
  })

  it("should map 'stop' to Google 'STOP'", async () => {
    const { emitGoogleStream } = await import("../src/streaming/emitters")
    const events = yieldEvents([
      { type: "message_start", id: "msg_1", model: "gemini-pro" },
      { type: "content_delta", delta: { text: "Hello" } },
      { type: "message_end", stop_reason: "stop" },
    ])

    const stream = emitGoogleStream(events)
    const chunks = await collectSSE(stream)
    const allText = chunks.join("")
    expect(allText).toContain('"finishReason":"STOP"')
  })

  it("should map 'length' to Google 'MAX_TOKENS'", async () => {
    const { emitGoogleStream } = await import("../src/streaming/emitters")
    const events = yieldEvents([
      { type: "message_start", id: "msg_1", model: "gemini-pro" },
      { type: "content_delta", delta: { text: "Hello" } },
      { type: "message_end", stop_reason: "length" },
    ])

    const stream = emitGoogleStream(events)
    const chunks = await collectSSE(stream)
    const allText = chunks.join("")
    expect(allText).toContain('"finishReason":"MAX_TOKENS"')
  })

  it("should map 'tool_calls' to Anthropic 'tool_use'", async () => {
    const { emitAnthropicStream } = await import("../src/streaming/emitters")
    const events = yieldEvents([
      { type: "message_start", id: "msg_1", model: "claude-3" },
      { type: "tool_call_start", tool_call: { id: "call_1", name: "search" } },
      { type: "tool_call_delta", tool_call: { id: "call_1", arguments_delta: '{"q":"test"}' } },
      { type: "tool_call_end", tool_call: { id: "call_1" } },
      { type: "message_end", stop_reason: "tool_calls" },
    ])

    const stream = emitAnthropicStream(events)
    const chunks = await collectSSE(stream)
    const allText = chunks.join("")
    expect(allText).toContain('"stop_reason":"tool_use"')
  })
})
