import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { 
  getModelDetails, 
  getModelInputTokenLimit, 
  getModelCosts,
  countUniversalTokens,
  extractModelFromUniversal,
  createObservabilityData
} from "../src/models/helpers"
import { UniversalBody } from "../src/types/universal"

// Mock fetch for external API calls
;(globalThis as any).fetch = async (input: string | URL | Request) => {
  const url = typeof input === 'string' ? input : input.toString()
  if (url.includes("tokencost")) {
    return new Response(JSON.stringify({
      "gpt-4": {
        input_cost_per_token: 0.00003,
        output_cost_per_token: 0.00006,
        max_input_tokens: 8192,
        supports_multimodal: true,
        supports_tools: true
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }
  throw new Error("Network error")
}

describe("models/helpers", () => {
  beforeEach(() => {
    // Reset the cache before each test
    ;(globalThis as any).fetch = async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes("tokencost")) {
        return new Response(JSON.stringify({
          "gpt-4": {
            input_cost_per_token: 0.00003,
            output_cost_per_token: 0.00006,
            max_input_tokens: 8192,
            supports_multimodal: true,
            supports_tools: true
          }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      throw new Error("Network error")
    }
  })

  afterEach(() => {
    // Clean up
  })

  describe("getModelDetails", () => {
    it("should return default details for empty model name", async () => {
      const details = await getModelDetails("")
      expect(details).toEqual({
        input_cost_per_token: 0,
        max_input_tokens: 0,
        output_cost_per_token: 0,
        supports_multimodal: false,
        supports_tools: false,
      })
    })

    it("should fetch external model details", async () => {
      const details = await getModelDetails("gpt-4")
      expect(details.input_cost_per_token).toBe(0.00003)
      expect(details.max_input_tokens).toBe(8192)
    })

    it("should handle fetch errors gracefully", async () => {
      ;(globalThis as any).fetch = async () => {
        throw new Error("Network error")
      }

      const details = await getModelDetails("unknown-model")
      expect(details.input_cost_per_token).toBe(0)
    })

    it("should handle failed response", async () => {
      ;(globalThis as any).fetch = async () => {
        return new Response("Not Found", { status: 404 })
      }

      const details = await getModelDetails("unknown-model")
      expect(details.input_cost_per_token).toBe(0)
    })
  })

  describe("getModelInputTokenLimit", () => {
    it("should return input token limit", async () => {
      const limit = await getModelInputTokenLimit("gpt-4")
      expect(limit).toBe(8192)
    })

    it("should return 0 for unknown model", async () => {
      const limit = await getModelInputTokenLimit("unknown-model")
      expect(limit).toBe(0)
    })
  })

  describe("getModelCosts", () => {
    it("should return model costs", async () => {
      const costs = await getModelCosts("gpt-4")
      expect(costs.inputCost).toBe(0.00003)
      expect(costs.outputCost).toBe(0.00006)
    })

    it("should return 0 costs for unknown model", async () => {
      const costs = await getModelCosts("unknown-model")
      expect(costs.inputCost).toBe(0)
      expect(costs.outputCost).toBe(0)
    })
  })

  describe("countUniversalTokens", () => {
    it("should count tokens in basic universal body", () => {
      const universal: UniversalBody = {
        provider: "openai",
        model: "gpt-4",
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: [{ type: "text", text: "Hello world" }],
            metadata: { provider: "openai" }
          }
        ]
      }

      const tokens = countUniversalTokens(universal)
      expect(tokens.inputTokens).toBeGreaterThan(0)
      expect(tokens.estimatedOutputTokens).toBe(1000)
      expect(tokens.multimodalContentCount).toBe(0)
      expect(tokens.toolCallsCount).toBe(0)
    })

    it("should count system prompt tokens", () => {
      const universal: UniversalBody = {
        provider: "openai",
        model: "gpt-4",
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: [{ type: "text", text: "Hello" }],
            metadata: { provider: "openai" }
          }
        ],
        system: "You are a helpful assistant"
      }

      const tokens = countUniversalTokens(universal)
      expect(tokens.inputTokens).toBeGreaterThan(5) // Should include system prompt
    })

    it("should count system prompt tokens with object format", () => {
      const universal: UniversalBody = {
        provider: "openai",
        model: "gpt-4",
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: [{ type: "text", text: "Hello" }],
            metadata: { provider: "openai" }
          }
        ],
        system: { 
          content: "You are a helpful assistant",
          _original: { provider: "openai", raw: {} }
        }
      }

      const tokens = countUniversalTokens(universal)
      expect(tokens.inputTokens).toBeGreaterThan(5) // Should include system prompt
    })

    it("should count multimodal content", () => {
      const universal: UniversalBody = {
        provider: "openai",
        model: "gpt-4",
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: [
              { type: "text", text: "Look at this" },
              { type: "image", media: { data: "base64", mimeType: "image/jpeg" } },
              { type: "audio", media: { data: "base64", mimeType: "audio/mp3" } },
              { type: "video", media: { data: "base64", mimeType: "video/mp4" } },
              { type: "document", media: { data: "base64", mimeType: "application/pdf" } }
            ],
            metadata: { provider: "openai" }
          }
        ]
      }

      const tokens = countUniversalTokens(universal)
      expect(tokens.multimodalContentCount).toBe(4)
      expect(tokens.inputTokens).toBeGreaterThan(100) // Should include multimodal token estimates
    })

    it("should count tool calls in content", () => {
      const universal: UniversalBody = {
        provider: "openai",
        model: "gpt-4",
        messages: [
          {
            id: "msg-1",
            role: "assistant",
            content: [
              { type: "text", text: "Using tools" },
              { type: "tool_call", tool_call: { id: "call-1", name: "test", arguments: {} } }
            ],
            metadata: { provider: "openai" }
          }
        ]
      }

      const tokens = countUniversalTokens(universal)
      expect(tokens.toolCallsCount).toBe(1)
      expect(tokens.inputTokens).toBeGreaterThan(50)
    })

    it("should count tool calls from tool_calls array", () => {
      const universal: UniversalBody = {
        provider: "openai",
        model: "gpt-4",
        messages: [
          {
            id: "msg-1",
            role: "assistant",
            content: [{ type: "text", text: "Using tools" }],
            metadata: { provider: "openai" },
            tool_calls: [
              { id: "call-1", name: "test", arguments: {} },
              { id: "call-2", name: "test2", arguments: {} }
            ]
          }
        ]
      }

      const tokens = countUniversalTokens(universal)
      expect(tokens.toolCallsCount).toBe(2)
    })

    it("should count tool definition tokens", () => {
      const universal: UniversalBody = {
        provider: "openai",
        model: "gpt-4",
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: [{ type: "text", text: "Hello" }],
            metadata: { provider: "openai" }
          }
        ],
        tools: [
          {
            name: "test_function",
            parameters: { type: "object", properties: {} },
            description: "A test function"
          }
        ]
      }

      const tokens = countUniversalTokens(universal)
      expect(tokens.inputTokens).toBeGreaterThan(10) // Should include tool definition tokens
    })

    it("should handle custom max_tokens", () => {
      const universal: UniversalBody = {
        provider: "openai",
        model: "gpt-4",
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: [{ type: "text", text: "Hello" }],
            metadata: { provider: "openai" }
          }
        ],
        max_tokens: 500
      }

      const tokens = countUniversalTokens(universal)
      expect(tokens.estimatedOutputTokens).toBe(500)
    })
  })

  describe("extractModelFromUniversal", () => {
    it("should extract model name", () => {
      const universal: UniversalBody = {
        provider: "openai",
        model: "gpt-4",
        messages: []
      }

      const model = extractModelFromUniversal(universal)
      expect(model).toBe("gpt-4")
    })

    it("should return unknown_model for missing model", () => {
      const universal = {
        provider: "openai",
        model: "",
        messages: []
      } as UniversalBody

      const model = extractModelFromUniversal(universal)
      expect(model).toBe("unknown_model")
    })
  })

  describe("createObservabilityData", () => {
    it("should create observability data", async () => {
      const data = await createObservabilityData(
        100,
        120,
        "openai",
        "gpt-4",
        true,
        {
          multimodalContentCount: 2,
          toolCallsCount: 1,
          requestId: "test-req-id",
          estimatedOutputTokens: 200
        }
      )

      expect(data.provider).toBe("openai")
      expect(data.model).toBe("gpt-4")
      expect(data.originalTokenCount).toBe(100)
      expect(data.finalTokenCount).toBe(120)
      expect(data.contextModified).toBe(true)
      expect(data.multimodalContentCount).toBe(2)
      expect(data.toolCallsCount).toBe(1)
      expect(data.requestId).toBe("test-req-id")
      expect(data.tokensSaved).toBe(0) // 100 - 120 = -20, but max(0, -20) = 0
    })

    it("should calculate tokens saved correctly", async () => {
      const data = await createObservabilityData(
        200,
        150,
        "openai",
        "gpt-4",
        true
      )

      expect(data.tokensSaved).toBe(50) // 200 - 150 = 50
    })

    it("should handle unknown model gracefully", async () => {
      const data = await createObservabilityData(
        100,
        120,
        "openai",
        "unknown_model",
        false
      )

      expect(data.estimatedInputCost).toBe(0)
      expect(data.estimatedOutputCost).toBe(0)
      expect(data.costSavedUSD).toBe(0)
    })

    it("should calculate costs when model is known", async () => {
      const data = await createObservabilityData(
        200,
        150,
        "openai",
        "gpt-4",
        true,
        { estimatedOutputTokens: 100 }
      )

      expect(data.estimatedInputCost).toBeGreaterThan(0)
      expect(data.estimatedOutputCost).toBeGreaterThan(0)
      expect(data.costSavedUSD).toBeGreaterThan(0)
    })

    it("should handle cost calculation errors", async () => {
      // Mock console.error to suppress error output in tests
      const consoleSpy = globalThis.console.error
      ;(globalThis.console as any).error = () => {}
      
      // Force an error by mocking getModelCosts to throw
      ;(globalThis as any).fetch = async () => {
        throw new Error("Network error")
      }

      const data = await createObservabilityData(
        100,
        120,
        "openai",
        "error-model",
        false
      )

      expect(data.estimatedInputCost).toBe(0)
      expect(data.estimatedOutputCost).toBe(0)
      expect(data.costSavedUSD).toBe(0)
      
      ;(globalThis.console as any).error = consoleSpy
    })

    it("should round costs to 4 decimal places", async () => {
      const data = await createObservabilityData(
        1000,
        800,
        "openai",
        "gpt-4",
        true,
        { estimatedOutputTokens: 1000 }
      )

      // Check that costs are rounded to 4 decimal places
      expect(data.estimatedInputCost.toString().split('.')[1]?.length).toBeLessThanOrEqual(4)
      expect(data.estimatedOutputCost.toString().split('.')[1]?.length).toBeLessThanOrEqual(4)
      expect(data.costSavedUSD.toString().split('.')[1]?.length).toBeLessThanOrEqual(4)
    })
  })
})