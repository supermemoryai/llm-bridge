import { describe, it, expect } from "vitest"
import { toUniversal, fromUniversal } from "../src/models"
import { openaiToUniversal } from "../src/models/openai-format"
import { anthropicToUniversal } from "../src/models/anthropic-format"
import { googleToUniversal } from "../src/models/google-format"

describe("Validation", () => {
  describe("Empty messages array", () => {
    it("should handle OpenAI with empty messages", () => {
      const body = { model: "gpt-4", messages: [] } as any
      const result = openaiToUniversal(body)
      expect(result.messages).toEqual([])
      expect(result.model).toBe("gpt-4")
      expect(result.provider).toBe("openai")
    })

    it("should handle Anthropic with empty messages", () => {
      const body = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        messages: [],
      } as any
      const result = anthropicToUniversal(body)
      expect(result.messages).toEqual([])
      expect(result.model).toBe("claude-3-5-sonnet-20241022")
      expect(result.provider).toBe("anthropic")
    })

    it("should handle Google with empty contents", () => {
      const body = { contents: [] } as any
      const result = googleToUniversal(body)
      expect(result.messages).toEqual([])
      expect(result.provider).toBe("google")
    })
  })

  describe("Missing model field", () => {
    it("should provide fallback model for OpenAI", () => {
      const body = { messages: [{ role: "user", content: "Hello" }] } as any
      const result = openaiToUniversal(body)
      expect(result.model).toBeDefined()
      // Should not crash; model may be empty string or fallback
      expect(typeof result.model).toBe("string")
    })

    it("should provide fallback model for Anthropic", () => {
      // When messages is undefined/malformed, falls back to "unknown"
      const body = { max_tokens: 1024 } as any
      const result = anthropicToUniversal(body)
      expect(result.model).toBe("unknown")
    })

    it("should provide fallback model for Google", () => {
      const body = {
        contents: [
          { role: "user", parts: [{ text: "Hello" }] },
        ],
      } as any
      const result = googleToUniversal(body)
      expect(result.model).toBeDefined()
      expect(typeof result.model).toBe("string")
    })
  })

  describe("Invalid provider type", () => {
    it("should throw on unsupported provider in toUniversal", () => {
      expect(() => {
        toUniversal("invalid_provider" as any, {} as any)
      }).toThrow(/[Uu]nsupported provider/)
    })

    it("should throw on unsupported provider in fromUniversal", () => {
      expect(() => {
        fromUniversal("invalid_provider" as any, {
          provider: "invalid_provider" as any,
          model: "test",
          messages: [],
        } as any)
      }).toThrow(/[Uu]nsupported provider/)
    })
  })

  describe("Malformed content blocks", () => {
    it("should handle OpenAI message with null content", () => {
      const body = {
        model: "gpt-4",
        messages: [
          { role: "assistant", content: null },
        ],
      } as any
      const result = openaiToUniversal(body)
      expect(result.messages).toBeDefined()
      expect(result.messages).toHaveLength(1)
    })

    it("should handle Anthropic message with string content", () => {
      const body = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        messages: [
          { role: "user", content: "Simple string" },
        ],
      } as any
      const result = anthropicToUniversal(body)
      expect(result.messages).toHaveLength(1)
      expect(result.messages[0].content[0].text).toBe("Simple string")
    })

    it("should handle Anthropic message with mixed content array", () => {
      const body = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Look at this" },
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/png",
                  data: "abc123",
                },
              },
            ],
          },
        ],
      } as any
      const result = anthropicToUniversal(body)
      expect(result.messages).toHaveLength(1)
      expect(result.messages[0].content.length).toBeGreaterThanOrEqual(1)
      expect(result.messages[0].content[0].text).toBe("Look at this")
    })

    it("should handle Google message with empty parts", () => {
      const body = {
        contents: [{ role: "user", parts: [] }],
      } as any
      const result = googleToUniversal(body)
      expect(result.messages).toBeDefined()
    })
  })

  describe("Missing required fields in tool definitions", () => {
    it("should handle OpenAI tool without description", () => {
      const body = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }],
        tools: [
          {
            type: "function",
            function: {
              name: "my_tool",
              parameters: { type: "object" },
            },
          },
        ],
      } as any

      const result = openaiToUniversal(body)
      expect(result.tools).toHaveLength(1)
      expect(result.tools![0].name).toBe("my_tool")
      expect(result.tools![0].description).toBe("")
    })

    it("should handle OpenAI tool without parameters", () => {
      const body = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }],
        tools: [
          {
            type: "function",
            function: {
              name: "no_params_tool",
              description: "Tool with no params",
            },
          },
        ],
      } as any

      const result = openaiToUniversal(body)
      expect(result.tools).toHaveLength(1)
      expect(result.tools![0].name).toBe("no_params_tool")
      expect(result.tools![0].parameters).toEqual({})
    })

    it("should handle Anthropic tool with minimal definition", () => {
      const body = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        messages: [{ role: "user", content: "Hello" }],
        tools: [
          {
            name: "minimal_tool",
            input_schema: { type: "object" },
          },
        ],
      } as any

      const result = anthropicToUniversal(body)
      expect(result.tools).toHaveLength(1)
      expect(result.tools![0].name).toBe("minimal_tool")
      // Description should have a fallback value
      expect(result.tools![0].description).toBeDefined()
    })
  })

  describe("Invalid tool_choice values", () => {
    it("should pass through none tool_choice for OpenAI", () => {
      const body = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }],
        tool_choice: "none",
      } as any

      const result = openaiToUniversal(body)
      expect(result.tool_choice).toBe("none")
    })

    it("should handle auto tool_choice for Anthropic", () => {
      const body = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        messages: [{ role: "user", content: "Hello" }],
        tool_choice: "auto",
      } as any

      const result = anthropicToUniversal(body)
      expect(result.tool_choice).toBe("auto")
    })

    it("should handle object-style tool_choice for OpenAI", () => {
      const body = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }],
        tool_choice: { type: "function", function: { name: "specific" } },
      } as any

      const result = openaiToUniversal(body)
      expect(result.tool_choice).toBeDefined()
    })
  })

  describe("Null/undefined body handling", () => {
    it("should handle OpenAI body with undefined messages", () => {
      const body = { model: "gpt-4" } as any
      const result = openaiToUniversal(body)
      expect(result.messages).toEqual([])
      expect(result.provider).toBe("openai")
    })

    it("should handle OpenAI body with null messages", () => {
      const body = { model: "gpt-4", messages: null } as any
      const result = openaiToUniversal(body)
      expect(result.messages).toEqual([])
    })

    it("should handle Anthropic body with undefined messages", () => {
      const body = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
      } as any
      const result = anthropicToUniversal(body)
      expect(result.messages).toEqual([])
      expect(result.provider).toBe("anthropic")
    })

    it("should handle Anthropic body with null messages", () => {
      const body = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        messages: null,
      } as any
      const result = anthropicToUniversal(body)
      expect(result.messages).toEqual([])
    })

    it("should handle Google body with undefined contents", () => {
      const body = {} as any
      const result = googleToUniversal(body)
      expect(result.messages).toEqual([])
      expect(result.provider).toBe("google")
    })

    it("should handle Google body with null contents", () => {
      const body = { contents: null } as any
      const result = googleToUniversal(body)
      expect(result.messages).toEqual([])
    })

    it("should handle non-array messages for OpenAI", () => {
      const body = { model: "gpt-4", messages: "not-an-array" } as any
      const result = openaiToUniversal(body)
      expect(result.messages).toEqual([])
    })

    it("should handle non-array messages for Anthropic", () => {
      const body = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        messages: 42,
      } as any
      const result = anthropicToUniversal(body)
      expect(result.messages).toEqual([])
    })

    it("should handle completely empty body for Anthropic", () => {
      const body = {} as any
      const result = anthropicToUniversal(body)
      expect(result.provider).toBe("anthropic")
      expect(result.model).toBe("unknown")
      expect(result.messages).toEqual([])
      expect(result.max_tokens).toBe(1024)
    })

    it("should handle toUniversal with malformed bodies", () => {
      // OpenAI
      const openaiResult = toUniversal("openai", { model: "gpt-4" } as any)
      expect(openaiResult.messages).toEqual([])
      expect(openaiResult.provider).toBe("openai")

      // Anthropic
      const anthropicResult = toUniversal("anthropic", {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
      } as any)
      expect(anthropicResult.messages).toEqual([])
      expect(anthropicResult.provider).toBe("anthropic")

      // Google
      const googleResult = toUniversal("google", {} as any)
      expect(googleResult.messages).toEqual([])
      expect(googleResult.provider).toBe("google")
    })
  })
})
