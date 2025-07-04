import { ProviderType } from "./providers"

export interface ObservabilityData {
  originalTokenCount: number
  finalTokenCount: number
  tokensSaved: number
  costSavedUSD: number
  provider: ProviderType
  model: string
  contextModified: boolean
  timestamp: number
  requestId?: string
  // Enhanced metrics
  multimodalContentCount: number
  toolCallsCount: number
  estimatedInputCost: number
  estimatedOutputCost: number
}
