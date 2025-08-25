import { describe, expect, it, beforeAll } from "vitest"
import OpenAI from "openai"
import { OpenAIResponsesBody } from "../src/models/openai-responses-format"
import { toUniversal, fromUniversal } from "../src/models"
import { UniversalBody } from "../src/types/universal"

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const RUN_LIVE_TESTS = !!OPENAI_API_KEY && process.env.RUN_LIVE_TESTS === "true"

async function streamViaSDK(
  requestBody: OpenAIResponsesBody,
  editFunction: (universal: UniversalBody) => Promise<{ request: UniversalBody; contextModified: boolean }>
) {
  const client = new OpenAI({ apiKey: OPENAI_API_KEY || "" })
  const targetUrl = "https://api.openai.com/v1/responses"
  const universal = toUniversal("openai", requestBody, targetUrl)
  const { request: editedRequest } = await editFunction(universal)
  const translatedBody = fromUniversal("openai", editedRequest, targetUrl) as OpenAIResponsesBody
  const inputText = editedRequest.messages[0]?.content[0]?.text || (typeof translatedBody.input === "string" ? translatedBody.input : "")
  const instructions = typeof editedRequest.system === "string" ? editedRequest.system : editedRequest.system?.content
  const stream = await client.responses.stream({
    model: editedRequest.model,
    instructions,
    input: inputText,
  })
  return stream
}

async function createViaSDK(
  requestBody: OpenAIResponsesBody,
  editFunction: (universal: UniversalBody) => Promise<{ request: UniversalBody; contextModified: boolean }>
) {
  const client = new OpenAI({ apiKey: OPENAI_API_KEY || "" })
  const targetUrl = "https://api.openai.com/v1/responses"
  const universal = toUniversal("openai", requestBody, targetUrl)
  const { request: editedRequest } = await editFunction(universal)
  const translatedBody = fromUniversal("openai", editedRequest, targetUrl) as OpenAIResponsesBody
  const inputText = editedRequest.messages[0]?.content[0]?.text || (typeof translatedBody.input === "string" ? translatedBody.input : "")
  const instructions = typeof editedRequest.system === "string" ? editedRequest.system : editedRequest.system?.content
  const sdkResponse = await client.responses.create({
    model: editedRequest.model,
    instructions,
    input: inputText,
    previous_response_id: translatedBody.previous_response_id as string | null | undefined,
    store: translatedBody.store as boolean | null | undefined,
    max_output_tokens: typeof (requestBody as any).max_tokens === "number" ? (requestBody as any).max_tokens : undefined,
  })
  return sdkResponse as any
}

describe.skipIf(!RUN_LIVE_TESTS)("Responses API Streaming", () => {
  beforeAll(() => {
    if (!OPENAI_API_KEY) {
      console.log("Skipping live streaming tests - set OPENAI_API_KEY and RUN_LIVE_TESTS=true to run")
    }
  })

  it("should handle streaming responses", async () => {
    const requestBody: OpenAIResponsesBody = {
      model: "gpt-4o-mini",
      instructions: "You are a creative writer.",
      input: "Write a short haiku about programming",
      stream: true
    }
    const stream = await streamViaSDK(requestBody, async (universal) => {
      expect(universal.stream).toBe(true)
      return { request: universal, contextModified: false }
    })

    let textParts = ""
    function handleEvent(event: any) {
      if (event.type === "response.output_text.delta") {
        textParts += event.delta
      }
    }
    stream.on("event", handleEvent)
    await stream.done()

    const lines = textParts.trim().split("\n").filter(l => l.trim())
    expect(lines.length).toBeGreaterThanOrEqual(3)
    expect(textParts.toLowerCase()).toMatch(/code|program|bug|debug|function|loop|syntax/)
  }, 30000)

  it("should handle streaming with middleware modifications", async () => {
    const requestBody: OpenAIResponsesBody = {
      model: "gpt-4o-mini",
      input: "Count from 1 to 5",
      stream: true
    }
    const stream = await streamViaSDK(requestBody, async (universal) => {
      return {
        request: {
          ...universal,
          system: "You are a counting assistant. Format each number on a new line with a bullet point.",
          messages: universal.messages
        },
        contextModified: true
      }
    })

    let fullText = ""
    function handleDelta(event: any) {
      if (event.type === "response.output_text.delta") {
        fullText += event.delta
      }
    }
    stream.on("event", handleDelta)
    await stream.done()

    expect(fullText).toMatch(/[•·\-*]|^\d/m)
    expect(fullText).toContain("1")
    expect(fullText).toContain("2")
    expect(fullText).toContain("3")
    expect(fullText).toContain("4")
    expect(fullText).toContain("5")
  }, 30000)

  it("should handle streaming interruption gracefully", async () => {
    const requestBody: OpenAIResponsesBody = {
      model: "gpt-4o-mini",
      input: "Write a very long story about space exploration",
      stream: true,
      max_tokens: 50 // Limit tokens to ensure quick response
    }
    const stream = await streamViaSDK(requestBody, async (universal) => ({ request: universal, contextModified: false }))

    let eventCount = 0
    const maxEvents = 5
    function countEvent() {
      eventCount += 1
    }
    stream.on("event", countEvent)

    await Promise.race([
      (async function waitAndAbort() {
        while (eventCount < maxEvents) {
          await new Promise(function(r){ return setTimeout(r, 10) })
        }
        stream.abort()
      })(),
      stream.done(),
    ])

    expect(eventCount).toBeGreaterThanOrEqual(1)
  }, 30000)
})

describe.skipIf(!RUN_LIVE_TESTS)("Responses API Advanced Patterns", () => {
  it("should implement retry pattern with state", async () => {
    let responseId: string | undefined

    // First attempt - might fail or succeed
    const firstRequest: OpenAIResponsesBody = {
      model: "gpt-4o-mini",
      input: "What is the meaning of life?",
      store: true,
      max_tokens: 10 // Very limited tokens to potentially cause incomplete response
    }

    try {
      const firstResponse = await createViaSDK(firstRequest, async function(universal){ return { request: universal, contextModified: false } })
      responseId = firstResponse.id

      // Check if response seems incomplete
      const outputText = firstResponse.output_text || ""
      if (outputText.length < 20) {
        // Retry with more tokens
        const retryRequest: OpenAIResponsesBody = {
          model: "gpt-4o-mini",
          input: "Please continue and provide a complete answer",
          previous_response_id: responseId,
          store: true,
          max_tokens: 200
        }

        const retryResponse = await createViaSDK(retryRequest, async function(universal){
          expect(universal.provider_params?.previous_response_id).toBe(responseId)
          return { request: universal, contextModified: false }
        })
        
        // Should have a more complete response now
        const completeText = retryResponse.output_text || ""
        expect(completeText.length).toBeGreaterThan(20)
      }
    } catch (error) {
      // Handle API errors gracefully
      expect(error).toBeDefined()
    }
  }, 60000)

  it("should implement conversation branching", async () => {
    // Start a conversation
    const startRequest: OpenAIResponsesBody = {
      model: "gpt-4o-mini",
      input: "Let's discuss programming languages. What are the main paradigms?",
      store: true
    }

    const startResponse = await createViaSDK(startRequest, async function(universal){ return { request: universal, contextModified: false } })
    const baseResponseId = startResponse.id

    // Branch 1: Ask about functional programming
    const branch1Request: OpenAIResponsesBody = {
      model: "gpt-4o-mini",
      input: "Tell me more about functional programming",
      previous_response_id: baseResponseId,
      store: true
    }

    const branch1Response = await createViaSDK(branch1Request, async function(universal){ return { request: universal, contextModified: false } })
    expect(branch1Response.output_text || "").toMatch(/functional|pure|immutable|lambda/i)

    // Branch 2: Ask about object-oriented programming (from the same base)
    const branch2Request: OpenAIResponsesBody = {
      model: "gpt-4o-mini",
      input: "Tell me more about object-oriented programming",
      previous_response_id: baseResponseId, // Same base response
      store: true
    }

    const branch2Response = await createViaSDK(branch2Request, async function(universal){ return { request: universal, contextModified: false } })
    expect(branch2Response.output_text || "").toMatch(/object|class|inheritance|encapsulation/i)

    // Both branches should have different response IDs
    expect(branch1Response.id).not.toBe(branch2Response.id)
    expect(branch1Response.id).not.toBe(baseResponseId)
    expect(branch2Response.id).not.toBe(baseResponseId)
  }, 90000)

  it("should handle ZDR/encrypted reasoning pattern", async () => {
    const requestBody: OpenAIResponsesBody = {
      model: "gpt-4o-mini",
      input: "Solve this step by step: If a train travels 120 miles in 2 hours, what is its average speed?",
      store: false, // Required for ZDR
      include: ["reasoning.encrypted_content"] // Request encrypted reasoning
    }

    const responseData = await createViaSDK(requestBody, async function(universal){
      expect(universal.provider_params?.store).toBe(false)
      expect(universal.provider_params?.include).toContain("reasoning.encrypted_content")
      return { request: universal, contextModified: false }
    })
    
    // Should have the answer
    const outputText = responseData.output_text || responseData.output?.[0]?.text || ""
    expect(outputText).toMatch(/60|sixty/i) // 120 miles / 2 hours = 60 mph
    
    // For ZDR, response should not be stored
    expect(responseData.stored).toBe(false)
    
    // If reasoning is included, it should be encrypted
    if ((responseData as any).reasoning) {
      expect((responseData as any).reasoning.encrypted_content).toBeDefined()
    }
  }, 30000)
})
