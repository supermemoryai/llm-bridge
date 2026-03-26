import { describe, it, expect } from "vitest"
import { toUniversal, fromUniversal } from "../src/models/index.js"

describe("Cross-provider conversions", () => {
  describe("OpenAI → Anthropic", () => {
    it("should convert OpenAI text messages to Anthropic format", () => {
      const openaiBody = {
        model: "gpt-4o",
        messages: [
          { role: "system" as const, content: "You are helpful." },
          { role: "user" as const, content: "Hello!" },
          { role: "assistant" as const, content: "Hi there! How can I help?" },
        ],
      }

      const universal = toUniversal("openai", openaiBody)
      const anthropic = fromUniversal("anthropic", {
        ...universal,
        provider: "anthropic",
        max_tokens: 1024,
      } as any) as any

      expect(anthropic.system).toBe("You are helpful.")
      expect(anthropic.messages).toHaveLength(2)
      expect(anthropic.messages[0].role).toBe("user")
      expect(anthropic.messages[0].content[0].text).toBe("Hello!")
      expect(anthropic.messages[1].role).toBe("assistant")
      expect(anthropic.messages[1].content[0].text).toBe("Hi there! How can I help?")
    })
  })

  describe("OpenAI → Google", () => {
    it("should convert OpenAI text messages to Google format", () => {
      const openaiBody = {
        model: "gpt-4o",
        messages: [
          { role: "system" as const, content: "You are helpful." },
          { role: "user" as const, content: "Hello!" },
          { role: "assistant" as const, content: "Hi there!" },
        ],
      }

      const universal = toUniversal("openai", openaiBody)
      const google = fromUniversal("google", {
        ...universal,
        provider: "google",
      } as any) as any

      expect(google.systemInstruction).toBeDefined()
      expect(google.systemInstruction.parts[0].text).toBe("You are helpful.")
      expect(google.contents).toHaveLength(2)
      expect(google.contents[0].role).toBe("user")
      expect(google.contents[0].parts[0].text).toBe("Hello!")
      expect(google.contents[1].role).toBe("model")
      expect(google.contents[1].parts[0].text).toBe("Hi there!")
    })
  })

  describe("Anthropic → OpenAI", () => {
    it("should convert Anthropic text messages to OpenAI format", () => {
      const anthropicBody = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: "You are a pirate.",
        messages: [
          { role: "user" as const, content: "Ahoy!" },
          { role: "assistant" as const, content: "Arrr, hello matey!" },
        ],
      }

      const universal = toUniversal("anthropic", anthropicBody)
      const openai = fromUniversal("openai", {
        ...universal,
        provider: "openai",
      } as any) as any

      // System prompt should be in the messages as a system message
      expect(openai.messages[0].role).toBe("system")
      expect(openai.messages[0].content).toBe("You are a pirate.")
      expect(openai.messages[1].role).toBe("user")
      expect(openai.messages[1].content).toBe("Ahoy!")
      expect(openai.messages[2].role).toBe("assistant")
      expect(openai.messages[2].content).toBe("Arrr, hello matey!")
    })
  })

  describe("Anthropic → Google", () => {
    it("should convert Anthropic text messages to Google format", () => {
      const anthropicBody = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: "You are helpful.",
        messages: [
          { role: "user" as const, content: "What is TypeScript?" },
          { role: "assistant" as const, content: "TypeScript is a typed superset of JavaScript." },
        ],
      }

      const universal = toUniversal("anthropic", anthropicBody)
      const google = fromUniversal("google", {
        ...universal,
        provider: "google",
      } as any) as any

      expect(google.systemInstruction).toBeDefined()
      expect(google.systemInstruction.parts[0].text).toBe("You are helpful.")
      expect(google.contents).toHaveLength(2)
      expect(google.contents[0].role).toBe("user")
      expect(google.contents[0].parts[0].text).toBe("What is TypeScript?")
      expect(google.contents[1].role).toBe("model")
      expect(google.contents[1].parts[0].text).toBe("TypeScript is a typed superset of JavaScript.")
    })
  })

  describe("Google → OpenAI", () => {
    it("should convert Google text messages to OpenAI format", () => {
      const googleBody = {
        contents: [
          { role: "user", parts: [{ text: "Hello!" }] },
          { role: "model", parts: [{ text: "Hi!" }] },
        ],
        systemInstruction: {
          parts: [{ text: "You are friendly." }],
        },
      }

      const universal = toUniversal("google", googleBody)
      const openai = fromUniversal("openai", {
        ...universal,
        provider: "openai",
      } as any) as any

      expect(openai.messages[0].role).toBe("system")
      expect(openai.messages[0].content).toBe("You are friendly.")
      expect(openai.messages[1].role).toBe("user")
      expect(openai.messages[1].content).toBe("Hello!")
      expect(openai.messages[2].role).toBe("assistant")
      expect(openai.messages[2].content).toBe("Hi!")
    })
  })

  describe("Google → Anthropic", () => {
    it("should convert Google text messages to Anthropic format", () => {
      const googleBody = {
        contents: [
          { role: "user", parts: [{ text: "Hi there" }] },
          { role: "model", parts: [{ text: "Hello!" }] },
        ],
        systemInstruction: {
          parts: [{ text: "Be concise." }],
        },
      }

      const universal = toUniversal("google", googleBody)
      const anthropic = fromUniversal("anthropic", {
        ...universal,
        provider: "anthropic",
        max_tokens: 1024,
      } as any) as any

      expect(anthropic.system).toBe("Be concise.")
      expect(anthropic.messages).toHaveLength(2)
      expect(anthropic.messages[0].role).toBe("user")
      expect(anthropic.messages[0].content[0].text).toBe("Hi there")
      expect(anthropic.messages[1].role).toBe("assistant")
      expect(anthropic.messages[1].content[0].text).toBe("Hello!")
    })
  })

  describe("OpenAI Responses → OpenAI Chat", () => {
    it("should convert OpenAI Responses text to OpenAI Chat format", () => {
      const responsesBody = {
        model: "gpt-4o",
        input: [
          { role: "system", content: "You are helpful." },
          { role: "user", content: "Hello!" },
        ],
      }

      const universal = toUniversal("openai-responses", responsesBody)
      const openaiChat = fromUniversal("openai", {
        ...universal,
        provider: "openai",
      } as any) as any

      expect(openaiChat.messages[0].role).toBe("system")
      expect(openaiChat.messages[0].content).toBe("You are helpful.")
      expect(openaiChat.messages[1].role).toBe("user")
      expect(openaiChat.messages[1].content).toBe("Hello!")
    })
  })

  describe("tool calls across providers", () => {
    it("should convert OpenAI tools through universal to Anthropic format", () => {
      const openaiBody = {
        model: "gpt-4o",
        messages: [
          { role: "user" as const, content: "Get the weather" },
        ],
        tools: [
          {
            type: "function" as const,
            function: {
              name: "get_weather",
              description: "Get current weather",
              parameters: {
                type: "object",
                properties: {
                  location: { type: "string", description: "City name" },
                },
                required: ["location"],
              },
            },
          },
        ],
      }

      const universal = toUniversal("openai", openaiBody)
      const anthropic = fromUniversal("anthropic", {
        ...universal,
        provider: "anthropic",
        max_tokens: 1024,
      } as any) as any

      expect(anthropic.tools).toHaveLength(1)
      expect(anthropic.tools[0].name).toBe("get_weather")
      expect(anthropic.tools[0].description).toBe("Get current weather")
      expect(anthropic.tools[0].input_schema).toBeDefined()
      expect(anthropic.tools[0].input_schema.type).toBe("object")
      expect(anthropic.tools[0].input_schema.properties.location).toEqual({
        type: "string",
        description: "City name",
      })
    })

    it("should convert OpenAI tools through universal to Google format", () => {
      const openaiBody = {
        model: "gpt-4o",
        messages: [
          { role: "user" as const, content: "Get the weather" },
        ],
        tools: [
          {
            type: "function" as const,
            function: {
              name: "get_weather",
              description: "Get current weather",
              parameters: {
                type: "object",
                properties: {
                  location: { type: "string" },
                },
              },
            },
          },
        ],
      }

      const universal = toUniversal("openai", openaiBody)
      const google = fromUniversal("google", {
        ...universal,
        provider: "google",
      } as any) as any

      expect(google.tools).toHaveLength(1)
      expect(google.tools[0].functionDeclarations).toHaveLength(1)
      expect(google.tools[0].functionDeclarations[0].name).toBe("get_weather")
      expect(google.tools[0].functionDeclarations[0].description).toBe("Get current weather")
    })

    it("should convert Anthropic tools through universal to Google format", () => {
      const anthropicBody = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [
          { role: "user" as const, content: "Search for info" },
        ],
        tools: [
          {
            name: "search",
            description: "Search the web",
            input_schema: {
              type: "object" as const,
              properties: {
                query: { type: "string", description: "Search query" },
              },
              required: ["query"],
            },
          },
        ],
      }

      const universal = toUniversal("anthropic", anthropicBody)
      const google = fromUniversal("google", {
        ...universal,
        provider: "google",
      } as any) as any

      expect(google.tools).toHaveLength(1)
      expect(google.tools[0].functionDeclarations).toHaveLength(1)
      expect(google.tools[0].functionDeclarations[0].name).toBe("search")
      expect(google.tools[0].functionDeclarations[0].description).toBe("Search the web")
    })

    it("should convert Google tools through universal to OpenAI format", () => {
      const googleBody = {
        contents: [
          { role: "user", parts: [{ text: "Get weather" }] },
        ],
        tools: [
          {
            functionDeclarations: [
              {
                name: "get_weather",
                description: "Get weather data",
                parameters: {
                  type: "object",
                  properties: {
                    city: { type: "string" },
                  },
                },
              },
            ],
          },
        ],
      }

      const universal = toUniversal("google", googleBody)
      const openai = fromUniversal("openai", {
        ...universal,
        provider: "openai",
      } as any) as any

      expect(openai.tools).toHaveLength(1)
      expect(openai.tools[0].type).toBe("function")
      expect(openai.tools[0].function.name).toBe("get_weather")
      expect(openai.tools[0].function.description).toBe("Get weather data")
    })
  })

  describe("multimodal across providers", () => {
    it("should convert OpenAI image (data URL) to Anthropic base64 format", () => {
      const openaiBody = {
        model: "gpt-4o",
        messages: [
          {
            role: "user" as const,
            content: [
              {
                type: "image_url" as const,
                image_url: {
                  url: "data:image/png;base64,iVBORw0KGgo...",
                },
              },
              { type: "text" as const, text: "What is this?" },
            ],
          },
        ],
      }

      const universal = toUniversal("openai", openaiBody)
      const anthropic = fromUniversal("anthropic", {
        ...universal,
        provider: "anthropic",
        max_tokens: 1024,
      } as any) as any

      expect(anthropic.messages).toHaveLength(1)
      const content = anthropic.messages[0].content

      // Image should be converted to Anthropic base64 format
      const imageBlock = content.find((b: any) => b.type === "image")
      expect(imageBlock).toBeDefined()
      expect(imageBlock.source.type).toBe("base64")
      expect(imageBlock.source.data).toBe("iVBORw0KGgo...")
      expect(imageBlock.source.media_type).toBe("image/png")

      // Text should be preserved
      const textBlock = content.find((b: any) => b.type === "text")
      expect(textBlock).toBeDefined()
      expect(textBlock.text).toBe("What is this?")
    })

    it("should convert OpenAI image (data URL) to Google inlineData format", () => {
      const openaiBody = {
        model: "gpt-4o",
        messages: [
          {
            role: "user" as const,
            content: [
              {
                type: "image_url" as const,
                image_url: {
                  url: "data:image/jpeg;base64,/9j/4AAQ...",
                },
              },
              { type: "text" as const, text: "Describe this" },
            ],
          },
        ],
      }

      const universal = toUniversal("openai", openaiBody)
      const google = fromUniversal("google", {
        ...universal,
        provider: "google",
      } as any) as any

      expect(google.contents).toHaveLength(1)
      const parts = google.contents[0].parts

      const imagePart = parts.find((p: any) => p.inlineData)
      expect(imagePart).toBeDefined()
      expect(imagePart.inlineData.data).toBe("/9j/4AAQ...")
      expect(imagePart.inlineData.mimeType).toBe("image/jpeg")

      const textPart = parts.find((p: any) => p.text)
      expect(textPart).toBeDefined()
      expect(textPart.text).toBe("Describe this")
    })

    it("should convert Anthropic base64 image to Google inlineData", () => {
      const anthropicBody = {
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
              { type: "text" as const, text: "Describe this" },
            ],
          },
        ],
      }

      const universal = toUniversal("anthropic", anthropicBody)
      const google = fromUniversal("google", {
        ...universal,
        provider: "google",
      } as any) as any

      const parts = google.contents[0].parts
      const imagePart = parts.find((p: any) => p.inlineData)
      expect(imagePart).toBeDefined()
      expect(imagePart.inlineData.data).toBe("iVBORw0KGgo...")
      expect(imagePart.inlineData.mimeType).toBe("image/png")
    })

    it("should convert Google inlineData image to Anthropic base64", () => {
      const googleBody = {
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: "image/webp",
                  data: "UklGRgAA...",
                },
              },
              { text: "What is this?" },
            ],
          },
        ],
      }

      const universal = toUniversal("google", googleBody)
      const anthropic = fromUniversal("anthropic", {
        ...universal,
        provider: "anthropic",
        max_tokens: 1024,
      } as any) as any

      const content = anthropic.messages[0].content
      const imageBlock = content.find((b: any) => b.type === "image")
      expect(imageBlock).toBeDefined()
      expect(imageBlock.source.type).toBe("base64")
      expect(imageBlock.source.data).toBe("UklGRgAA...")
      expect(imageBlock.source.media_type).toBe("image/webp")
    })
  })

  describe("developer role", () => {
    it("should convert OpenAI developer message to Anthropic system prompt", () => {
      const openaiBody = {
        model: "gpt-4o",
        messages: [
          { role: "developer" as const, content: "You must always respond in JSON." },
          { role: "user" as const, content: "List 3 colors" },
        ],
      }

      const universal = toUniversal("openai", openaiBody)
      const anthropic = fromUniversal("anthropic", {
        ...universal,
        provider: "anthropic",
        max_tokens: 1024,
      } as any) as any

      // Developer messages should be merged into system for Anthropic
      expect(anthropic.system).toBe("You must always respond in JSON.")
      expect(anthropic.messages).toHaveLength(1)
      expect(anthropic.messages[0].role).toBe("user")
      expect(anthropic.messages[0].content[0].text).toBe("List 3 colors")
    })

    it("should convert OpenAI developer message to Google systemInstruction", () => {
      const openaiBody = {
        model: "gpt-4o",
        messages: [
          { role: "developer" as const, content: "Always respond in haiku." },
          { role: "user" as const, content: "Tell me about the weather" },
        ],
      }

      const universal = toUniversal("openai", openaiBody)
      const google = fromUniversal("google", {
        ...universal,
        provider: "google",
      } as any) as any

      // Developer messages should appear in systemInstruction for Google
      expect(google.systemInstruction).toBeDefined()
      expect(google.systemInstruction.parts.some((p: any) => p.text === "Always respond in haiku.")).toBe(true)
      expect(google.contents).toHaveLength(1)
      expect(google.contents[0].role).toBe("user")
      expect(google.contents[0].parts[0].text).toBe("Tell me about the weather")
    })

    it("should merge developer with existing system when converting to Anthropic", () => {
      const openaiBody = {
        model: "gpt-4o",
        messages: [
          { role: "system" as const, content: "You are a helpful assistant." },
          { role: "developer" as const, content: "Always be concise." },
          { role: "user" as const, content: "Hello" },
        ],
      }

      const universal = toUniversal("openai", openaiBody)
      const anthropic = fromUniversal("anthropic", {
        ...universal,
        provider: "anthropic",
        max_tokens: 1024,
      } as any) as any

      // Both system and developer content should be present
      expect(anthropic.system).toContain("You are a helpful assistant.")
      expect(anthropic.system).toContain("Always be concise.")
    })

    it("should merge developer with existing system when converting to Google", () => {
      const openaiBody = {
        model: "gpt-4o",
        messages: [
          { role: "system" as const, content: "You are an expert." },
          { role: "developer" as const, content: "Be brief." },
          { role: "user" as const, content: "Hello" },
        ],
      }

      const universal = toUniversal("openai", openaiBody)
      const google = fromUniversal("google", {
        ...universal,
        provider: "google",
      } as any) as any

      // Both system and developer text should appear in systemInstruction parts
      const allText = google.systemInstruction.parts.map((p: any) => p.text).join(" ")
      expect(allText).toContain("You are an expert.")
      expect(allText).toContain("Be brief.")
    })
  })

  describe("Cross-provider structured output", () => {
    it("should convert OpenAI json_schema to Google responseSchema", () => {
      const openaiBody = {
        model: "gpt-4o",
        messages: [{ role: "user" as const, content: "Extract name and age" }],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "person",
            schema: {
              type: "object",
              properties: {
                name: { type: "string" },
                age: { type: "number" },
              },
            },
          },
        },
      }

      const universal = toUniversal("openai", openaiBody)
      expect(universal.structured_output).toBeDefined()

      const google = fromUniversal("google", {
        ...universal,
        provider: "google",
      } as any) as any

      expect(google.generationConfig).toBeDefined()
      expect(google.generationConfig.responseMimeType).toBe("application/json")
      expect(google.generationConfig.responseSchema).toBeDefined()
      expect(google.generationConfig.responseSchema.type).toBe("object")
      expect(google.generationConfig.responseSchema.properties).toHaveProperty("name")
      expect(google.generationConfig.responseSchema.properties).toHaveProperty("age")
    })

    it("should convert Google responseSchema to OpenAI response_format", () => {
      const googleBody = {
        model: "gemini-2.0-flash",
        contents: [{ role: "user", parts: [{ text: "Extract data" }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              title: { type: "string" },
              count: { type: "integer" },
            },
          },
        },
      }

      const universal = toUniversal("google", googleBody)
      expect(universal.structured_output).toBeDefined()

      const openai = fromUniversal("openai", {
        ...universal,
        provider: "openai",
      } as any) as any

      expect(openai.response_format).toBeDefined()
      expect(openai.response_format.type).toBe("json_schema")
      expect(openai.response_format.json_schema).toBeDefined()
      expect(openai.response_format.json_schema.schema.properties).toHaveProperty("title")
      expect(openai.response_format.json_schema.schema.properties).toHaveProperty("count")
    })
  })
})
