import { fromUniversal } from "../models"
import { InputBody, ProviderType } from "../types/providers"
import { UniversalBody } from "../types/universal"

export function canPerfectlyReconstruct<T extends ProviderType>(
  universal: UniversalBody<T>,
  targetProvider: T,
): boolean {
  return universal._original?.provider === targetProvider
}

export function getReconstructionQuality<T extends ProviderType>(
  universal: UniversalBody<T>,
  targetProvider: T,
): number {
  if (universal._original?.provider === targetProvider) {
    return 100 // Perfect reconstruction available
  }

  let score = 80 // Base score for universal format

  // Check how much original data we have preserved
  let totalElements = 0
  let elementsWithOriginal = 0

  // Check messages
  for (const message of universal.messages) {
    totalElements++
    if (message.metadata.provider === targetProvider) {
      elementsWithOriginal++
    }

    // Check content blocks
    for (const content of message.content) {
      totalElements++
      if (content._original?.provider === targetProvider) {
        elementsWithOriginal++
      }
    }
  }

  // Check tools
  if (universal.tools) {
    for (const tool of universal.tools) {
      totalElements++
      if (tool._original?.provider === targetProvider) {
        elementsWithOriginal++
      }
    }
  }

  // Check system prompt
  if (universal.system && typeof universal.system === "object") {
    totalElements++
    if (universal.system._original?.provider === targetProvider) {
      elementsWithOriginal++
    }
  }

  // Calculate preservation ratio
  const preservationRatio =
    totalElements > 0 ? elementsWithOriginal / totalElements : 0

  // Adjust score based on preservation ratio
  score = Math.floor(score + preservationRatio * 20)

  return Math.min(score, 99) // Max 99 since it's not perfect reconstruction
}

/**
 * Create a summary of what original data is available
 */
export function getOriginalDataSummary<T extends ProviderType>(universal: UniversalBody<T>): {
  hasTopLevelOriginal: boolean
  originalProvider?: ProviderType
  messagePreservation: {
    total: number
    withOriginal: number
    percentage: number
  }
  contentPreservation: {
    total: number
    withOriginal: number
    percentage: number
  }
  toolPreservation: {
    total: number
    withOriginal: number
    percentage: number
  }
} {
  const hasTopLevelOriginal = !!universal._original
  const originalProvider = universal._original?.provider

  // Analyze messages
  const totalMessages = universal.messages.length
  let messagesWithOriginal = 0
  let totalContent = 0
  let contentWithOriginal = 0

  for (const message of universal.messages) {
    if (message.metadata.originalIndex !== undefined) {
      messagesWithOriginal++
    }

    for (const content of message.content) {
      totalContent++
      if (content._original) {
        contentWithOriginal++
      }
    }
  }

  // Analyze tools
  const totalTools = universal.tools?.length || 0
  let toolsWithOriginal = 0

  if (universal.tools) {
    for (const tool of universal.tools) {
      if (tool._original) {
        toolsWithOriginal++
      }
    }
  }

  return {
    contentPreservation: {
      percentage:
        totalContent > 0
          ? Math.round((contentWithOriginal / totalContent) * 100)
          : 0,
      total: totalContent,
      withOriginal: contentWithOriginal,
    },
    hasTopLevelOriginal,
    messagePreservation: {
      percentage:
        totalMessages > 0
          ? Math.round((messagesWithOriginal / totalMessages) * 100)
          : 0,
      total: totalMessages,
      withOriginal: messagesWithOriginal,
    },
    originalProvider,
    toolPreservation: {
      percentage:
        totalTools > 0 ? Math.round((toolsWithOriginal / totalTools) * 100) : 0,
      total: totalTools,
      withOriginal: toolsWithOriginal,
    },
  }
}

/**
 * Enhanced translation function that provides reconstruction info
 */
export function fromUniversalWithInfo<T extends ProviderType>(
  provider: T,
  universal: UniversalBody<T>,
): {
  result: InputBody<T> | import("../models/openai-responses-format").OpenAIResponsesBody
  reconstructionQuality: number
  usedOriginalData: boolean
  summary: ReturnType<typeof getOriginalDataSummary>
} {
  const quality = getReconstructionQuality(universal, provider)
  const usedOriginal = canPerfectlyReconstruct(universal, provider)
  const summary = getOriginalDataSummary(universal)
  const result = fromUniversal(provider, universal)

  return {
    reconstructionQuality: quality,
    result,
    summary,
    usedOriginalData: usedOriginal,
  }
}
