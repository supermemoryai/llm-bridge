/**
 * Production Chatbot Service Example
 * 
 * Demonstrates a production-ready chatbot service that uses LLM Bridge
 * for multi-provider support, intelligent routing, and observability.
 */

import express, { Request, Response } from 'express'
import type OpenAI from 'openai'
import { 
  toUniversal, 
  translateBetweenProviders,
  countUniversalTokens,
  getModelCosts,
  createObservabilityData,
  buildUniversalError,
  OpenAIChatBody
} from '../src'

interface ConversationMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
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
  provider: 'openai' | 'anthropic' | 'google'
  model: string
  config: ChatConfig
  metadata: {
    totalTokens: number
    totalCost: number
    createdAt: number
    updatedAt: number
  }
}

interface ChatConfig {
  temperature: number
  maxTokens: number
  systemPrompt: string
  enableFallback: boolean
  preferredProviders: Array<'openai' | 'anthropic' | 'google'>
  costThreshold?: number
  enableObservability: boolean
}

class ProductionChatbotService {
  private conversations = new Map<string, Conversation>()
  private rateLimits = new Map<string, { count: number; resetTime: number }>()
  private providerHealth = new Map<string, { isHealthy: boolean; lastCheck: number }>()
  
  constructor() {
    // Initialize provider health status
    this.providerHealth.set('openai', { isHealthy: true, lastCheck: Date.now() })
    this.providerHealth.set('anthropic', { isHealthy: true, lastCheck: Date.now() })
    this.providerHealth.set('google', { isHealthy: true, lastCheck: Date.now() })
    
    // Start health monitoring
    this.startHealthMonitoring()
  }
  
  /**
   * Create a new conversation
   */
  async createConversation(
    userId: string,
    config: Partial<ChatConfig> = {}
  ): Promise<{ conversationId: string; conversation: Conversation }> {
    const conversationId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const defaultConfig: ChatConfig = {
      temperature: 0.7,
      maxTokens: 1000,
      systemPrompt: "You are a helpful AI assistant.",
      enableFallback: true,
      preferredProviders: ['openai', 'anthropic', 'google'],
      costThreshold: 0.10, // Max $0.10 per message
      enableObservability: true,
      ...config
    }
    
    const conversation: Conversation = {
      id: conversationId,
      userId,
      messages: [],
      provider: this.selectOptimalProvider(defaultConfig),
      model: this.getModelForProvider(this.selectOptimalProvider(defaultConfig)),
      config: defaultConfig,
      metadata: {
        totalTokens: 0,
        totalCost: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    }
    
    // Add system message if provided
    if (defaultConfig.systemPrompt) {
      conversation.messages.push({
        id: `msg_${Date.now()}_system`,
        role: 'system',
        content: defaultConfig.systemPrompt,
        timestamp: Date.now()
      })
    }
    
    this.conversations.set(conversationId, conversation)
    
    console.log(`💬 Created conversation ${conversationId} for user ${userId}`)
    console.log(`🎯 Selected provider: ${conversation.provider} (${conversation.model})`)
    
    return { conversationId, conversation }
  }
  
  /**
   * Send a message in a conversation
   */
  async sendMessage(
    conversationId: string,
    userMessage: string,
    options: { 
      forceProvider?: 'openai' | 'anthropic' | 'google'
      enableImages?: boolean
      imageData?: string
    } = {}
  ): Promise<{
    response: string
    messageId: string
    metadata: {
      provider: string
      model: string
      tokens: number
      cost: number
      latency: number
      fallbackUsed: boolean
    }
  }> {
    const startTime = Date.now()
    
    // Get conversation
    const conversation = this.conversations.get(conversationId)
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`)
    }
    
    // Rate limiting check
    if (!this.checkRateLimit(conversation.userId)) {
      throw buildUniversalError(
        'rate_limit_error',
        'Rate limit exceeded. Please try again later.',
        'openai' as any,
        { retryAfter: 60 }
      )
    }
    
    // Add user message to conversation
    const userMsgId = `msg_${Date.now()}_user`
    const userMsg: ConversationMessage = {
      id: userMsgId,
      role: 'user',
      content: userMessage,
      timestamp: Date.now()
    }
    
    conversation.messages.push(userMsg)
    
    let selectedProvider: 'openai' | 'anthropic' | 'google' = options.forceProvider || conversation.provider
    let fallbackUsed = false
    let response: string = ''
    let tokens = 0
    let cost = 0
    
    // Prepare request
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = conversation.messages.map(msg => ({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content
    }))
    
    // Add image if provided
    let requestContent: OpenAI.Chat.ChatCompletionContentPart[] | undefined
    if (options.enableImages && options.imageData) {
      requestContent = [
        { type: 'text', text: userMessage },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${options.imageData}`, detail: 'auto' } }
      ]
      // Update the last message to include image
      messages[messages.length - 1].content = requestContent
    }
    
    const baseRequest: OpenAIChatBody = {
      model: this.getModelForProvider(selectedProvider),
      messages,
      temperature: conversation.config.temperature,
      max_tokens: conversation.config.maxTokens
    }
    
    // Try primary provider with fallbacks
    const providersToTry = conversation.config.enableFallback 
      ? [selectedProvider, ...conversation.config.preferredProviders.filter(p => p !== selectedProvider)]
      : [selectedProvider]
    
    for (const provider of providersToTry) {
      if (!this.isProviderHealthy(provider)) {
        console.log(`⚠️ Skipping unhealthy provider: ${provider}`)
        continue
      }
      
      try {
        console.log(`🚀 Attempting request with ${provider}`)
        
        // Translate request to provider format
        const providerRequest = translateBetweenProviders('openai', provider as any, baseRequest)
        
        // Calculate estimated cost
        const universal = toUniversal('openai', baseRequest)
        const tokenCount = countUniversalTokens(universal)
        const modelCosts = await getModelCosts(this.getModelForProvider(provider))
        const estimatedCost = this.calculateCost(tokenCount, modelCosts)
        
        // Check cost threshold
        if (conversation.config.costThreshold && estimatedCost > conversation.config.costThreshold) {
          console.log(`💰 Cost threshold exceeded: $${estimatedCost.toFixed(4)} > $${conversation.config.costThreshold}`)
          throw new Error('Cost threshold exceeded')
        }
        
        // Make API call (mock implementation)
        const apiResponse = await this.makeApiCall(provider, providerRequest)
        
        // Extract response
        response = this.extractResponseText(apiResponse, provider)
        tokens = tokenCount.inputTokens + (tokenCount.estimatedOutputTokens || 50) // Estimate output tokens
        cost = estimatedCost
        
        selectedProvider = provider
        fallbackUsed = provider !== conversation.provider
        
        console.log(`✅ Success with ${provider} in ${Date.now() - startTime}ms`)
        break
        
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.log(`❌ Provider ${provider} failed: ${message}`)
        
        // Mark provider as unhealthy if it's a server error
        if (message.includes('server') || message.includes('500')) {
          this.markProviderUnhealthy(provider)
        }
        
        if (provider === providersToTry[providersToTry.length - 1]) {
          throw error // Last provider failed
        }
      }
    }
    
    if (!response) {
      throw new Error('All providers failed')
    }
    
    // Add assistant response to conversation
    const assistantMsgId = `msg_${Date.now()}_assistant`
    const assistantMsg: ConversationMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: response,
      timestamp: Date.now(),
      provider: selectedProvider,
      tokens,
      cost
    }
    
    conversation.messages.push(assistantMsg)
    
    // Update conversation metadata
    conversation.metadata.totalTokens += tokens
    conversation.metadata.totalCost += cost
    conversation.metadata.updatedAt = Date.now()
    
    // Generate observability data
    if (conversation.config.enableObservability) {
      const universal = toUniversal('openai', baseRequest)
      const tokenCounts = countUniversalTokens(universal)
      const observabilityData = await createObservabilityData(
        tokenCounts.inputTokens,
        tokens,
        'openai',
        this.getModelForProvider(selectedProvider),
        false,
        {
          multimodalContentCount: tokenCounts.multimodalContentCount,
          toolCallsCount: tokenCounts.toolCallsCount,
          estimatedOutputTokens: tokenCounts.estimatedOutputTokens
        }
      )
      console.log(`📊 Observability:`, observabilityData)
    }
    
    const latency = Date.now() - startTime
    
    return {
      response,
      messageId: assistantMsgId,
      metadata: {
        provider: selectedProvider,
        model: this.getModelForProvider(selectedProvider),
        tokens,
        cost,
        latency,
        fallbackUsed
      }
    }
  }
  
  /**
   * Get conversation history
   */
  getConversation(conversationId: string): Conversation | null {
    return this.conversations.get(conversationId) || null
  }
  
  /**
   * Get conversation summary/statistics
   */
  getConversationStats(conversationId: string) {
    const conversation = this.conversations.get(conversationId)
    if (!conversation) {
      return null
    }
    
    const messagesByProvider = conversation.messages
      .filter(m => m.provider)
      .reduce((acc, msg) => {
        acc[msg.provider!] = (acc[msg.provider!] || 0) + 1
        return acc
      }, {} as Record<string, number>)
    
    return {
      id: conversation.id,
      userId: conversation.userId,
      messageCount: conversation.messages.length,
      totalTokens: conversation.metadata.totalTokens,
      totalCost: conversation.metadata.totalCost,
      avgCostPerMessage: conversation.metadata.totalCost / Math.max(1, conversation.messages.filter(m => m.role === 'assistant').length),
      providerUsage: messagesByProvider,
      duration: conversation.metadata.updatedAt - conversation.metadata.createdAt,
      config: conversation.config
    }
  }
  
  /**
   * Update conversation configuration
   */
  updateConversationConfig(conversationId: string, newConfig: Partial<ChatConfig>): boolean {
    const conversation = this.conversations.get(conversationId)
    if (!conversation) {
      return false
    }
    
    conversation.config = { ...conversation.config, ...newConfig }
    conversation.metadata.updatedAt = Date.now()
    
    // Re-select optimal provider if preferences changed
    if (newConfig.preferredProviders) {
      conversation.provider = this.selectOptimalProvider(conversation.config)
    }
    
    return true
  }
  
  // Helper methods
  private selectOptimalProvider(config: ChatConfig): 'openai' | 'anthropic' | 'google' {
    const healthyProviders = config.preferredProviders.filter(p => this.isProviderHealthy(p)) as Array<'openai' | 'anthropic' | 'google'>
    
    if (healthyProviders.length === 0) {
      return config.preferredProviders[0] // Fallback to first preferred
    }
    
    // Simple round-robin for now (could be enhanced with cost/performance optimization)
    return healthyProviders[Math.floor(Math.random() * healthyProviders.length)]
  }
  
  private getModelForProvider(provider: 'openai' | 'anthropic' | 'google'): string {
    const models: Record<'openai' | 'anthropic' | 'google', string> = {
      openai: 'gpt-4',
      anthropic: 'claude-3-opus-20240229',
      google: 'gemini-1.5-pro'
    }
    return models[provider]
  }
  
  private checkRateLimit(userId: string): boolean {
    const now = Date.now()
    const userLimit = this.rateLimits.get(userId)
    
    if (!userLimit || now > userLimit.resetTime) {
      // Reset or initialize rate limit (10 requests per minute)
      this.rateLimits.set(userId, {
        count: 1,
        resetTime: now + 60000 // 1 minute
      })
      return true
    }
    
    if (userLimit.count >= 10) {
      return false // Rate limit exceeded
    }
    
    userLimit.count++
    return true
  }
  
  private isProviderHealthy(provider: string): boolean {
    const health = this.providerHealth.get(provider)
    return health?.isHealthy ?? false
  }
  
  private markProviderUnhealthy(provider: string) {
    const health = this.providerHealth.get(provider)
    if (health) {
      health.isHealthy = false
      health.lastCheck = Date.now()
      
      // Auto-recover after 5 minutes
      setTimeout(() => {
        health.isHealthy = true
        health.lastCheck = Date.now()
        console.log(`✅ Provider ${provider} marked as healthy again`)
      }, 300000)
    }
  }
  
  private startHealthMonitoring() {
    setInterval(() => {
      // Periodic health checks could be implemented here
      console.log('🏥 Provider health check completed')
    }, 30000) // Every 30 seconds
  }
  
  private calculateCost(tokens: { inputTokens: number; estimatedOutputTokens?: number }, modelCosts: { inputCost: number; outputCost: number }): number {
    const inputCost = (tokens.inputTokens / 1000) * (modelCosts.inputCost || 0.001)
    const outputCost = ((tokens.estimatedOutputTokens || 0) / 1000) * (modelCosts.outputCost || 0.002)
    return inputCost + outputCost
  }
  
  private extractResponseText(response: any, provider: string): string {
    // Mock response extraction
    return `Response from ${provider}: This is a simulated response to demonstrate the chatbot service.`
  }
  
  private async makeApiCall(provider: string, request: any): Promise<any> {
    // Simulate API call with random delay and potential failures
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500))
    
    // Simulate random failures (5% chance)
    if (Math.random() < 0.05) {
      throw new Error(`Simulated ${provider} API error`)
    }
    
    return {
      choices: [{ message: { content: `Mock response from ${provider}` } }],
      usage: { prompt_tokens: 100, completion_tokens: 50 }
    }
  }
}

// Express.js API endpoints
function createChatbotAPI() {
  const app = express()
  const chatService = new ProductionChatbotService()
  
  app.use(express.json())
  
  // Create conversation
  app.post('/conversations', async (req: Request, res: Response) => {
    try {
      const { userId, config } = req.body
      const result = await chatService.createConversation(userId, config)
      res.json(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      res.status(500).json({ error: message })
    }
  })
  
  // Send message
  app.post('/conversations/:id/messages', async (req: Request, res: Response) => {
    try {
      const { id } = req.params
      const { message, options } = req.body
      const result = await chatService.sendMessage(id, message, options)
      res.json(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      res.status(500).json({ error: message })
    }
  })
  
  // Get conversation
  app.get('/conversations/:id', (req: Request, res: Response) => {
    const { id } = req.params
    const conversation = chatService.getConversation(id)
    
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' })
    }
    
    res.json(conversation)
  })
  
  // Get conversation stats
  app.get('/conversations/:id/stats', (req: Request, res: Response) => {
    const { id } = req.params
    const stats = chatService.getConversationStats(id)
    
    if (!stats) {
      return res.status(404).json({ error: 'Conversation not found' })
    }
    
    res.json(stats)
  })
  
  // Update conversation config
  app.patch('/conversations/:id/config', (req: Request, res: Response) => {
    const { id } = req.params
    const { config } = req.body
    const success = chatService.updateConversationConfig(id, config)
    
    if (!success) {
      return res.status(404).json({ error: 'Conversation not found' })
    }
    
    res.json({ success: true })
  })
  
  return app
}

// Example usage
async function demonstrateProductionChatbot() {
  console.log('💬 Production Chatbot Service Demo\n')
  
  const chatService = new ProductionChatbotService()
  
  // Create a conversation
  const { conversationId } = await chatService.createConversation('user123', {
    temperature: 0.8,
    maxTokens: 500,
    systemPrompt: 'You are a helpful customer service assistant.',
    preferredProviders: ['openai', 'anthropic']
  })
  
  console.log(`📝 Created conversation: ${conversationId}\n`)
  
  // Send some messages
  const messages = [
    'Hello, I need help with my account',
    'Can you explain how to reset my password?',
    'What are your business hours?'
  ]
  
  for (const message of messages) {
    console.log(`👤 User: ${message}`)
    
    try {
      const response = await chatService.sendMessage(conversationId, message)
      console.log(`🤖 Assistant: ${response.response}`)
      console.log(`📊 Metadata: Provider=${response.metadata.provider}, Tokens=${response.metadata.tokens}, Cost=$${response.metadata.cost.toFixed(4)}, Latency=${response.metadata.latency}ms`)
      console.log(`🔄 Fallback used: ${response.metadata.fallbackUsed}\n`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.log(`❌ Error: ${message}\n`)
    }
  }
  
  // Get conversation stats
  const stats = chatService.getConversationStats(conversationId)
  console.log('📈 Conversation Statistics:')
  console.log(JSON.stringify(stats, null, 2))
}

// Start server if running directly
if (require.main === module) {
  const app = createChatbotAPI()
  const PORT = process.env.PORT || 3001
  
  app.listen(PORT, () => {
    console.log(`🌐 Production Chatbot Service running on port ${PORT}`)
    console.log('📡 Available endpoints:')
    console.log('  POST /conversations - Create conversation')
    console.log('  POST /conversations/:id/messages - Send message')
    console.log('  GET /conversations/:id - Get conversation')
    console.log('  GET /conversations/:id/stats - Get stats')
    console.log('  PATCH /conversations/:id/config - Update config')
  })
  
  // Run demonstration
  setTimeout(demonstrateProductionChatbot, 1000)
}

export { ProductionChatbotService, createChatbotAPI }