/**
 * Real-world application example using llm-bridge with OpenAI Responses API
 * 
 * This example demonstrates building a conversational AI assistant with:
 * - State management
 * - Memory injection
 * - Context optimization
 * - Error handling
 * - Multi-turn conversations
 */

import OpenAI from "openai"
import { OpenAIResponsesBody } from "../src/models/openai-responses-format"
import { UniversalBody, UniversalMessage } from "../src/types/universal"
import { toUniversal, fromUniversal } from "../src/models"

// Configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ""
const MODEL = "gpt-4o-mini"

/**
 * Simple in-memory store for conversation state
 */
class ConversationStore {
  private conversations: Map<string, {
    responseIds: string[]
    messages: UniversalMessage[]
    metadata: Record<string, any>
  }> = new Map()

  createConversation(id: string) {
    this.conversations.set(id, {
      responseIds: [],
      messages: [],
      metadata: {}
    })
  }

  addResponse(conversationId: string, responseId: string, messages: UniversalMessage[]) {
    const conv = this.conversations.get(conversationId)
    if (conv) {
      conv.responseIds.push(responseId)
      conv.messages.push(...messages)
    }
  }

  getLatestResponseId(conversationId: string): string | undefined {
    const conv = this.conversations.get(conversationId)
    return conv?.responseIds[conv.responseIds.length - 1]
  }

  getMessages(conversationId: string): UniversalMessage[] {
    return this.conversations.get(conversationId)?.messages || []
  }

  setMetadata(conversationId: string, key: string, value: any) {
    const conv = this.conversations.get(conversationId)
    if (conv) {
      conv.metadata[key] = value
    }
  }

  getMetadata(conversationId: string, key: string): any {
    return this.conversations.get(conversationId)?.metadata[key]
  }
}

/**
 * AI Assistant class that wraps the llm-bridge for conversational AI
 */
export class AIAssistant {
  private store = new ConversationStore()
  // Keeping for future extensions
  private readonly apiKey: string
  private model: string
  private systemPrompt: string
  private client: OpenAI

  constructor(apiKey: string, model: string = MODEL) {
    this.apiKey = apiKey
    this.model = model
    this.systemPrompt = "You are a helpful AI assistant. Be concise but thorough."
    this.client = new OpenAI({ apiKey: this.apiKey })
  }

  /**
   * Start a new conversation
   */
  async startConversation(conversationId: string, initialMessage: string) {
    this.store.createConversation(conversationId)

    const request: OpenAIResponsesBody = {
      model: this.model,
      instructions: this.systemPrompt,
      input: initialMessage,
      store: true
    }

    const result = await this.sendRequest(request, conversationId)
    return result
  }

  /**
   * Continue an existing conversation
   */
  async continueConversation(conversationId: string, message: string) {
    const previousResponseId = this.store.getLatestResponseId(conversationId)
    
    if (!previousResponseId) {
      throw new Error(`No previous conversation found for ${conversationId}`)
    }

    const request: OpenAIResponsesBody = {
      model: this.model,
      input: message,
      previous_response_id: previousResponseId,
      store: true
    }

    const result = await this.sendRequest(request, conversationId)
    return result
  }

  /**
   * Add context/memory to the conversation
   */
  async addContext(conversationId: string, context: string, message: string) {
    const previousResponseId = this.store.getLatestResponseId(conversationId)

    const request: OpenAIResponsesBody = {
      model: this.model,
      input: message,
      instructions: `${this.systemPrompt}\n\nAdditional context: ${context}`,
      previous_response_id: previousResponseId,
      store: true
    }

    const result = await this.sendRequest(request, conversationId, {
      contextInjected: true,
      context
    })
    return result
  }

  /**
   * Use built-in tools
   */
  async useTools(conversationId: string, message: string, tools: OpenAIResponsesBody["tools"]) {
    const previousResponseId = this.store.getLatestResponseId(conversationId)

    const request: OpenAIResponsesBody = {
      model: this.model,
      input: message,
      previous_response_id: previousResponseId,
      tools,
      store: true
    }

    const result = await this.sendRequest(request, conversationId, {
      toolsUsed: tools ? tools.map(t => t.type) : []
    })
    return result
  }

  /**
   * Send request with middleware enhancements
   */
  private async sendRequest(
    request: OpenAIResponsesBody,
    conversationId: string,
    metadata?: Record<string, any>
  ) {
    const targetUrl = "https://api.openai.com/v1/responses"
    const universal = toUniversal("openai", request, targetUrl)
    const { request: editedRequest } = await this.applyMiddleware(universal, conversationId)
    const translatedBody = fromUniversal("openai", editedRequest, targetUrl) as OpenAIResponsesBody
    const inputText = editedRequest.messages[0]?.content[0]?.text || (typeof translatedBody.input === "string" ? translatedBody.input : "")
    const instructions = typeof editedRequest.system === "string" ? editedRequest.system : editedRequest.system?.content
    const responseData = await this.client.responses.create({
      model: editedRequest.model,
      instructions,
      input: inputText,
      previous_response_id: translatedBody.previous_response_id as string | null | undefined,
      store: translatedBody.store as boolean | null | undefined,
      max_output_tokens: typeof (request as any).max_tokens === "number" ? (request as any).max_tokens : undefined,
    }) as any
    
    // Store the response
    if (responseData.id) {
      this.store.addResponse(conversationId, responseData.id, [])
      
      if (metadata) {
        Object.entries(metadata).forEach(([key, value]) => {
          this.store.setMetadata(conversationId, key, value)
        })
      }
    }

    return {
      response: responseData,
      observability: undefined
    }
  }

  /**
   * Apply middleware transformations
   */
  private async applyMiddleware(
    universal: UniversalBody,
    conversationId: string
  ): Promise<{ request: UniversalBody; contextModified: boolean }> {
    let modified = false

    // 1. Token optimization - remove redundancy
    const optimized = this.optimizeTokens(universal)
    if (optimized !== universal) {
      universal = optimized
      modified = true
    }

    // 2. Context injection from memory
    const withMemory = this.injectMemory(universal, conversationId)
    if (withMemory !== universal) {
      universal = withMemory
      modified = true
    }

    // 3. Safety guardrails
    const safe = this.applySafetyGuardrails(universal)
    if (safe !== universal) {
      universal = safe
      modified = true
    }

    return {
      request: universal,
      contextModified: modified
    }
  }

  /**
   * Optimize tokens by removing redundancy
   */
  private optimizeTokens(universal: UniversalBody): UniversalBody {
    // Check if the input is too long
    const inputText = universal.messages[0]?.content[0]?.text || ""
    
    if (inputText.length > 1000) {
      // Summarize long inputs
      const summarized = this.summarizeText(inputText)
      
      return {
        ...universal,
        messages: [{
          ...universal.messages[0],
          content: [{
            type: "text" as const,
            text: summarized
          }],
          metadata: {
            ...universal.messages[0].metadata,
            originalLength: inputText.length,
            optimizedLength: summarized.length
          }
        }]
      }
    }

    return universal
  }

  /**
   * Simple text summarization
   */
  private summarizeText(text: string): string {
    // In a real app, you might use a more sophisticated summarization
    const sentences = text.split(/[.!?]+/).filter(s => s.trim())
    
    // Keep first and last sentence, and any questions
    const important = [
      sentences[0],
      ...sentences.filter(s => s.includes("?")),
      sentences[sentences.length - 1]
    ]

    return [...new Set(important)].join(". ").trim()
  }

  /**
   * Inject relevant memory/context
   */
  private injectMemory(universal: UniversalBody, conversationId: string): UniversalBody {
    const previousMessages = this.store.getMessages(conversationId)
    
    if (previousMessages.length > 0) {
      // Add a summary of previous conversation as context
      const summary = `Previous discussion included ${previousMessages.length} messages.`
      
      return {
        ...universal,
        system: universal.system 
          ? `${universal.system}\n\nConversation context: ${summary}`
          : `Conversation context: ${summary}`
      }
    }

    return universal
  }

  /**
   * Apply safety guardrails
   */
  private applySafetyGuardrails(universal: UniversalBody): UniversalBody {
    const prohibited = [
      "hack", "exploit", "illegal", "harmful", "dangerous",
      "password", "credential", "private key"
    ]

    const inputText = universal.messages[0]?.content[0]?.text || ""
    const containsProhibited = prohibited.some(word => 
      inputText.toLowerCase().includes(word)
    )

    if (containsProhibited) {
      // Add safety instructions
      return {
        ...universal,
        system: (universal.system || "") + 
          "\n\nIMPORTANT: Focus on ethical, legal, and safe practices only. " +
          "Do not provide information that could be used for harmful purposes."
      }
    }

    return universal
  }

  /**
   * Get conversation history
   */
  getHistory(conversationId: string) {
    return {
      messages: this.store.getMessages(conversationId),
      metadata: this.store.getMetadata(conversationId, "metadata") || {}
    }
  }
}

/**
 * Example usage of the AI Assistant
 */
async function exampleUsage() {
  if (!OPENAI_API_KEY) {
    console.log("Please set OPENAI_API_KEY environment variable")
    return
  }

  const assistant = new AIAssistant(OPENAI_API_KEY)
  const conversationId = `conv_${Date.now()}`

  try {
    // Start a conversation
    console.log("Starting conversation...")
    const start = await assistant.startConversation(
      conversationId,
      "Hello! I'm interested in learning about TypeScript."
    )
    console.log("Assistant:", start.response.output_text)

    // Continue the conversation
    console.log("\nContinuing conversation...")
    const continue1 = await assistant.continueConversation(
      conversationId,
      "What are the main benefits over JavaScript?"
    )
    console.log("Assistant:", continue1.response.output_text)

    // Add context and continue
    console.log("\nAdding context...")
    const withContext = await assistant.addContext(
      conversationId,
      "The user is a Python developer transitioning to web development",
      "How does TypeScript compare to Python's type system?"
    )
    console.log("Assistant:", withContext.response.output_text)

    // Use tools (when available)
    console.log("\nUsing tools...")
    const withTools = await assistant.useTools(
      conversationId,
      "Can you search for the latest TypeScript features?",
      [{ type: "web_search_preview" }]
    )
    console.log("Assistant:", withTools.response.output_text)

    // Get conversation history
    const history = assistant.getHistory(conversationId)
    console.log("\nConversation had", history.messages.length, "messages")

  } catch (error) {
    console.error("Error:", error)
  }
}

// Run the example if this file is executed directly
if (require.main === module) {
  exampleUsage()
}

export { ConversationStore, exampleUsage }
