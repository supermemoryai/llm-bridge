/**
 * Multi-Provider Load Balancer Example
 * 
 * Demonstrates how to implement intelligent load balancing across multiple
 * LLM providers with automatic fallbacks, health checking, and cost optimization.
 */

import { toUniversal, fromUniversal, countUniversalTokens } from '../src'

// Provider configuration with health status and performance metrics
interface ProviderConfig {
  name: string
  isHealthy: boolean
  latency: number // Average response time in ms
  errorRate: number // Error rate as percentage (0-100)
  costMultiplier: number // Relative cost compared to baseline
  maxConcurrency: number
  currentRequests: number
}

class UniversalLLMLoadBalancer {
  private providers: Map<string, ProviderConfig> = new Map()
  private requestHistory: Array<{ provider: string; timestamp: number; success: boolean; latency: number }> = []
  
  constructor() {
    // Initialize provider configurations
    this.providers.set('openai', {
      name: 'openai',
      isHealthy: true,
      latency: 800,
      errorRate: 2,
      costMultiplier: 1.0,
      maxConcurrency: 10,
      currentRequests: 0
    })
    
    this.providers.set('anthropic', {
      name: 'anthropic',
      isHealthy: true,
      latency: 1200,
      errorRate: 1,
      costMultiplier: 1.2,
      maxConcurrency: 8,
      currentRequests: 0
    })
    
    this.providers.set('google', {
      name: 'google',
      isHealthy: true,
      latency: 600,
      errorRate: 3,
      costMultiplier: 0.8,
      maxConcurrency: 12,
      currentRequests: 0
    })
    
    // Start health monitoring
    this.startHealthMonitoring()
  }
  
  /**
   * Select the best provider based on multiple criteria
   */
  selectProvider(request: any, strategy: 'fastest' | 'cheapest' | 'most_reliable' | 'balanced' = 'balanced'): string {
    const availableProviders = Array.from(this.providers.values())
      .filter(p => p.isHealthy && p.currentRequests < p.maxConcurrency)
    
    if (availableProviders.length === 0) {
      throw new Error('No available providers')
    }
    
    // Calculate token count for cost estimation
    const universal = toUniversal('openai', request)
    const tokens = countUniversalTokens(universal)
    
    let selectedProvider: ProviderConfig
    
    switch (strategy) {
      case 'fastest':
        selectedProvider = availableProviders.reduce((best, current) => 
          current.latency < best.latency ? current : best
        )
        break
        
      case 'cheapest':
        selectedProvider = availableProviders.reduce((best, current) => 
          current.costMultiplier < best.costMultiplier ? current : best
        )
        break
        
      case 'most_reliable':
        selectedProvider = availableProviders.reduce((best, current) => 
          current.errorRate < best.errorRate ? current : best
        )
        break
        
      case 'balanced':
      default:
        // Balanced scoring considers latency, cost, and reliability
        selectedProvider = availableProviders.reduce((best, current) => {
          const currentScore = this.calculateBalancedScore(current, tokens)
          const bestScore = this.calculateBalancedScore(best, tokens)
          return currentScore > bestScore ? current : best
        })
        break
    }
    
    console.log(`🎯 Selected provider: ${selectedProvider.name} (strategy: ${strategy})`)
    console.log(`   Latency: ${selectedProvider.latency}ms`)
    console.log(`   Error rate: ${selectedProvider.errorRate}%`)
    console.log(`   Cost multiplier: ${selectedProvider.costMultiplier}x`)
    console.log(`   Current load: ${selectedProvider.currentRequests}/${selectedProvider.maxConcurrency}`)
    
    return selectedProvider.name
  }
  
  /**
   * Calculate balanced score for provider selection
   */
  private calculateBalancedScore(provider: ProviderConfig, tokens: { inputTokens: number; multimodalContentCount: number; toolCallsCount: number }): number {
    // Normalize metrics (higher score = better)
    const latencyScore = 1000 / (provider.latency + 100) // Inverse of latency
    const reliabilityScore = (100 - provider.errorRate) / 100 // Inverse of error rate
    const costScore = 1 / (provider.costMultiplier + 0.1) // Inverse of cost
    const loadScore = (provider.maxConcurrency - provider.currentRequests) / provider.maxConcurrency
    
    // Weighted combination
    return (
      latencyScore * 0.3 +
      reliabilityScore * 0.3 +
      costScore * 0.2 +
      loadScore * 0.2
    )
  }
  
  /**
   * Execute request with automatic fallbacks
   */
  async executeRequest(
    request: any, 
    strategy: 'fastest' | 'cheapest' | 'most_reliable' | 'balanced' = 'balanced'
  ): Promise<any> {
    const startTime = Date.now()
    const maxRetries = 3
    let lastError: Error | null = null
    
    // Get ordered list of providers to try
    const providerOrder = this.getProviderFallbackOrder(request, strategy)
    
    for (let attempt = 0; attempt < maxRetries && providerOrder.length > 0; attempt++) {
      const providerName = providerOrder.shift()!
      const provider = this.providers.get(providerName)!
      
      if (!provider.isHealthy || provider.currentRequests >= provider.maxConcurrency) {
        console.log(`⏭️  Skipping ${providerName}: unhealthy or overloaded`)
        continue
      }
      
      try {
        console.log(`🚀 Attempting request with ${providerName} (attempt ${attempt + 1})`)
        
        // Increment request counter
        provider.currentRequests++
        
        // Convert request to target provider format
        const universal = toUniversal('openai', request)
        const targetRequest = fromUniversal(providerName as any, universal)
        
        // Mock API call (replace with actual provider SDK in production)
        const response = await this.mockProviderCall(providerName, targetRequest)
        
        // Record successful request
        const requestTime = Date.now() - startTime
        this.recordRequest(providerName, true, requestTime)
        
        console.log(`✅ Request successful with ${providerName} in ${requestTime}ms`)
        
        return {
          ...response,
          metadata: {
            provider: providerName,
            requestTime,
            attempt: attempt + 1,
            fallbacksUsed: attempt > 0
          }
        }
        
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.log(`❌ Request failed with ${providerName}:`, message)
        
        // Record failed request
        this.recordRequest(providerName, false, Date.now() - startTime)
        lastError = error as Error
        
        // Mark provider as potentially unhealthy if too many recent failures
        this.updateProviderHealth(providerName)
        
      } finally {
        // Decrement request counter
        provider.currentRequests--
      }
    }
    
    throw new Error(`All providers failed. Last error: ${lastError?.message}`)
  }
  
  /**
   * Get ordered list of providers for fallback strategy
   */
  private getProviderFallbackOrder(request: any, strategy: string): string[] {
    const availableProviders = Array.from(this.providers.values())
      .filter(p => p.isHealthy)
      .sort((a, b) => {
        switch (strategy) {
          case 'fastest': return a.latency - b.latency
          case 'cheapest': return a.costMultiplier - b.costMultiplier
          case 'most_reliable': return a.errorRate - b.errorRate
          default:
            const universal = toUniversal('openai', request)
            const tokens = countUniversalTokens(universal)
            return this.calculateBalancedScore(b, tokens) - this.calculateBalancedScore(a, tokens)
        }
      })
    
    return availableProviders.map(p => p.name)
  }
  
  /**
   * Mock provider API call (replace with actual SDK calls)
   */
  private async mockProviderCall(provider: string, request: any): Promise<any> {
    // Simulate network latency
    const baseLatency = this.providers.get(provider)!.latency
    const jitter = Math.random() * 200 - 100 // ±100ms jitter
    await new Promise(resolve => setTimeout(resolve, baseLatency + jitter))
    
    // Simulate random failures based on error rate
    const errorRate = this.providers.get(provider)!.errorRate
    if (Math.random() * 100 < errorRate) {
      throw new Error(`Simulated ${provider} API error`)
    }
    
    // Return mock response
    return {
      choices: [{ 
        message: { 
          content: `Response from ${provider}: ${JSON.stringify(request.messages?.slice(-1) || request.contents?.slice(-1) || 'Hello')}` 
        } 
      }],
      usage: { prompt_tokens: 100, completion_tokens: 50 }
    }
  }
  
  /**
   * Record request metrics for monitoring
   */
  private recordRequest(provider: string, success: boolean, latency: number) {
    this.requestHistory.push({
      provider,
      timestamp: Date.now(),
      success,
      latency
    })
    
    // Keep only last 100 requests
    if (this.requestHistory.length > 100) {
      this.requestHistory.shift()
    }
    
    // Update provider metrics
    this.updateProviderMetrics(provider)
  }
  
  /**
   * Update provider metrics based on recent history
   */
  private updateProviderMetrics(providerName: string) {
    const provider = this.providers.get(providerName)!
    const recentRequests = this.requestHistory
      .filter(r => r.provider === providerName && Date.now() - r.timestamp < 300000) // Last 5 minutes
    
    if (recentRequests.length > 0) {
      // Update latency (average of recent requests)
      const avgLatency = recentRequests.reduce((sum, r) => sum + r.latency, 0) / recentRequests.length
      provider.latency = Math.round(avgLatency)
      
      // Update error rate
      const failures = recentRequests.filter(r => !r.success).length
      provider.errorRate = Math.round((failures / recentRequests.length) * 100)
    }
  }
  
  /**
   * Update provider health status
   */
  private updateProviderHealth(providerName: string) {
    const provider = this.providers.get(providerName)!
    const recentRequests = this.requestHistory
      .filter(r => r.provider === providerName && Date.now() - r.timestamp < 60000) // Last 1 minute
    
    if (recentRequests.length >= 3) {
      const recentFailures = recentRequests.filter(r => !r.success).length
      const failureRate = recentFailures / recentRequests.length
      
      if (failureRate > 0.5) {
        provider.isHealthy = false
        console.log(`⚠️  Marking ${providerName} as unhealthy (${Math.round(failureRate * 100)}% failure rate)`)
        
        // Schedule health check
        setTimeout(() => {
          provider.isHealthy = true
          console.log(`✅ Restored ${providerName} to healthy status`)
        }, 30000) // 30 second cooldown
      }
    }
  }
  
  /**
   * Start periodic health monitoring
   */
  private startHealthMonitoring() {
    setInterval(() => {
      console.log('\n📊 Provider Status:')
      for (const [name, provider] of this.providers) {
        console.log(`   ${name}: ${provider.isHealthy ? '✅' : '❌'} | ` +
                   `${provider.latency}ms | ${provider.errorRate}% errors | ` +
                   `${provider.currentRequests}/${provider.maxConcurrency} requests`)
      }
    }, 10000) // Every 10 seconds
  }
  
  /**
   * Get current statistics
   */
  getStats() {
    const stats = {}
    for (const [name, provider] of this.providers) {
      const recentRequests = this.requestHistory.filter(r => r.provider === name)
      ;(stats as Record<string, unknown>)[name] = {
        isHealthy: provider.isHealthy,
        latency: provider.latency,
        errorRate: provider.errorRate,
        currentLoad: provider.currentRequests,
        maxConcurrency: provider.maxConcurrency,
        totalRequests: recentRequests.length,
        successRate: recentRequests.length > 0 ? 
          Math.round((recentRequests.filter(r => r.success).length / recentRequests.length) * 100) : 0
      }
    }
    return stats
  }
}

// Example usage
async function demonstrateLoadBalancer() {
  console.log('🌐 Universal LLM Load Balancer Demo\n')
  
  const loadBalancer = new UniversalLLMLoadBalancer()
  
  const testRequest = {
    model: "gpt-4",
    messages: [
      { role: "user", content: "What is artificial intelligence?" }
    ],
    temperature: 0.7,
    max_tokens: 200
  }
  
  console.log('📝 Test request:', JSON.stringify(testRequest, null, 2))
  
  // Test different strategies
  const strategies = ['fastest', 'cheapest', 'most_reliable', 'balanced'] as const
  
  for (const strategy of strategies) {
    try {
      console.log(`\n🎯 Testing strategy: ${strategy}`)
      const response = await loadBalancer.executeRequest(testRequest, strategy)
      console.log(`✅ Success with provider: ${response.metadata.provider}`)
      console.log(`   Response time: ${response.metadata.requestTime}ms`)
      console.log(`   Fallbacks used: ${response.metadata.fallbacksUsed}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.log(`❌ Failed: ${message}`)
    }
  }
  
  // Show final statistics
  setTimeout(() => {
    console.log('\n📊 Final Statistics:')
    console.log(JSON.stringify(loadBalancer.getStats(), null, 2))
  }, 2000)
}

// Run demonstration if executed directly
if (require.main === module) {
  demonstrateLoadBalancer().catch(console.error)
}

export { UniversalLLMLoadBalancer }