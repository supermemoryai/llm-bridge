/**
 * Cost Optimization Example
 *
 * Demonstrates how to automatically optimize costs by selecting the most
 * cost-effective provider and model for each request using LLM Bridge.
 */

import {
  toUniversal,
  fromUniversal,
  countUniversalTokens,
  getModelCosts,
} from "../src"
import type { ProviderType } from "../src"

interface ModelOption {
  provider: ProviderType
  model: string
  capability: "basic" | "advanced" | "vision" | "reasoning"
  costMultiplier: number
  speedScore: number
  qualityScore: number
}

interface OptimizationConfig {
  prioritize: "cost" | "speed" | "quality" | "balanced"
  maxCostPerRequest?: number
  requireCapability?: string[]
  excludeProviders?: string[]
  minQualityScore?: number
}

class LLMCostOptimizer {
  private modelOptions: ModelOption[] = [
    { provider: "openai", model: "gpt-4o-mini", capability: "basic", costMultiplier: 0.1, speedScore: 9, qualityScore: 7 },
    { provider: "openai", model: "gpt-4o", capability: "advanced", costMultiplier: 1.0, speedScore: 7, qualityScore: 9 },
    { provider: "openai", model: "o1-preview", capability: "reasoning", costMultiplier: 3.0, speedScore: 3, qualityScore: 10 },
    { provider: "anthropic", model: "claude-haiku-4-5-20251001", capability: "basic", costMultiplier: 0.08, speedScore: 10, qualityScore: 6 },
    { provider: "anthropic", model: "claude-sonnet-4-20250514", capability: "advanced", costMultiplier: 0.5, speedScore: 8, qualityScore: 8 },
    { provider: "anthropic", model: "claude-opus-4-20250514", capability: "advanced", costMultiplier: 2.0, speedScore: 5, qualityScore: 10 },
    { provider: "google", model: "gemini-2.0-flash", capability: "basic", costMultiplier: 0.05, speedScore: 10, qualityScore: 6 },
    { provider: "google", model: "gemini-2.5-pro", capability: "advanced", costMultiplier: 0.3, speedScore: 8, qualityScore: 8 },
  ]

  async optimizeModelSelection(
    request: any,
    sourceProvider: ProviderType,
    config: OptimizationConfig = { prioritize: "balanced" },
  ) {
    console.log(`Optimizing model selection (priority: ${config.prioritize})`)

    const universal = toUniversal(sourceProvider, request)
    const tokens = countUniversalTokens(universal)

    console.log(`Token analysis: ${tokens.inputTokens} input, ${tokens.estimatedOutputTokens} estimated output`)

    let candidateModels = this.modelOptions.filter((model) => {
      if (config.excludeProviders?.includes(model.provider)) return false
      if (config.requireCapability?.length) return config.requireCapability.includes(model.capability)
      if (config.minQualityScore && model.qualityScore < config.minQualityScore) return false
      return true
    })

    console.log(`Found ${candidateModels.length} candidate models`)

    const scoredModels = (
      await Promise.all(
        candidateModels.map(async (model) => {
          const baseCosts = await getModelCosts(model.model)
          const inputCost = (tokens.inputTokens / 1000) * baseCosts.inputCost * model.costMultiplier
          const outputCost = ((tokens.estimatedOutputTokens ?? 0) / 1000) * baseCosts.outputCost * model.costMultiplier
          const totalCost = inputCost + outputCost

          if (config.maxCostPerRequest && totalCost > config.maxCostPerRequest) return null

          let score = 0
          switch (config.prioritize) {
            case "cost":
              score = 1 / (totalCost + 0.001)
              break
            case "speed":
              score = model.speedScore
              break
            case "quality":
              score = model.qualityScore
              break
            case "balanced":
            default: {
              const costScore = Math.min((1 / (totalCost + 0.001)) * 0.01, 10)
              score = costScore * 0.4 + model.qualityScore * 0.3 + model.speedScore * 0.3
              break
            }
          }

          return { model, cost: totalCost, score }
        }),
      )
    ).filter(Boolean) as Array<{ model: ModelOption; cost: number; score: number }>

    if (scoredModels.length === 0) {
      throw new Error("No models meet the specified requirements")
    }

    scoredModels.sort((a, b) => b.score - a.score)

    const selected = scoredModels[0]
    console.log(`Selected: ${selected.model.provider} ${selected.model.model}`)
    console.log(`Estimated cost: $${selected.cost.toFixed(4)}`)

    return {
      selectedModel: selected.model,
      estimatedCost: selected.cost,
      alternatives: scoredModels.slice(1, 4),
    }
  }

  async executeOptimizedRequest(
    request: any,
    sourceProvider: ProviderType,
    config: OptimizationConfig = { prioritize: "balanced" },
  ) {
    const optimization = await this.optimizeModelSelection(request, sourceProvider, config)
    const { selectedModel } = optimization

    // Translate request to selected provider
    const universal = toUniversal(sourceProvider, request)
    const optimizedUniversal = { ...universal, model: selectedModel.model, provider: selectedModel.provider }
    const optimizedRequest = fromUniversal(selectedModel.provider, optimizedUniversal as any)

    console.log(`Executing optimized request with ${selectedModel.provider}`)

    // Mock API call (replace with actual provider SDK)
    const response = await this.mockApiCall(selectedModel.provider, optimizedRequest)

    return {
      response,
      metadata: {
        originalProvider: sourceProvider,
        selectedProvider: selectedModel.provider,
        selectedModel: selectedModel.model,
        estimatedCost: optimization.estimatedCost,
      },
    }
  }

  async getCostComparison(request: any, sourceProvider: ProviderType) {
    const universal = toUniversal(sourceProvider, request)
    const tokens = countUniversalTokens(universal)

    const results = await Promise.all(
      this.modelOptions.map(async (modelOption) => {
        const baseCosts = await getModelCosts(modelOption.model)
        const inputCost = (tokens.inputTokens / 1000) * baseCosts.inputCost * modelOption.costMultiplier
        const outputCost = ((tokens.estimatedOutputTokens ?? 0) / 1000) * baseCosts.outputCost * modelOption.costMultiplier

        return {
          provider: modelOption.provider,
          model: modelOption.model,
          cost: inputCost + outputCost,
          capability: modelOption.capability,
          qualityScore: modelOption.qualityScore,
          speedScore: modelOption.speedScore,
        }
      }),
    )

    return results.sort((a, b) => a.cost - b.cost)
  }

  private async mockApiCall(_provider: string, _request: any) {
    await new Promise((resolve) => setTimeout(resolve, 200))
    return { response: `Optimized response from ${_provider}`, usage: { prompt_tokens: 100, completion_tokens: 50 } }
  }
}

async function main() {
  console.log("LLM Cost Optimization Demo\n")

  const optimizer = new LLMCostOptimizer()

  const basicRequest = {
    model: "gpt-4",
    messages: [{ role: "user", content: "Summarize the benefits of renewable energy in 100 words." }],
    temperature: 0.7,
    max_tokens: 150,
  }

  // Cost optimization
  console.log("--- Cost Optimization ---")
  await optimizer.optimizeModelSelection(basicRequest, "openai", { prioritize: "cost" })

  // Quality optimization
  console.log("\n--- Quality Optimization ---")
  await optimizer.optimizeModelSelection(basicRequest, "openai", { prioritize: "quality", minQualityScore: 8 })

  // Speed optimization
  console.log("\n--- Speed Optimization ---")
  await optimizer.optimizeModelSelection(basicRequest, "openai", { prioritize: "speed" })

  // Cost comparison
  console.log("\n--- Cost Comparison ---")
  const comparison = await optimizer.getCostComparison(basicRequest, "openai")
  comparison.slice(0, 5).forEach((option, i) => {
    console.log(`${i + 1}. ${option.provider} ${option.model}: $${option.cost.toFixed(4)} (Q:${option.qualityScore}/10, S:${option.speedScore}/10)`)
  })

  // Execute optimized request
  console.log("\n--- Execute Optimized ---")
  const result = await optimizer.executeOptimizedRequest(basicRequest, "openai", {
    prioritize: "balanced",
    maxCostPerRequest: 0.05,
  })
  console.log(`Provider: ${result.metadata.selectedProvider}, Model: ${result.metadata.selectedModel}`)

  console.log("\nDone!")
}

if (import.meta.main) {
  main().catch(console.error)
}

export { LLMCostOptimizer }
