import { describe, it, expect } from "vitest"
import { toUniversal, fromUniversal } from "../src/models/index.js"

describe("OpenAI Responses API ↔ Universal", () => {
  describe("Basic text input", () => {
    it("should convert string input to a single user message", () => {
      const body = {
        model: "gpt-4o",
        input: "What is the capital of France?",
      }

      const universal = toUniversal("openai-responses", body)

      expect(universal.provider).toBe("openai-responses")
      expect(universal.model).toBe("gpt-4o")
      expect(universal.messages).toHaveLength(1)
      expect(universal.messages[0].role).toBe("user")
      expect(universal.messages[0].content[0].type).toBe("text")
      expect(universal.messages[0].content[0].text).toBe("What is the capital of France?")
    })

    it("should convert array of input_text items", () => {
      const body = {
        model: "gpt-4o",
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: "Hello, how are you?" },
            ],
          },
        ],
      }

      const universal = toUniversal("openai-responses", body)

      expect(universal.messages).toHaveLength(1)
      expect(universal.messages[0].role).toBe("user")
      expect(universal.messages[0].content[0].type).toBe("text")
      expect(universal.messages[0].content[0].text).toBe("Hello, how are you?")
    })

    it("should handle multi-turn input with roles", () => {
      const body = {
        model: "gpt-4o",
        input: [
          { role: "user", content: "Hi" },
          { role: "assistant", content: "Hello! How can I help?" },
          { role: "user", content: "Tell me a joke." },
        ],
      }

      const universal = toUniversal("openai-responses", body)

      expect(universal.messages).toHaveLength(3)
      expect(universal.messages[0].role).toBe("user")
      expect(universal.messages[1].role).toBe("assistant")
      expect(universal.messages[2].role).toBe("user")
      expect(universal.messages[2].content[0].text).toBe("Tell me a joke.")
    })
  })

  describe("input_image content type", () => {
    it("should convert input_image to universal image type", () => {
      const body = {
        model: "gpt-4o",
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: "Describe this image." },
              {
                type: "input_image",
                image_url: "https://example.com/photo.jpg",
              },
            ],
          },
        ],
      }

      const universal = toUniversal("openai-responses", body)

      expect(universal.messages[0].content).toHaveLength(2)

      const textContent = universal.messages[0].content[0]
      expect(textContent.type).toBe("text")
      expect(textContent.text).toBe("Describe this image.")

      const imageContent = universal.messages[0].content[1]
      expect(imageContent.type).toBe("image")
      expect(imageContent.media?.url).toBe("https://example.com/photo.jpg")
    })

    it("should handle input_image with object-style image_url", () => {
      const body = {
        model: "gpt-4o",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_image",
                image_url: { url: "https://example.com/photo.jpg", detail: "high" },
              },
            ],
          },
        ],
      }

      const universal = toUniversal("openai-responses", body)
      const imageContent = universal.messages[0].content[0]

      expect(imageContent.type).toBe("image")
      expect(imageContent.media?.url).toBe("https://example.com/photo.jpg")
      expect(imageContent.media?.detail).toBe("high")
    })

    it("should extract mime type and data from data URLs", () => {
      const body = {
        model: "gpt-4o",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_image",
                image_url: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
              },
            ],
          },
        ],
      }

      const universal = toUniversal("openai-responses", body)
      const imageContent = universal.messages[0].content[0]

      expect(imageContent.type).toBe("image")
      expect(imageContent.media?.mimeType).toBe("image/jpeg")
      expect(imageContent.media?.data).toBe("/9j/4AAQSkZJRg==")
    })
  })

  describe("function_call_output items → universal tool results", () => {
    it("should convert function_call_output to tool result messages", () => {
      const body = {
        model: "gpt-4o",
        input: [
          { role: "user", content: "What's the weather?" },
          {
            type: "function_call_output",
            call_id: "call_xyz789",
            output: '{"temp": 20, "condition": "sunny"}',
          },
        ],
      }

      const universal = toUniversal("openai-responses", body)

      expect(universal.messages).toHaveLength(2)

      const toolMsg = universal.messages[1]
      expect(toolMsg.role).toBe("tool")
      expect(toolMsg.content[0].type).toBe("tool_result")
      expect(toolMsg.content[0].tool_result?.tool_call_id).toBe("call_xyz789")
      expect(toolMsg.content[0].tool_result?.result).toBe('{"temp": 20, "condition": "sunny"}')
      expect(toolMsg.metadata.tool_call_id).toBe("call_xyz789")
    })
  })

  describe("Tool definitions (flattened format)", () => {
    it("should convert flattened tool format: tools[].name instead of tools[].function.name", () => {
      const body = {
        model: "gpt-4o",
        input: [
          { role: "user", content: "Get weather" },
        ],
        tools: [
          {
            type: "function",
            name: "get_weather",
            description: "Get the weather for a city",
            strict: true,
            parameters: {
              type: "object",
              properties: { city: { type: "string" } },
              required: ["city"],
            },
          },
        ],
      }

      const universal = toUniversal("openai-responses", body)

      expect(universal.tools).toHaveLength(1)
      expect(universal.tools![0].name).toBe("get_weather")
      expect(universal.tools![0].description).toBe("Get the weather for a city")
      expect(universal.tools![0].metadata?.strict).toBe(true)
      expect(universal.tools![0].metadata?.type).toBe("function")
      expect(universal.tools![0].parameters).toEqual({
        type: "object",
        properties: { city: { type: "string" } },
        required: ["city"],
      })
    })
  })

  describe("max_output_tokens → max_tokens mapping", () => {
    it("should map max_output_tokens to universal max_tokens", () => {
      const body = {
        model: "gpt-4o",
        input: [{ role: "user", content: "Hello" }],
        max_output_tokens: 2048,
      }

      const universal = toUniversal("openai-responses", body)

      expect(universal.max_tokens).toBe(2048)
    })
  })

  describe("reasoning config → universal thinking config", () => {
    it("should convert reasoning config to universal thinking", () => {
      const body = {
        model: "o1",
        input: [{ role: "user", content: "Solve this complex problem step by step." }],
        reasoning: {
          effort: "high",
          summary: "auto",
        },
      }

      const universal = toUniversal("openai-responses", body)

      expect(universal.thinking).toBeDefined()
      expect(universal.thinking!.enabled).toBe(true)
      expect(universal.thinking!.effort).toBe("high")
      expect(universal.reasoning_effort).toBe("high")
      expect(universal.provider_params?.reasoning_summary).toBe("auto")
    })
  })

  describe("text.format with json_schema → universal structured_output", () => {
    it("should convert json_schema text format to universal structured_output", () => {
      const body = {
        model: "gpt-4o",
        input: [{ role: "user", content: "Extract the person's details." }],
        text: {
          format: {
            type: "json_schema",
            name: "person_info",
            strict: true,
            schema: {
              type: "object",
              properties: {
                name: { type: "string" },
                age: { type: "number" },
              },
              required: ["name", "age"],
              additionalProperties: false,
            },
          },
        },
      }

      const universal = toUniversal("openai-responses", body)

      expect(universal.structured_output).toBeDefined()
      expect(universal.structured_output!.type).toBe("json_schema")
      expect(universal.structured_output!.json_schema).toEqual({
        name: "person_info",
        strict: true,
        schema: {
          type: "object",
          properties: {
            name: { type: "string" },
            age: { type: "number" },
          },
          required: ["name", "age"],
          additionalProperties: false,
        },
      })
    })

    it("should convert json_object text format to universal structured_output", () => {
      const body = {
        model: "gpt-4o",
        input: [{ role: "user", content: "Return JSON." }],
        text: {
          format: { type: "json_object" },
        },
      }

      const universal = toUniversal("openai-responses", body)

      expect(universal.structured_output).toBeDefined()
      expect(universal.structured_output!.type).toBe("json_object")
    })
  })

  describe("Built-in tools pass-through in provider_params", () => {
    it("should preserve web_search_preview in provider_params builtin_tools", () => {
      const body = {
        model: "gpt-4o",
        input: [{ role: "user", content: "Search for the latest news." }],
        tools: [
          { type: "web_search_preview" },
          {
            type: "function",
            name: "get_info",
            description: "Get info",
            parameters: { type: "object", properties: {} },
          },
        ],
      }

      const universal = toUniversal("openai-responses", body)

      // Only function tools should be in universal tools
      expect(universal.tools).toHaveLength(1)
      expect(universal.tools![0].name).toBe("get_info")

      // Built-in tools in provider_params
      expect(universal.provider_params?.builtin_tools).toBeDefined()
      expect(universal.provider_params!.builtin_tools).toHaveLength(1)
      expect((universal.provider_params!.builtin_tools as any[])[0].type).toBe("web_search_preview")
    })
  })

  describe("Round-trip: openai-responses → universal → openai-responses", () => {
    it("should round-trip basic conversation", () => {
      const original = {
        model: "gpt-4o",
        input: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "Hello!" },
        ],
        temperature: 0.8,
        max_output_tokens: 500,
        top_p: 0.9,
      }

      const universal = toUniversal("openai-responses", original)
      const roundTripped = fromUniversal("openai-responses", universal) as any

      expect(roundTripped.model).toBe("gpt-4o")
      expect(roundTripped.temperature).toBe(0.8)
      expect(roundTripped.max_output_tokens).toBe(500)
      expect(roundTripped.top_p).toBe(0.9)

      // Should have system + user in input
      expect(roundTripped.input).toHaveLength(2)
      expect(roundTripped.input[0].role).toBe("system")
      expect(roundTripped.input[1].role).toBe("user")
    })

    it("should round-trip function tools in flattened format", () => {
      const original = {
        model: "gpt-4o",
        input: [
          { role: "user", content: "Look up the weather" },
        ],
        tools: [
          {
            type: "function",
            name: "get_weather",
            description: "Get weather",
            strict: true,
            parameters: {
              type: "object",
              properties: { city: { type: "string" } },
              required: ["city"],
            },
          },
        ],
      }

      const universal = toUniversal("openai-responses", original)
      const roundTripped = fromUniversal("openai-responses", universal) as any

      expect(roundTripped.tools).toHaveLength(1)
      expect(roundTripped.tools[0].type).toBe("function")
      expect(roundTripped.tools[0].name).toBe("get_weather")
      expect(roundTripped.tools[0].strict).toBe(true)
      expect(roundTripped.tools[0].parameters).toEqual(original.tools[0].parameters)
    })

    it("should round-trip function_call_output items", () => {
      const original = {
        model: "gpt-4o",
        input: [
          { role: "user", content: "Get the weather" },
          {
            type: "function_call_output",
            call_id: "call_abc",
            output: '{"temp":25}',
          },
        ],
      }

      const universal = toUniversal("openai-responses", original)
      const roundTripped = fromUniversal("openai-responses", universal) as any

      // Should have user message + function_call_output
      expect(roundTripped.input).toHaveLength(2)

      const fcOutput = roundTripped.input.find((i: any) => i.type === "function_call_output")
      expect(fcOutput).toBeDefined()
      expect(fcOutput.call_id).toBe("call_abc")
      expect(fcOutput.output).toBe('{"temp":25}')
    })

    it("should round-trip reasoning config", () => {
      const original = {
        model: "o1",
        input: "Think carefully.",
        reasoning: {
          effort: "high",
          summary: "auto",
        },
      }

      const universal = toUniversal("openai-responses", original)
      const roundTripped = fromUniversal("openai-responses", universal) as any

      expect(roundTripped.reasoning).toBeDefined()
      expect(roundTripped.reasoning.effort).toBe("high")
      expect(roundTripped.reasoning.summary).toBe("auto")
    })

    it("should round-trip structured output via text.format", () => {
      const original = {
        model: "gpt-4o",
        input: "Extract data.",
        text: {
          format: {
            type: "json_schema",
            name: "data",
            strict: true,
            schema: {
              type: "object",
              properties: { key: { type: "string" } },
              required: ["key"],
              additionalProperties: false,
            },
          },
        },
      }

      const universal = toUniversal("openai-responses", original)
      const roundTripped = fromUniversal("openai-responses", universal) as any

      expect(roundTripped.text).toBeDefined()
      expect(roundTripped.text.format.type).toBe("json_schema")
      expect(roundTripped.text.format.name).toBe("data")
      expect(roundTripped.text.format.strict).toBe(true)
      expect(roundTripped.text.format.schema).toEqual(original.text.format.schema)
    })

    it("should round-trip built-in tools alongside function tools", () => {
      const original = {
        model: "gpt-4o",
        input: [{ role: "user", content: "Search for news" }],
        tools: [
          { type: "web_search_preview" },
          {
            type: "function",
            name: "summarize",
            description: "Summarize text",
            parameters: { type: "object", properties: { text: { type: "string" } } },
          },
        ],
      }

      const universal = toUniversal("openai-responses", original)
      const roundTripped = fromUniversal("openai-responses", universal) as any

      expect(roundTripped.tools).toHaveLength(2)

      const builtinTool = roundTripped.tools.find((t: any) => t.type === "web_search_preview")
      expect(builtinTool).toBeDefined()

      const funcTool = roundTripped.tools.find((t: any) => t.type === "function")
      expect(funcTool).toBeDefined()
      expect(funcTool.name).toBe("summarize")
    })
  })
})
