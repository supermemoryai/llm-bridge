/**
 * Production Chatbot Service Example
 *
 * Demonstrates a production-ready chatbot service that uses LLM Bridge
 * for multi-provider support, intelligent routing, and observability.
 */

import {
  toUniversal,
  fromUniversal,
  translateBetweenProviders,
  countUniversalTokens,
  getModelCosts,
  createObservabilityData,
} from "../src"
import type { ProviderType } from "../src"

interface ConversationMessage {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  timestamp: number
  provider?: string
  tokens?: number
  cost?: number
}

interface Conversation {
  id: string
  userId: string
  messages: ConversationMessage[]
  provider: ProviderType
  model: string
  config: ChatConfig
  metadata: { totalTokens: number; totalCost: number; createdAt: number; updatedAt: number }
}

interface ChatConfig {
  temperature: number
  maxTokens: number
  systemPrompt: string
  enableFallback: boolean
  preferredProviders: ProviderType[]
  costThreshold?: number
}

class ProductionChatbotService {
  private conversations = new Map<string, Conversation>()
  private rateLimits = new Map<string, { count: number; resetTime: number }>()
  private providerHealth = new Map<string, boolean>([
    ["openai", true],
    ["anthropic", true],
    ["google", true],
  ])

  async createConversation(userId: string, config: Partial<ChatConfig> = {}) {
    const id = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    const fullConfig: ChatConfig = {
      temperature: 0.7,
      maxTokens: 1000,
      systemPrompt: "You are a helpful AI assistant.",
      enableFallback: true,
      preferredProviders: ["openai", "anthropic", "google"],
      costThreshold: 0.1,
      ...config,
    }

    const provider = this.selectProvider(fullConfig)
    const conversation: Conversation = {
      id,
      userId,
      messages: [],
      provider,
      model: this.getModel(provider),
      config: fullConfig,
      metadata: { totalTokens: 0, totalCost: 0, createdAt: Date.now(), updatedAt: Date.now() },
    }

    if (fullConfig.systemPrompt) {
      conversation.messages.push({
        id: `msg_${Date.now()}_system`,
        role: "system",
        content: fullConfig.systemPrompt,
        timestamp: Date.now(),
      })
    }

    this.conversations.set(id, conversation)
    console.log(`Created conversation ${id} for ${userId} with ${provider} (${conversation.model})`)
    return { conversationId: id, conversation }
  }

  async sendMessage(conversationId: string, userMessage: string, options: { forceProvider?: ProviderType } = {}) {
    const startTime = Date.now()
    const conversation = this.conversations.get(conversationId)
    if (!conversation) throw new Error(`Conversation ${conversationId} not found`)

    if (!this.checkRateLimit(conversation.userId)) {
      throw new Error("Rate limit exceeded. Try again later.")
    }

    conversation.messages.push({
      id: `msg_${Date.now()}_user`,
      role: "user",
      content: userMessage,
      timestamp: Date.now(),
    })

    // Build request in OpenAI format
    const messages = conversation.messages.map((m) => ({ role: m.role, content: m.content }))
    const baseRequest = {
      model: conversation.model,
      messages,
      temperature: conversation.config.temperature,
      max_tokens: conversation.config.maxTokens,
    }

    // Token/cost analysis
    const universal = toUniversal("openai", baseRequest as any)
    const tokenCount = countUniversalTokens(universal)

    // Try providers with fallback
    const selectedProvider = options.forceProvider || conversation.provider
    const providersToTry = conversation.config.enableFallback
      ? [selectedProvider, ...conversation.config.preferredProviders.filter((p) => p !== selectedProvider)]
      : [selectedProvider]

    let response = ""
    let usedProvider = selectedProvider

    for (const provider of providersToTry) {
      if (!this.providerHealth.get(provider)) {
        console.log(`Skipping unhealthy provider: ${provider}`)
        continue
      }

      try {
        // Estimate cost
        const modelCosts = await getModelCosts(this.getModel(provider))
        const estimatedCost =
          (tokenCount.inputTokens / 1000) * modelCosts.inputCost +
          ((tokenCount.estimatedOutputTokens ?? 50) / 1000) * modelCosts.outputCost

        if (conversation.config.costThreshold && estimatedCost > conversation.config.costThreshold) {
          console.log(`Cost threshold exceeded for ${provider}: $${estimatedCost.toFixed(4)}`)
          continue
        }

        // Translate and call
        const providerRequest =
          provider === "openai"
            ? baseRequest
            : translateBetweenProviders("openai", provider, baseRequest as any)

        const apiResponse = await this.mockApiCall(provider, providerRequest)
        response = this.extractText(apiResponse, provider)
        usedProvider = provider
        break
      } catch (error: any) {
        console.log(`Provider ${provider} failed: ${error.message}`)
        if (error.message.includes("500")) this.providerHealth.set(provider, false)
      }
    }

    if (!response) throw new Error("All providers failed")

    // Record assistant message
    const tokens = tokenCount.inputTokens + (tokenCount.estimatedOutputTokens ?? 50)
    conversation.messages.push({
      id: `msg_${Date.now()}_assistant`,
      role: "assistant",
      content: response,
      timestamp: Date.now(),
      provider: usedProvider,
      tokens,
    })

    conversation.metadata.totalTokens += tokens
    conversation.metadata.updatedAt = Date.now()

    // Observability
    const observability = await createObservabilityData(
      tokenCount.inputTokens,
      tokenCount.inputTokens,
      usedProvider,
      this.getModel(usedProvider),
      false,
      {
        estimatedOutputTokens: tokenCount.estimatedOutputTokens,
        toolCallsCount: tokenCount.toolCallsCount,
      },
    )

    const latency = Date.now() - startTime
    console.log(`[${usedProvider}] ${latency}ms | ${tokens} tokens`)

    return {
      response,
      metadata: { provider: usedProvider, model: this.getModel(usedProvider), tokens, latency, observability },
    }
  }

  getConversation(id: string) {
    return this.conversations.get(id) || null
  }

  getStats(id: string) {
    const c = this.conversations.get(id)
    if (!c) return null
    return {
      messageCount: c.messages.length,
      totalTokens: c.metadata.totalTokens,
      totalCost: c.metadata.totalCost,
      duration: c.metadata.updatedAt - c.metadata.createdAt,
    }
  }

  private selectProvider(config: ChatConfig): ProviderType {
    const healthy = config.preferredProviders.filter((p) => this.providerHealth.get(p))
    return healthy.length > 0 ? healthy[Math.floor(Math.random() * healthy.length)] : config.preferredProviders[0]
  }

  private getModel(provider: ProviderType): string {
    const models: Record<string, string> = {
      openai: "gpt-4o",
      anthropic: "claude-sonnet-4-20250514",
      google: "gemini-2.5-pro",
    }
    return models[provider] || "gpt-4o"
  }

  private checkRateLimit(userId: string): boolean {
    const now = Date.now()
    const limit = this.rateLimits.get(userId)
    if (!limit || now > limit.resetTime) {
      this.rateLimits.set(userId, { count: 1, resetTime: now + 60000 })
      return true
    }
    if (limit.count >= 10) return false
    limit.count++
    return true
  }

  private extractText(response: any, provider: string): string {
    switch (provider) {
      case "openai": return response.choices?.[0]?.message?.content || ""
      case "anthropic": return response.content?.[0]?.text || ""
      case "google": return response.candidates?.[0]?.content?.parts?.[0]?.text || ""
      default: return `Response from ${provider}`
    }
  }

  private async mockApiCall(provider: string, _request: any) {
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 500 + 200))
    if (Math.random() < 0.05) throw new Error(`Simulated ${provider} API error`)
    return {
      choices: [{ message: { content: `Mock response from ${provider}` } }],
      content: [{ text: `Mock response from ${provider}` }],
      candidates: [{ content: { parts: [{ text: `Mock response from ${provider}` }] } }],
    }
  }
}

// Bun.serve() API
function createChatbotServer() {
  const service = new ProductionChatbotService()

  return Bun.serve({
    port: Number(process.env.PORT) || 3001,
    async fetch(req) {
      const url = new URL(req.url)

      if (req.method === "POST" && url.pathname === "/conversations") {
        const { userId, config } = await req.json()
        const result = await service.createConversation(userId, config)
        return Response.json(result)
      }

      if (req.method === "POST" && url.pathname.match(/^\/conversations\/[^/]+\/messages$/)) {
        const id = url.pathname.split("/")[2]
        const { message, options } = await req.json()
        const result = await service.sendMessage(id, message, options)
        return Response.json(result)
      }

      if (req.method === "GET" && url.pathname.match(/^\/conversations\/[^/]+$/)) {
        const id = url.pathname.split("/")[2]
        const conv = service.getConversation(id)
        if (!conv) return Response.json({ error: "Not found" }, { status: 404 })
        return Response.json(conv)
      }

      if (req.method === "GET" && url.pathname.match(/^\/conversations\/[^/]+\/stats$/)) {
        const id = url.pathname.split("/")[2]
        const stats = service.getStats(id)
        if (!stats) return Response.json({ error: "Not found" }, { status: 404 })
        return Response.json(stats)
      }

      return new Response("Not Found", { status: 404 })
    },
  })
}

async function main() {
  console.log("Production Chatbot Service Demo\n")

  const service = new ProductionChatbotService()
  const { conversationId } = await service.createConversation("user123", {
    temperature: 0.8,
    maxTokens: 500,
    systemPrompt: "You are a helpful customer service assistant.",
    preferredProviders: ["openai", "anthropic"],
  })

  const messages = [
    "Hello, I need help with my account",
    "Can you explain how to reset my password?",
    "What are your business hours?",
  ]

  for (const msg of messages) {
    console.log(`\nUser: ${msg}`)
    try {
      const result = await service.sendMessage(conversationId, msg)
      console.log(`Assistant: ${result.response}`)
    } catch (error: any) {
      console.log(`Error: ${error.message}`)
    }
  }

  console.log("\nStats:", JSON.stringify(service.getStats(conversationId), null, 2))
}

if (import.meta.main) {
  // Uncomment to start server:
  // const server = createChatbotServer()
  // console.log(`Chatbot service running on ${server.url}`)

  main().catch(console.error)
}

export { ProductionChatbotService, createChatbotServer }
