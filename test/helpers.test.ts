import { describe, it, expect } from "vitest"
import { 
  generateId, 
  getTextContent, 
  hasToolCalls, 
  hasMultimodalContent, 
  extractToolCalls, 
  addTextContent, 
  replaceTextContent, 
  countTokens, 
  validateUniversalBody 
} from "../src/helpers/utils"
import { 
  canPerfectlyReconstruct, 
  getReconstructionQuality, 
  getOriginalDataSummary, 
  fromUniversalWithInfo 
} from "../src/helpers/reconstructing"
import { isUniversalMessage, isUniversalBody } from "../src/helpers/type-guards"
import { UniversalBody, UniversalMessage } from "../src/types/universal"

describe("utils", () => {
  describe("generateId", () => {
    it("should generate valid message ID", () => {
      const id = generateId()
      expect(id).toMatch(/^msg_\d+_[a-z0-9]+$/)
    })

    it("should generate unique IDs", () => {
      const id1 = generateId()
      const id2 = generateId()
      expect(id1).not.toBe(id2)
    })
  })

  describe("getTextContent", () => {
    it("should extract text content from message", () => {
      const message: UniversalMessage = {
        id: "msg-1",
        role: "user",
        content: [
          { type: "text", text: "Hello" },
          { type: "text", text: "World" }
        ],
        metadata: {}
      }

      const text = getTextContent(message)
      expect(text).toBe("Hello World")
    })

    it("should ignore non-text content", () => {
      const message: UniversalMessage = {
        id: "msg-1",
        role: "user",
        content: [
          { type: "text", text: "Hello" },
          { type: "image", url: "image.jpg" }
        ],
        metadata: {}
      }

      const text = getTextContent(message)
      expect(text).toBe("Hello")
    })
  })

  describe("hasToolCalls", () => {
    it("should detect tool calls in content", () => {
      const message: UniversalMessage = {
        id: "msg-1",
        role: "assistant",
        content: [
          { type: "tool_call", tool_call: { id: "call-1", name: "test", arguments: "{}" } }
        ],
        metadata: {}
      }

      expect(hasToolCalls(message)).toBe(true)
    })

    it("should detect tool calls in tool_calls array", () => {
      const message: UniversalMessage = {
        id: "msg-1",
        role: "assistant",
        content: [{ type: "text", text: "Using tools" }],
        metadata: {},
        tool_calls: [{ id: "call-1", name: "test", arguments: "{}" }]
      }

      expect(hasToolCalls(message)).toBe(true)
    })

    it("should return false when no tool calls", () => {
      const message: UniversalMessage = {
        id: "msg-1",
        role: "user",
        content: [{ type: "text", text: "Hello" }],
        metadata: {}
      }

      expect(hasToolCalls(message)).toBe(false)
    })
  })

  describe("hasMultimodalContent", () => {
    it("should detect image content", () => {
      const message: UniversalMessage = {
        id: "msg-1",
        role: "user",
        content: [
          { type: "text", text: "Look at this" },
          { type: "image", url: "image.jpg" }
        ],
        metadata: {}
      }

      expect(hasMultimodalContent(message)).toBe(true)
    })

    it("should detect various multimodal types", () => {
      const audioMessage: UniversalMessage = {
        id: "msg-1",
        role: "user",
        content: [{ type: "audio", url: "audio.mp3" }],
        metadata: {}
      }

      const videoMessage: UniversalMessage = {
        id: "msg-2",
        role: "user",
        content: [{ type: "video", url: "video.mp4" }],
        metadata: {}
      }

      const documentMessage: UniversalMessage = {
        id: "msg-3",
        role: "user",
        content: [{ type: "document", url: "doc.pdf" }],
        metadata: {}
      }

      expect(hasMultimodalContent(audioMessage)).toBe(true)
      expect(hasMultimodalContent(videoMessage)).toBe(true)
      expect(hasMultimodalContent(documentMessage)).toBe(true)
    })
  })

  describe("extractToolCalls", () => {
    it("should extract tool calls from content", () => {
      const message: UniversalMessage = {
        id: "msg-1",
        role: "assistant",
        content: [
          { type: "tool_call", tool_call: { id: "call-1", name: "test", arguments: "{}" } }
        ],
        metadata: {}
      }

      const toolCalls = extractToolCalls(message)
      expect(toolCalls).toHaveLength(1)
      expect(toolCalls[0].id).toBe("call-1")
    })

    it("should extract tool calls from tool_calls array", () => {
      const message: UniversalMessage = {
        id: "msg-1",
        role: "assistant",
        content: [{ type: "text", text: "Using tools" }],
        metadata: {},
        tool_calls: [{ id: "call-1", name: "test", arguments: "{}" }]
      }

      const toolCalls = extractToolCalls(message)
      expect(toolCalls).toHaveLength(1)
      expect(toolCalls[0].id).toBe("call-1")
    })
  })

  describe("addTextContent", () => {
    it("should add text content to message", () => {
      const message: UniversalMessage = {
        id: "msg-1",
        role: "user",
        content: [{ type: "text", text: "Hello" }],
        metadata: {}
      }

      const updated = addTextContent(message, "World")
      expect(updated.content).toHaveLength(2)
      expect(updated.content[1]).toEqual({ type: "text", text: "World" })
    })
  })

  describe("replaceTextContent", () => {
    it("should replace text content in message", () => {
      const message: UniversalMessage = {
        id: "msg-1",
        role: "user",
        content: [
          { type: "text", text: "Hello" },
          { type: "image", url: "image.jpg" }
        ],
        metadata: {}
      }

      const updated = replaceTextContent(message, "New text")
      expect(updated.content).toHaveLength(2)
      expect(updated.content[0]).toEqual({ type: "text", text: "New text" })
      expect(updated.content[1]).toEqual({ type: "image", url: "image.jpg" })
    })
  })

  describe("countTokens", () => {
    it("should count tokens in universal body", () => {
      const universal: UniversalBody = {
        provider: "openai",
        model: "gpt-4",
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: [{ type: "text", text: "Hello world" }],
            metadata: {}
          }
        ],
        system: "You are a helpful assistant"
      }

      const tokens = countTokens(universal)
      expect(tokens.inputTokens).toBeGreaterThan(0)
      expect(tokens.estimatedOutputTokens).toBe(1000)
    })

    it("should handle max_tokens parameter", () => {
      const universal: UniversalBody = {
        provider: "openai",
        model: "gpt-4",
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: [{ type: "text", text: "Hello" }],
            metadata: {}
          }
        ],
        max_tokens: 500
      }

      const tokens = countTokens(universal)
      expect(tokens.estimatedOutputTokens).toBe(500)
    })
  })

  describe("validateUniversalBody", () => {
    it("should validate correct universal body", () => {
      const universal: UniversalBody = {
        provider: "openai",
        model: "gpt-4",
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: [{ type: "text", text: "Hello" }],
            metadata: {}
          }
        ]
      }

      const validation = validateUniversalBody(universal)
      expect(validation.valid).toBe(true)
      expect(validation.errors).toHaveLength(0)
    })

    it("should detect missing model", () => {
      const universal = {
        provider: "openai",
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: [{ type: "text", text: "Hello" }],
            metadata: {}
          }
        ]
      } as UniversalBody

      const validation = validateUniversalBody(universal)
      expect(validation.valid).toBe(false)
      expect(validation.errors).toContain("Model is required")
    })

    it("should detect missing messages", () => {
      const universal = {
        provider: "openai",
        model: "gpt-4",
        messages: []
      } as UniversalBody

      const validation = validateUniversalBody(universal)
      expect(validation.valid).toBe(false)
      expect(validation.errors).toContain("At least one message is required")
    })
  })
})

describe("reconstructing", () => {
  describe("canPerfectlyReconstruct", () => {
    it("should return true when original provider matches", () => {
      const universal: UniversalBody = {
        provider: "openai",
        model: "gpt-4",
        messages: [],
        _original: { provider: "openai", data: {} }
      }

      expect(canPerfectlyReconstruct(universal, "openai")).toBe(true)
    })

    it("should return false when original provider differs", () => {
      const universal: UniversalBody = {
        provider: "openai",
        model: "gpt-4",
        messages: [],
        _original: { provider: "anthropic", data: {} }
      }

      expect(canPerfectlyReconstruct(universal, "openai")).toBe(false)
    })
  })

  describe("getReconstructionQuality", () => {
    it("should return 100 for perfect reconstruction", () => {
      const universal: UniversalBody = {
        provider: "openai",
        model: "gpt-4",
        messages: [],
        _original: { provider: "openai", data: {} }
      }

      const quality = getReconstructionQuality(universal, "openai")
      expect(quality).toBe(100)
    })

    it("should return base score for different provider", () => {
      const universal: UniversalBody = {
        provider: "openai",
        model: "gpt-4",
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: [{ type: "text", text: "Hello" }],
            metadata: {}
          }
        ]
      }

      const quality = getReconstructionQuality(universal, "anthropic")
      expect(quality).toBeGreaterThan(0)
      expect(quality).toBeLessThan(100)
    })
  })

  describe("getOriginalDataSummary", () => {
    it("should analyze original data preservation", () => {
      const universal: UniversalBody = {
        provider: "openai",
        model: "gpt-4",
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: [{ type: "text", text: "Hello" }],
            metadata: { originalIndex: 0 }
          }
        ],
        _original: { provider: "openai", data: {} }
      }

      const summary = getOriginalDataSummary(universal)
      expect(summary.hasTopLevelOriginal).toBe(true)
      expect(summary.originalProvider).toBe("openai")
      expect(summary.messagePreservation.total).toBe(1)
    })
  })

  describe("fromUniversalWithInfo", () => {
    it("should provide reconstruction info", () => {
      const universal: UniversalBody = {
        provider: "openai",
        model: "gpt-4",
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: [{ type: "text", text: "Hello" }],
            metadata: {}
          }
        ]
      }

      const info = fromUniversalWithInfo("openai", universal)
      expect(info.result).toBeDefined()
      expect(info.reconstructionQuality).toBeGreaterThan(0)
      expect(info.summary).toBeDefined()
    })
  })
})

describe("type-guards", () => {
  describe("isUniversalMessage", () => {
    it("should identify valid universal message", () => {
      const message: UniversalMessage = {
        id: "msg-1",
        role: "user",
        content: [{ type: "text", text: "Hello" }],
        metadata: {}
      }

      expect(isUniversalMessage(message)).toBe(true)
    })

    it("should reject invalid objects", () => {
      expect(isUniversalMessage(null)).toBe(false)
      expect(isUniversalMessage({})).toBe(false)
      expect(isUniversalMessage("string")).toBe(false)
    })
  })

  describe("isUniversalBody", () => {
    it("should identify valid universal body", () => {
      const body: UniversalBody = {
        provider: "openai",
        model: "gpt-4",
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: [{ type: "text", text: "Hello" }],
            metadata: {}
          }
        ]
      }

      expect(isUniversalBody(body)).toBe(true)
    })

    it("should reject invalid objects", () => {
      expect(isUniversalBody(null)).toBe(false)
      expect(isUniversalBody({})).toBe(false)
      expect(isUniversalBody("string")).toBe(false)
    })
  })
})