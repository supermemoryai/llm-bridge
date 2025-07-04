/**
 * Cost Optimization Example
 * 
 * Demonstrates how to automatically optimize costs by selecting the most
 * cost-effective provider and model for each request using LLM Bridge.
 */

import { 
  toUniversal, 
  fromUniversal, 
  detectProvider, 
  countUniversalTokens, 
  getModelCosts,
  translateBetweenProviders 
} from '../src'

interface ModelOption {
  provider: string
  model: string
  capability: 'basic' | 'advanced' | 'vision' | 'reasoning'
  costMultiplier: number
  speedScore: number // 1-10, higher is faster
  qualityScore: number // 1-10, higher is better
}

interface OptimizationConfig {
  prioritize: 'cost' | 'speed' | 'quality' | 'balanced'
  maxCostPerRequest?: number
  requireCapability?: string[]
  excludeProviders?: string[]
  minQualityScore?: number
}

class LLMCostOptimizer {
  private modelOptions: ModelOption[] = [
    // OpenAI Models
    { provider: 'openai', model: 'gpt-4o-mini', capability: 'basic', costMultiplier: 0.1, speedScore: 9, qualityScore: 7 },
    { provider: 'openai', model: 'gpt-4o', capability: 'advanced', costMultiplier: 1.0, speedScore: 7, qualityScore: 9 },
    { provider: 'openai', model: 'gpt-4-vision-preview', capability: 'vision', costMultiplier: 1.2, speedScore: 6, qualityScore: 9 },
    { provider: 'openai', model: 'o1-preview', capability: 'reasoning', costMultiplier: 3.0, speedScore: 3, qualityScore: 10 },
    
    // Anthropic Models
    { provider: 'anthropic', model: 'claude-3-haiku-20240307', capability: 'basic', costMultiplier: 0.08, speedScore: 10, qualityScore: 6 },
    { provider: 'anthropic', model: 'claude-3-sonnet-20240229', capability: 'advanced', costMultiplier: 0.5, speedScore: 8, qualityScore: 8 },
    { provider: 'anthropic', model: 'claude-3-opus-20240229', capability: 'advanced', costMultiplier: 2.0, speedScore: 5, qualityScore: 10 },
    
    // Google Models
    { provider: 'google', model: 'gemini-1.5-flash', capability: 'basic', costMultiplier: 0.05, speedScore: 10, qualityScore: 6 },
    { provider: 'google', model: 'gemini-1.5-pro', capability: 'advanced', costMultiplier: 0.3, speedScore: 8, qualityScore: 8 },
    { provider: 'google', model: 'gemini-1.5-pro-vision', capability: 'vision', costMultiplier: 0.4, speedScore: 7, qualityScore: 8 }
  ]
  
  /**
   * Find the optimal model for a given request and optimization config
   */
  async optimizeModelSelection(
    request: any,
    config: OptimizationConfig = { prioritize: 'balanced' }
  ): Promise<{
    selectedModel: ModelOption
    estimatedCost: number
    reasoning: string[]
    alternatives: Array<{ model: ModelOption; cost: number; score: number }>
  }> {
    console.log(`🎯 Optimizing model selection (priority: ${config.prioritize})`)
    
    // Convert request to universal format for analysis
    const sourceProvider = detectProvider(request)
    const universal = toUniversal(sourceProvider as any, request)
    const tokens = countUniversalTokens(universal, universal.model)
    
    console.log(`📊 Token analysis: ${tokens.inputTokens} input, ${tokens.estimatedOutputTokens || 'estimated'} output`)
    
    // Filter models based on requirements
    let candidateModels = this.modelOptions.filter(model => {
      // Exclude providers if specified
      if (config.excludeProviders?.includes(model.provider)) {
        return false
      }
      
      // Check capability requirements
      if (config.requireCapability?.length) {
        return config.requireCapability.includes(model.capability)
      }
      
      // Check minimum quality score
      if (config.minQualityScore && model.qualityScore < config.minQualityScore) {
        return false
      }
      
      return true
    })
    
    console.log(`🔍 Found ${candidateModels.length} candidate models`)
    
    // Calculate costs and scores for each model
    const scoredModels = await Promise.all(candidateModels.map(async model => {
      const baseCosts = await getModelCosts(model.model)
      const inputCost = (tokens.inputTokens / 1000) * baseCosts.inputCost * model.costMultiplier
      const outputCost = (tokens.estimatedOutputTokens / 1000) * baseCosts.outputCost * model.costMultiplier
      const totalCost = inputCost + outputCost
      
      // Filter by max cost if specified
      if (config.maxCostPerRequest && totalCost > config.maxCostPerRequest) {
        return null
      }
      
      // Calculate optimization score based on priority
      let score = 0
      switch (config.prioritize) {
        case 'cost':
          score = 1 / (totalCost + 0.001) // Higher score for lower cost
          break
        case 'speed':
          score = model.speedScore
          break
        case 'quality':
          score = model.qualityScore
          break
        case 'balanced':
        default:
          // Weighted combination: 40% cost, 30% quality, 30% speed
          const costScore = 1 / (totalCost + 0.001)
          const normalizedCostScore = Math.min(costScore * 0.01, 10) // Normalize to 1-10 scale
          score = (normalizedCostScore * 0.4) + (model.qualityScore * 0.3) + (model.speedScore * 0.3)
          break
      }
      
      return {
        model,
        cost: totalCost,
        score
      }
    })).then(results => results.filter(Boolean)) as Array<{ model: ModelOption; cost: number; score: number }>
    
    if (scoredModels.length === 0) {
      throw new Error('No models meet the specified requirements')
    }
    
    // Sort by score (highest first)
    scoredModels.sort((a, b) => b.score - a.score)
    
    const selectedOption = scoredModels[0]
    const alternatives = scoredModels.slice(1, 4) // Top 3 alternatives
    
    // Generate reasoning
    const reasoning = [
      `Selected ${selectedOption.model.provider} ${selectedOption.model.model}`,
      `Estimated cost: $${selectedOption.cost.toFixed(4)}`,
      `Quality score: ${selectedOption.model.qualityScore}/10`,
      `Speed score: ${selectedOption.model.speedScore}/10`,
      `Optimization score: ${selectedOption.score.toFixed(2)}`
    ]
    
    if (config.prioritize === 'cost') {
      reasoning.push(`Cost-optimized: ${selectedOption.cost < 0.01 ? 'very low cost' : 'good value'}`)
    } else if (config.prioritize === 'quality') {
      reasoning.push(`Quality-optimized: ${selectedOption.model.qualityScore >= 9 ? 'premium quality' : 'high quality'}`)
    } else if (config.prioritize === 'speed') {
      reasoning.push(`Speed-optimized: ${selectedOption.model.speedScore >= 9 ? 'very fast' : 'fast response'}`)
    }
    
    console.log(`✅ Selected: ${selectedOption.model.provider} ${selectedOption.model.model}`)
    console.log(`💰 Estimated cost: $${selectedOption.cost.toFixed(4)}`)
    console.log(`📈 Score: ${selectedOption.score.toFixed(2)}`)
    
    return {
      selectedModel: selectedOption.model,
      estimatedCost: selectedOption.cost,
      reasoning,
      alternatives
    }
  }
  
  /**
   * Execute request with optimal model selection
   */
  async executeOptimizedRequest(
    request: any,
    config: OptimizationConfig = { prioritize: 'balanced' }
  ): Promise<{
    response: any
    metadata: {
      originalProvider: string
      selectedProvider: string
      selectedModel: string
      costSavings?: number
      reasoning: string[]
    }
  }> {
    const startTime = Date.now()
    
    // Get optimal model
    const optimization = await this.optimizeModelSelection(request, config)
    const { selectedModel } = optimization
    
    // Compare with original request cost
    const originalProvider = detectProvider(request)
    const originalUniversal = toUniversal(originalProvider as any, request)
    const originalTokens = countUniversalTokens(originalUniversal, originalUniversal.model)
    const originalModelCosts = await getModelCosts(originalUniversal.model)
    const originalCost = this.calculateCost(originalTokens, originalModelCosts, 1.0)
    
    const costSavings = originalCost - optimization.estimatedCost
    
    // Update request to use optimal model
    const optimizedUniversal = { ...originalUniversal }
    optimizedUniversal.model = selectedModel.model
    
    // Convert to target provider format
    const optimizedRequest = fromUniversal(selectedModel.provider as any, optimizedUniversal)
    
    console.log(`🚀 Executing optimized request with ${selectedModel.provider}`)
    
    // Mock API call (replace with actual provider SDK)
    const response = await this.mockApiCall(selectedModel.provider, optimizedRequest)
    
    const executionTime = Date.now() - startTime
    console.log(`✅ Request completed in ${executionTime}ms`)
    
    return {
      response,
      metadata: {
        originalProvider,
        selectedProvider: selectedModel.provider,
        selectedModel: selectedModel.model,
        costSavings: costSavings > 0 ? costSavings : undefined,
        reasoning: optimization.reasoning
      }
    }
  }
  
  /**
   * Batch optimization for multiple requests
   */
  async optimizeBatch(
    requests: Array<{ id: string; request: any; config?: OptimizationConfig }>,
    globalConfig: OptimizationConfig = { prioritize: 'cost' }
  ): Promise<Array<{
    id: string
    optimization: any
    success: boolean
    error?: string
  }>> {
    console.log(`📦 Optimizing batch of ${requests.length} requests`)
    
    const results = []
    let totalSavings = 0
    
    for (const { id, request, config } of requests) {
      try {
        const finalConfig = { ...globalConfig, ...config }
        const optimization = await this.optimizeModelSelection(request, finalConfig)
        
        // Calculate potential savings
        const originalProvider = detectProvider(request)
        const originalUniversal = toUniversal(originalProvider as any, request)
        const originalTokens = countUniversalTokens(originalUniversal, originalUniversal.model)
        const originalCost = this.calculateCost(originalTokens, await getModelCosts(originalUniversal.model), 1.0)
        
        const savings = originalCost - optimization.estimatedCost
        totalSavings += Math.max(0, savings)
        
        results.push({
          id,
          optimization,
          success: true
        })
        
      } catch (error) {
        results.push({
          id,
          optimization: null,
          success: false,
          error: error.message
        })
      }
    }
    
    console.log(`💰 Total potential savings: $${totalSavings.toFixed(4)}`)
    
    return results
  }
  
  /**
   * Get cost comparison across all providers for a request
   */
  async getCostComparison(request: any): Promise<Array<{
    provider: string
    model: string
    cost: number
    capability: string
    qualityScore: number
    speedScore: number
  }>> {
    const sourceProvider = detectProvider(request)
    const universal = toUniversal(sourceProvider as any, request)
    const tokens = countUniversalTokens(universal, universal.model)
    
    const results = await Promise.all(this.modelOptions.map(async modelOption => {
      const baseCosts = await getModelCosts(modelOption.model)
      const cost = this.calculateCost(tokens, baseCosts, modelOption.costMultiplier)
      
      return {
        provider: modelOption.provider,
        model: modelOption.model,
        cost,
        capability: modelOption.capability,
        qualityScore: modelOption.qualityScore,
        speedScore: modelOption.speedScore
      }
    }))
    
    return results.sort((a, b) => a.cost - b.cost)
  }
  
  // Helper methods
  private calculateCost(tokens: any, baseCosts: any, multiplier: number): number {
    const inputCost = (tokens.inputTokens / 1000) * baseCosts.inputCost * multiplier
    const outputCost = (tokens.estimatedOutputTokens / 1000) * baseCosts.outputCost * multiplier
    return inputCost + outputCost
  }
  
  private async mockApiCall(provider: string, request: any): Promise<any> {
    // Simulate API latency based on model speed
    const model = this.modelOptions.find(m => m.provider === provider)
    const latency = model ? (11 - model.speedScore) * 100 : 500
    
    await new Promise(resolve => setTimeout(resolve, latency))
    
    return {
      response: `Optimized response from ${provider}`,
      usage: { prompt_tokens: 100, completion_tokens: 50 }
    }
  }
}

// Example usage and demonstrations
async function demonstrateCostOptimization() {
  console.log('💰 LLM Cost Optimization Demo\n')
  
  const optimizer = new LLMCostOptimizer()
  
  // Example 1: Basic cost optimization
  console.log('📝 Example 1: Basic Cost Optimization')
  
  const basicRequest = {
    model: 'gpt-4',
    messages: [
      { role: 'user', content: 'Summarize the benefits of renewable energy in 100 words.' }
    ],
    temperature: 0.7,
    max_tokens: 150
  }
  
  const costOptimized = await optimizer.optimizeModelSelection(basicRequest, {
    prioritize: 'cost'
  })
  
  console.log('🎯 Cost-Optimized Selection:')
  console.log(`Model: ${costOptimized.selectedModel.provider} ${costOptimized.selectedModel.model}`)
  console.log(`Cost: $${costOptimized.estimatedCost.toFixed(4)}`)
  console.log('Reasoning:', costOptimized.reasoning.join(', '))
  
  // Example 2: Quality-first optimization
  console.log('\n📝 Example 2: Quality-First Optimization')
  
  const qualityOptimized = await optimizer.optimizeModelSelection(basicRequest, {
    prioritize: 'quality',
    minQualityScore: 8
  })
  
  console.log('🏆 Quality-Optimized Selection:')
  console.log(`Model: ${qualityOptimized.selectedModel.provider} ${qualityOptimized.selectedModel.model}`)
  console.log(`Quality Score: ${qualityOptimized.selectedModel.qualityScore}/10`)
  console.log(`Cost: $${qualityOptimized.estimatedCost.toFixed(4)}`)
  
  // Example 3: Speed optimization
  console.log('\n📝 Example 3: Speed Optimization')
  
  const speedOptimized = await optimizer.optimizeModelSelection(basicRequest, {
    prioritize: 'speed'
  })
  
  console.log('⚡ Speed-Optimized Selection:')
  console.log(`Model: ${speedOptimized.selectedModel.provider} ${speedOptimized.selectedModel.model}`)
  console.log(`Speed Score: ${speedOptimized.selectedModel.speedScore}/10`)
  console.log(`Cost: $${speedOptimized.estimatedCost.toFixed(4)}`)
  
  // Example 4: Vision capability requirement
  console.log('\n📝 Example 4: Vision Capability Requirement')
  
  const visionRequest = {
    model: 'gpt-4-vision-preview',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Describe this image' },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,/9j/4AAQ...' } }
      ]
    }]
  }
  
  const visionOptimized = await optimizer.optimizeModelSelection(visionRequest, {
    prioritize: 'balanced',
    requireCapability: ['vision']
  })
  
  console.log('👁️ Vision-Capable Selection:')
  console.log(`Model: ${visionOptimized.selectedModel.provider} ${visionOptimized.selectedModel.model}`)
  console.log(`Capability: ${visionOptimized.selectedModel.capability}`)
  console.log(`Cost: $${visionOptimized.estimatedCost.toFixed(4)}`)
  
  // Example 5: Cost comparison
  console.log('\n📝 Example 5: Cost Comparison Across All Providers')
  
  const comparison = await optimizer.getCostComparison(basicRequest)
  
  console.log('💸 Cost Comparison (sorted by cost):')
  comparison.slice(0, 5).forEach((option, index) => {
    console.log(`${index + 1}. ${option.provider} ${option.model}: $${option.cost.toFixed(4)} (Quality: ${option.qualityScore}/10, Speed: ${option.speedScore}/10)`)
  })
  
  // Example 6: Batch optimization
  console.log('\n📝 Example 6: Batch Optimization')
  
  const batchRequests = [
    {
      id: 'req1',
      request: {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Simple question about math' }]
      },
      config: { prioritize: 'cost' as const }
    },
    {
      id: 'req2', 
      request: {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Complex reasoning task requiring deep analysis' }]
      },
      config: { prioritize: 'quality' as const, minQualityScore: 9 }
    },
    {
      id: 'req3',
      request: {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Quick response needed' }]
      },
      config: { prioritize: 'speed' as const }
    }
  ]
  
  const batchResults = await optimizer.optimizeBatch(batchRequests)
  
  console.log('📦 Batch Optimization Results:')
  batchResults.forEach(result => {
    if (result.success) {
      console.log(`✅ ${result.id}: ${result.optimization.selectedModel.provider} ${result.optimization.selectedModel.model} ($${result.optimization.estimatedCost.toFixed(4)})`)
    } else {
      console.log(`❌ ${result.id}: ${result.error}`)
    }
  })
  
  // Example 7: Execute optimized request
  console.log('\n📝 Example 7: Execute Optimized Request')
  
  const executionResult = await optimizer.executeOptimizedRequest(basicRequest, {
    prioritize: 'balanced',
    maxCostPerRequest: 0.05
  })
  
  console.log('🚀 Execution Result:')
  console.log(`Original Provider: ${executionResult.metadata.originalProvider}`)
  console.log(`Selected Provider: ${executionResult.metadata.selectedProvider}`)
  console.log(`Selected Model: ${executionResult.metadata.selectedModel}`)
  if (executionResult.metadata.costSavings) {
    console.log(`Cost Savings: $${executionResult.metadata.costSavings.toFixed(4)}`)
  }
  
  console.log('\n🎉 Cost optimization examples completed!')
  console.log('\n💡 Key Benefits:')
  console.log('   • Automatic cost optimization across providers')
  console.log('   • Flexible prioritization (cost, speed, quality, balanced)')
  console.log('   • Capability-based model selection')
  console.log('   • Batch processing for multiple requests')
  console.log('   • Real-time cost comparison and analysis')
}

// Run demonstration if executed directly
if (require.main === module) {
  demonstrateCostOptimization().catch(console.error)
}

export { LLMCostOptimizer }