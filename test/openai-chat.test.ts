import { describe, it, expect } from "vitest"
import { toUniversal, fromUniversal } from "../src/models/index.js"

describe("OpenAI Chat Completions ↔ Universal", () => {
  describe("Basic text messages", () => {
    it("should convert user + assistant messages to universal", () => {
      const body = {
        model: "gpt-4o",
        messages: [
          { role: "user" as const, content: "What is the capital of France?" },
          { role: "assistant" as const, content: "The capital of France is Paris." },
        ],
      }

      const universal = toUniversal("openai", body)

      expect(universal.provider).toBe("openai")
      expect(universal.model).toBe("gpt-4o")
      expect(universal.messages).toHaveLength(2)

      // User message
      expect(universal.messages[0].role).toBe("user")
      expect(universal.messages[0].content).toHaveLength(1)
      expect(universal.messages[0].content[0].type).toBe("text")
      expect(universal.messages[0].content[0].text).toBe("What is the capital of France?")

      // Assistant message
      expect(universal.messages[1].role).toBe("assistant")
      expect(universal.messages[1].content[0].text).toBe("The capital of France is Paris.")
    })
  })

  describe("System message", () => {
    it("should extract system message to universal system field", () => {
      const body = {
        model: "gpt-4o",
        messages: [
          { role: "system" as const, content: "You are a helpful assistant." },
          { role: "user" as const, content: "Hello" },
        ],
      }

      const universal = toUniversal("openai", body)

      expect(universal.system).toBe("You are a helpful assistant.")
      // System message should NOT appear in messages array
      expect(universal.messages).toHaveLength(1)
      expect(universal.messages[0].role).toBe("user")
    })
  })

  describe("Developer role message", () => {
    it("should preserve developer role as a regular message, not merged with system", () => {
      const body = {
        model: "gpt-4o",
        messages: [
          { role: "system" as const, content: "You are a helpful assistant." },
          { role: "developer" as const, content: "Follow these guidelines strictly." },
          { role: "user" as const, content: "Hello" },
        ],
      }

      const universal = toUniversal("openai", body)

      // System is extracted
      expect(universal.system).toBe("You are a helpful assistant.")
      // Developer should be in messages, not merged into system
      expect(universal.messages).toHaveLength(2)
      expect(universal.messages[0].role).toBe("developer")
      expect(universal.messages[0].content[0].text).toBe("Follow these guidelines strictly.")
      expect(universal.messages[1].role).toBe("user")
    })
  })

  describe("Multi-turn conversation", () => {
    it("should convert a multi-turn conversation preserving order", () => {
      const body = {
        model: "gpt-4o-mini",
        messages: [
          { role: "system" as const, content: "You are a math tutor." },
          { role: "user" as const, content: "What is 2+2?" },
          { role: "assistant" as const, content: "2+2 equals 4." },
          { role: "user" as const, content: "And 3+3?" },
          { role: "assistant" as const, content: "3+3 equals 6." },
          { role: "user" as const, content: "Thanks!" },
        ],
      }

      const universal = toUniversal("openai", body)

      expect(universal.system).toBe("You are a math tutor.")
      expect(universal.messages).toHaveLength(5)
      expect(universal.messages[0].role).toBe("user")
      expect(universal.messages[1].role).toBe("assistant")
      expect(universal.messages[2].role).toBe("user")
      expect(universal.messages[3].role).toBe("assistant")
      expect(universal.messages[4].role).toBe("user")
      expect(universal.messages[4].content[0].text).toBe("Thanks!")
    })
  })

  describe("Tool definitions with strict field", () => {
    it("should convert tool definitions preserving strict metadata", () => {
      const body = {
        model: "gpt-4o",
        messages: [
          { role: "user" as const, content: "What's the weather in London?" },
        ],
        tools: [
          {
            type: "function" as const,
            function: {
              name: "get_weather",
              description: "Get current weather for a location",
              strict: true,
              parameters: {
                type: "object",
                properties: {
                  location: { type: "string", description: "City name" },
                },
                required: ["location"],
                additionalProperties: false,
              },
            },
          },
        ],
      }

      const universal = toUniversal("openai", body)

      expect(universal.tools).toHaveLength(1)
      expect(universal.tools![0].name).toBe("get_weather")
      expect(universal.tools![0].description).toBe("Get current weather for a location")
      expect(universal.tools![0].parameters).toEqual({
        type: "object",
        properties: {
          location: { type: "string", description: "City name" },
        },
        required: ["location"],
        additionalProperties: false,
      })
      expect(universal.tools![0].metadata?.strict).toBe(true)
      expect(universal.tools![0].metadata?.type).toBe("function")
    })
  })

  describe("Tool calls and tool results", () => {
    it("should convert assistant tool_calls and tool result messages", () => {
      const body = {
        model: "gpt-4o",
        messages: [
          { role: "user" as const, content: "What's the weather?" },
          {
            role: "assistant" as const,
            content: null,
            tool_calls: [
              {
                id: "call_abc123",
                type: "function" as const,
                function: {
                  name: "get_weather",
                  arguments: '{"location":"London"}',
                },
              },
            ],
          },
          {
            role: "tool" as const,
            tool_call_id: "call_abc123",
            content: '{"temp": 15, "condition": "cloudy"}',
          },
        ],
      }

      const universal = toUniversal("openai", body)

      expect(universal.messages).toHaveLength(3)

      // Assistant with tool calls
      const assistantMsg = universal.messages[1]
      expect(assistantMsg.role).toBe("assistant")
      expect(assistantMsg.tool_calls).toHaveLength(1)
      expect(assistantMsg.tool_calls![0].id).toBe("call_abc123")
      expect(assistantMsg.tool_calls![0].name).toBe("get_weather")
      expect(assistantMsg.tool_calls![0].arguments).toEqual({ location: "London" })

      // Tool result
      const toolMsg = universal.messages[2]
      expect(toolMsg.role).toBe("tool")
      expect(toolMsg.content[0].type).toBe("tool_result")
      expect(toolMsg.content[0].tool_result?.tool_call_id).toBe("call_abc123")
      expect(toolMsg.content[0].tool_result?.result).toBe('{"temp": 15, "condition": "cloudy"}')
      expect(toolMsg.metadata.tool_call_id).toBe("call_abc123")
    })
  })

  describe("Multimodal: image_url content", () => {
    it("should convert image_url content to universal image type", () => {
      const body = {
        model: "gpt-4o",
        messages: [
          {
            role: "user" as const,
            content: [
              { type: "text" as const, text: "What's in this image?" },
              {
                type: "image_url" as const,
                image_url: {
                  url: "https://example.com/cat.jpg",
                  detail: "high" as const,
                },
              },
            ],
          },
        ],
      }

      const universal = toUniversal("openai", body)

      expect(universal.messages).toHaveLength(1)
      expect(universal.messages[0].content).toHaveLength(2)

      const textContent = universal.messages[0].content[0]
      expect(textContent.type).toBe("text")
      expect(textContent.text).toBe("What's in this image?")

      const imageContent = universal.messages[0].content[1]
      expect(imageContent.type).toBe("image")
      expect(imageContent.media?.url).toBe("https://example.com/cat.jpg")
      expect(imageContent.media?.detail).toBe("high")
    })

    it("should parse data URLs extracting mime type and base64 data", () => {
      const body = {
        model: "gpt-4o",
        messages: [
          {
            role: "user" as const,
            content: [
              {
                type: "image_url" as const,
                image_url: {
                  url: "data:image/png;base64,iVBORw0KGgo=",
                },
              },
            ],
          },
        ],
      }

      const universal = toUniversal("openai", body)
      const imageContent = universal.messages[0].content[0]

      expect(imageContent.type).toBe("image")
      expect(imageContent.media?.url).toBe("data:image/png;base64,iVBORw0KGgo=")
      expect(imageContent.media?.mimeType).toBe("image/png")
      expect(imageContent.media?.data).toBe("iVBORw0KGgo=")
    })
  })

  describe("response_format with json_schema → structured_output", () => {
    it("should map json_schema response_format to universal structured_output", () => {
      const body = {
        model: "gpt-4o",
        messages: [
          { role: "user" as const, content: "Extract the name and age." },
        ],
        response_format: {
          type: "json_schema" as const,
          json_schema: {
            name: "person",
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

      const universal = toUniversal("openai", body)

      expect(universal.structured_output).toBeDefined()
      expect(universal.structured_output!.type).toBe("json_schema")
      expect(universal.structured_output!.json_schema).toEqual({
        name: "person",
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
      // Also preserved in provider_params
      expect(universal.provider_params?.response_format).toBeDefined()
    })

    it("should map json_object response_format to universal structured_output", () => {
      const body = {
        model: "gpt-4o",
        messages: [
          { role: "user" as const, content: "Return JSON." },
        ],
        response_format: { type: "json_object" as const },
      }

      const universal = toUniversal("openai", body)

      expect(universal.structured_output).toBeDefined()
      expect(universal.structured_output!.type).toBe("json_object")
    })
  })

  describe("reasoning_effort preservation", () => {
    it("should preserve reasoning_effort in provider_params and top-level", () => {
      const body = {
        model: "o1",
        messages: [
          { role: "user" as const, content: "Solve this complex problem." },
        ],
        reasoning_effort: "high",
      } as any

      const universal = toUniversal("openai", body)

      expect(universal.provider_params?.reasoning_effort).toBe("high")
      expect(universal.reasoning_effort).toBe("high")
    })
  })

  describe("Round-trip: openai → universal → openai", () => {
    it("should preserve key fields through round-trip", () => {
      const original = {
        model: "gpt-4o",
        messages: [
          { role: "system" as const, content: "You are a helpful assistant." },
          { role: "user" as const, content: "Hello!" },
          { role: "assistant" as const, content: "Hi there! How can I help?" },
          { role: "user" as const, content: "Tell me a joke." },
        ],
        temperature: 0.7,
        max_tokens: 1000,
        top_p: 0.95,
        frequency_penalty: 0.5,
        presence_penalty: 0.2,
        seed: 42,
      }

      const universal = toUniversal("openai", original)
      const roundTripped = fromUniversal("openai", universal) as any

      expect(roundTripped.model).toBe("gpt-4o")
      expect(roundTripped.temperature).toBe(0.7)
      expect(roundTripped.max_tokens).toBe(1000)
      expect(roundTripped.top_p).toBe(0.95)
      expect(roundTripped.frequency_penalty).toBe(0.5)
      expect(roundTripped.presence_penalty).toBe(0.2)
      expect(roundTripped.seed).toBe(42)

      // Messages should include system + non-system messages
      expect(roundTripped.messages).toHaveLength(4)
      expect(roundTripped.messages[0].role).toBe("system")
      expect(roundTripped.messages[0].content).toBe("You are a helpful assistant.")
      expect(roundTripped.messages[1].role).toBe("user")
      expect(roundTripped.messages[1].content).toBe("Hello!")
      expect(roundTripped.messages[2].role).toBe("assistant")
      expect(roundTripped.messages[3].role).toBe("user")
    })

    it("should round-trip tool definitions", () => {
      const original = {
        model: "gpt-4o",
        messages: [
          { role: "user" as const, content: "Get the weather" },
        ],
        tools: [
          {
            type: "function" as const,
            function: {
              name: "get_weather",
              description: "Get the weather",
              strict: true,
              parameters: {
                type: "object",
                properties: { city: { type: "string" } },
                required: ["city"],
                additionalProperties: false,
              },
            },
          },
        ],
      }

      const universal = toUniversal("openai", original)
      const roundTripped = fromUniversal("openai", universal) as any

      expect(roundTripped.tools).toHaveLength(1)
      expect(roundTripped.tools[0].type).toBe("function")
      expect(roundTripped.tools[0].function.name).toBe("get_weather")
      expect(roundTripped.tools[0].function.strict).toBe(true)
      expect(roundTripped.tools[0].function.parameters).toEqual(
        original.tools[0].function.parameters,
      )
    })

    it("should round-trip json_schema response_format via structured_output", () => {
      const original = {
        model: "gpt-4o",
        messages: [
          { role: "user" as const, content: "Extract info." },
        ],
        response_format: {
          type: "json_schema" as const,
          json_schema: {
            name: "extraction",
            strict: true,
            schema: {
              type: "object",
              properties: { value: { type: "string" } },
              required: ["value"],
              additionalProperties: false,
            },
          },
        },
      }

      const universal = toUniversal("openai", original)
      const roundTripped = fromUniversal("openai", universal) as any

      expect(roundTripped.response_format).toBeDefined()
      expect(roundTripped.response_format.type).toBe("json_schema")
      expect(roundTripped.response_format.json_schema.name).toBe("extraction")
      expect(roundTripped.response_format.json_schema.strict).toBe(true)
      expect(roundTripped.response_format.json_schema.schema).toEqual(
        original.response_format.json_schema.schema,
      )
    })

    it("should round-trip reasoning_effort", () => {
      const original = {
        model: "o1",
        messages: [
          { role: "user" as const, content: "Think hard." },
        ],
        reasoning_effort: "medium",
      } as any

      const universal = toUniversal("openai", original)
      const roundTripped = fromUniversal("openai", universal) as any

      expect(roundTripped.reasoning_effort).toBe("medium")
    })
  })
})
