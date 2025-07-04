import { ObservabilityData } from "../types/observability"
import { ProviderType } from "../types/providers"
import { UniversalBody } from "../types/universal"

interface ModelDetails {
  max_input_tokens?: number
  input_cost_per_token?: number
  output_cost_per_token?: number
  supports_multimodal?: boolean
  supports_tools?: boolean
  context_window?: number

  [key: string]: unknown
}

interface ModelPrices {
  [modelName: string]: ModelDetails
}

// Simple in-memory cache for external model prices
let modelPricesCache: {
  data: ModelPrices | null
  timestamp: number
} = {
  data: null,
  timestamp: 0,
}

const CACHE_DURATION = 1000 * 60 * 60 * 24 // 24 hours
const MODEL_PRICES_URL =
  "https://raw.githubusercontent.com/AgentOps-AI/tokencost/main/tokencost/model_prices.json"

async function fetchExternalModelPrices(): Promise<ModelPrices | null> {
  // Check cache first
  if (
    modelPricesCache.data &&
    Date.now() - modelPricesCache.timestamp < CACHE_DURATION
  ) {
    return modelPricesCache.data
  }

  try {
    const response = await fetch(MODEL_PRICES_URL)
    if (!response.ok) {
      throw new Error(`Failed to fetch model prices: ${response.statusText}`)
    }

    const data = (await response.json()) as ModelPrices

    // Update cache
    modelPricesCache = {
      data,
      timestamp: Date.now(),
    }

    return data
  } catch (error) {
    console.warn(
      "Failed to fetch external model prices, using defaults:",
      error,
    )
    return null
  }
}

export async function getModelDetails(
  modelName: string,
): Promise<ModelDetails> {
  if (!modelName) {
    return {
      input_cost_per_token: 0,
      max_input_tokens: 0,
      output_cost_per_token: 0,
      supports_multimodal: false,
      supports_tools: false,
    }
  }

  // Try external prices first
  try {
    const externalPrices = await fetchExternalModelPrices()
    if (externalPrices?.[modelName]) {
      return externalPrices[modelName]
    }
  } catch (error) {
    console.warn("Error fetching external model prices:", error)
  }

  // Default to zero costs if we don't know the model
  return {
    input_cost_per_token: 0,
    max_input_tokens: 0,
    output_cost_per_token: 0,
    supports_multimodal: false,
    supports_tools: false,
  }
}

export async function getModelInputTokenLimit(
  modelName: string,
): Promise<number> {
  const details = await getModelDetails(modelName)
  return details.max_input_tokens || 0
}

export async function getModelCosts(modelName: string): Promise<{
  inputCost: number
  outputCost: number
}> {
  const details = await getModelDetails(modelName)
  return {
    inputCost: details.input_cost_per_token || 0,
    outputCost: details.output_cost_per_token || 0,
  }
}

// Enhanced token counting with multimodal support
export function countUniversalTokens(universal: UniversalBody): {
  inputTokens: number
  estimatedOutputTokens: number
  multimodalContentCount: number
  toolCallsCount: number
} {
  let inputTokens = 0
  let multimodalContentCount = 0
  let toolCallsCount = 0

  // Count system prompt tokens
  if (universal.system) {
    const systemText =
      typeof universal.system === "string"
        ? universal.system
        : universal.system.content
    inputTokens += Math.ceil(systemText.length / 4)
  }

  // Count message tokens
  for (const message of universal.messages) {
    for (const content of message.content) {
      if (content.type === "text" && content.text) {
        inputTokens += Math.ceil(content.text.length / 4)
      }

      // Count multimodal content
      if (["image", "audio", "video", "document"].includes(content.type)) {
        multimodalContentCount++

        // Add approximate tokens for multimodal content
        switch (content.type) {
          case "image":
            inputTokens += 85 // GPT-4V approximation
            break
          case "audio":
            inputTokens += 100
            break
          case "video":
            inputTokens += 200
            break
          case "document":
            inputTokens += 500
            break
        }
      }

      // Count tool calls
      if (content.type === "tool_call") {
        toolCallsCount++
        inputTokens += 50 // Approximate overhead for tool calls
      }
    }

    // Count tool calls from message-level tool_calls array
    if (message.tool_calls) {
      toolCallsCount += message.tool_calls.length
      inputTokens += message.tool_calls.length * 50
    }
  }

  // Add tool definition tokens
  if (universal.tools) {
    for (const tool of universal.tools) {
      const toolJson = JSON.stringify(tool)
      inputTokens += Math.ceil(toolJson.length / 4)
    }
  }

  // Estimate output tokens based on max_tokens or default
  const estimatedOutputTokens = universal.max_tokens || 1000

  return {
    estimatedOutputTokens,
    inputTokens,
    multimodalContentCount,
    toolCallsCount,
  }
}

export function extractModelFromUniversal(universal: UniversalBody): string {
  return universal.model || "unknown_model"
}

export async function createObservabilityData(
  originalTokens: number,
  finalTokens: number,
  provider: ProviderType,
  modelName: string,
  contextModified: boolean,
  options: {
    multimodalContentCount?: number
    toolCallsCount?: number
    requestId?: string
    estimatedOutputTokens?: number
  } = {},
): Promise<ObservabilityData> {
  const tokensSaved = Math.max(0, originalTokens - finalTokens)
  let costSavedUSD = 0
  let estimatedInputCost = 0
  let estimatedOutputCost = 0

  if (modelName && modelName !== "unknown_model") {
    try {
      const costs = await getModelCosts(modelName)

      // Calculate estimated costs (will be 0 if we don't know the model)
      estimatedInputCost = finalTokens * costs.inputCost

      if (options.estimatedOutputTokens) {
        estimatedOutputCost = options.estimatedOutputTokens * costs.outputCost
      }

      // Calculate cost savings (will be 0 if we don't know the costs)
      if (contextModified && tokensSaved > 0) {
        costSavedUSD = tokensSaved * costs.inputCost
      }
    } catch (err) {
      console.error(`Error fetching costs for model ${modelName}:`, err)
    }
  }

  return {
    contextModified,
    costSavedUSD: Math.round(costSavedUSD * 10000) / 10000,
    estimatedInputCost: Math.round(estimatedInputCost * 10000) / 10000,
    estimatedOutputCost: Math.round(estimatedOutputCost * 10000) / 10000,
    finalTokenCount: finalTokens,
    model: modelName,
    multimodalContentCount: options.multimodalContentCount || 0,
    originalTokenCount: originalTokens,
    provider,
    requestId: options.requestId,
    timestamp: Date.now(),
    tokensSaved,
    toolCallsCount: options.toolCallsCount || 0,
  }
}
