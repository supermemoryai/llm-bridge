/**
 * Multi-Provider Load Balancer Example
 *
 * Demonstrates intelligent load balancing across multiple LLM providers
 * with automatic fallbacks, health checking, and strategy-based routing.
 */

import { toUniversal, fromUniversal, countUniversalTokens } from "../src"
import type { ProviderType } from "../src"

interface ProviderConfig {
  name: ProviderType
  model: string
  isHealthy: boolean
  latency: number
  errorRate: number
  costMultiplier: number
  maxConcurrency: number
  currentRequests: number
}

class UniversalLLMLoadBalancer {
  private providers: Map<string, ProviderConfig> = new Map()
  private requestHistory: Array<{ provider: string; timestamp: number; success: boolean; latency: number }> = []

  constructor() {
    this.providers.set("openai", {
      name: "openai", model: "gpt-4o", isHealthy: true,
      latency: 800, errorRate: 2, costMultiplier: 1.0, maxConcurrency: 10, currentRequests: 0,
    })
    this.providers.set("anthropic", {
      name: "anthropic", model: "claude-sonnet-4-20250514", isHealthy: true,
      latency: 1200, errorRate: 1, costMultiplier: 1.2, maxConcurrency: 8, currentRequests: 0,
    })
    this.providers.set("google", {
      name: "google", model: "gemini-2.5-pro", isHealthy: true,
      latency: 600, errorRate: 3, costMultiplier: 0.8, maxConcurrency: 12, currentRequests: 0,
    })
  }

  selectProvider(
    sourceProvider: ProviderType,
    request: any,
    strategy: "fastest" | "cheapest" | "most_reliable" | "balanced" = "balanced",
  ): ProviderConfig {
    const available = Array.from(this.providers.values()).filter(
      (p) => p.isHealthy && p.currentRequests < p.maxConcurrency,
    )

    if (available.length === 0) throw new Error("No available providers")

    const universal = toUniversal(sourceProvider, request)
    const tokens = countUniversalTokens(universal)

    let selected: ProviderConfig
    switch (strategy) {
      case "fastest":
        selected = available.reduce((a, b) => (a.latency < b.latency ? a : b))
        break
      case "cheapest":
        selected = available.reduce((a, b) => (a.costMultiplier < b.costMultiplier ? a : b))
        break
      case "most_reliable":
        selected = available.reduce((a, b) => (a.errorRate < b.errorRate ? a : b))
        break
      case "balanced":
      default:
        selected = available.reduce((a, b) =>
          this.balancedScore(a, tokens) > this.balancedScore(b, tokens) ? a : b,
        )
        break
    }

    console.log(`Selected: ${selected.name} (${strategy}) | ${selected.latency}ms | ${selected.errorRate}% err | ${selected.currentRequests}/${selected.maxConcurrency} load`)
    return selected
  }

  private balancedScore(provider: ProviderConfig, _tokens: any): number {
    const latencyScore = 1000 / (provider.latency + 100)
    const reliabilityScore = (100 - provider.errorRate) / 100
    const costScore = 1 / (provider.costMultiplier + 0.1)
    const loadScore = (provider.maxConcurrency - provider.currentRequests) / provider.maxConcurrency
    return latencyScore * 0.3 + reliabilityScore * 0.3 + costScore * 0.2 + loadScore * 0.2
  }

  async executeRequest(
    sourceProvider: ProviderType,
    request: any,
    strategy: "fastest" | "cheapest" | "most_reliable" | "balanced" = "balanced",
  ) {
    const startTime = Date.now()
    const providerOrder = this.getProviderFallbackOrder(sourceProvider, request, strategy)

    for (const providerName of providerOrder) {
      const provider = this.providers.get(providerName)!
      if (!provider.isHealthy || provider.currentRequests >= provider.maxConcurrency) continue

      try {
        console.log(`Attempting ${providerName}...`)
        provider.currentRequests++

        // Translate to target provider format
        const universal = toUniversal(sourceProvider, request)
        const targetRequest = fromUniversal(provider.name, { ...universal, provider: provider.name } as any)

        const response = await this.mockProviderCall(providerName, targetRequest)
        const requestTime = Date.now() - startTime
        this.recordRequest(providerName, true, requestTime)

        console.log(`Success with ${providerName} in ${requestTime}ms`)
        return { ...response, metadata: { provider: providerName, requestTime } }
      } catch (error: any) {
        console.log(`Failed with ${providerName}: ${error.message}`)
        this.recordRequest(providerName, false, Date.now() - startTime)
        this.updateProviderHealth(providerName)
      } finally {
        provider.currentRequests--
      }
    }

    throw new Error("All providers failed")
  }

  private getProviderFallbackOrder(sourceProvider: ProviderType, request: any, strategy: string): string[] {
    return Array.from(this.providers.values())
      .filter((p) => p.isHealthy)
      .sort((a, b) => {
        switch (strategy) {
          case "fastest": return a.latency - b.latency
          case "cheapest": return a.costMultiplier - b.costMultiplier
          case "most_reliable": return a.errorRate - b.errorRate
          default: {
            const universal = toUniversal(sourceProvider, request)
            const tokens = countUniversalTokens(universal)
            return this.balancedScore(b, tokens) - this.balancedScore(a, tokens)
          }
        }
      })
      .map((p) => p.name)
  }

  private async mockProviderCall(provider: string, _request: any) {
    const baseLatency = this.providers.get(provider)!.latency
    await new Promise((resolve) => setTimeout(resolve, baseLatency + Math.random() * 200 - 100))

    if (Math.random() * 100 < this.providers.get(provider)!.errorRate) {
      throw new Error(`Simulated ${provider} API error`)
    }

    return { choices: [{ message: { content: `Response from ${provider}` } }] }
  }

  private recordRequest(provider: string, success: boolean, latency: number) {
    this.requestHistory.push({ provider, timestamp: Date.now(), success, latency })
    if (this.requestHistory.length > 100) this.requestHistory.shift()
  }

  private updateProviderHealth(providerName: string) {
    const recent = this.requestHistory.filter(
      (r) => r.provider === providerName && Date.now() - r.timestamp < 60000,
    )
    if (recent.length >= 3) {
      const failureRate = recent.filter((r) => !r.success).length / recent.length
      if (failureRate > 0.5) {
        this.providers.get(providerName)!.isHealthy = false
        console.log(`Marking ${providerName} as unhealthy (${Math.round(failureRate * 100)}% failures)`)
        setTimeout(() => {
          this.providers.get(providerName)!.isHealthy = true
          console.log(`Restored ${providerName} to healthy`)
        }, 30000)
      }
    }
  }

  getStats() {
    const stats: Record<string, any> = {}
    for (const [name, provider] of this.providers) {
      const recent = this.requestHistory.filter((r) => r.provider === name)
      stats[name] = {
        isHealthy: provider.isHealthy,
        latency: provider.latency,
        errorRate: provider.errorRate,
        load: `${provider.currentRequests}/${provider.maxConcurrency}`,
        totalRequests: recent.length,
        successRate: recent.length > 0 ? Math.round((recent.filter((r) => r.success).length / recent.length) * 100) : 0,
      }
    }
    return stats
  }
}

async function main() {
  console.log("Universal LLM Load Balancer Demo\n")

  const lb = new UniversalLLMLoadBalancer()

  const testRequest = {
    model: "gpt-4",
    messages: [{ role: "user", content: "What is artificial intelligence?" }],
    temperature: 0.7,
    max_tokens: 200,
  }

  const strategies = ["fastest", "cheapest", "most_reliable", "balanced"] as const

  for (const strategy of strategies) {
    try {
      console.log(`\n--- Strategy: ${strategy} ---`)
      const response = await lb.executeRequest("openai", testRequest, strategy)
      console.log(`Provider: ${response.metadata.provider}, Time: ${response.metadata.requestTime}ms`)
    } catch (error: any) {
      console.log(`Failed: ${error.message}`)
    }
  }

  console.log("\nStats:", JSON.stringify(lb.getStats(), null, 2))
}

if (import.meta.main) {
  main().catch(console.error)
}

export { UniversalLLMLoadBalancer }
