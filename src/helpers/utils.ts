import {
  UniversalBody,
  UniversalMessage,
  UniversalToolCall,
} from "../types/universal"

export function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`
}

export function getTextContent(message: UniversalMessage): string {
  return message.content
    .filter((content) => content.type === "text")
    .map((content) => content.text)
    .join(" ")
}

export function hasToolCalls(message: UniversalMessage): boolean {
  return (
    message.content.some((content) => content.type === "tool_call") ||
    (message.tool_calls && message.tool_calls.length > 0) ||
    false
  )
}

export function hasMultimodalContent(message: UniversalMessage): boolean {
  return message.content.some((content) =>
    ["image", "audio", "video", "document"].includes(content.type),
  )
}

export function extractToolCalls(
  message: UniversalMessage,
): UniversalToolCall[] {
  const toolCalls: UniversalToolCall[] = []

  // From content blocks
  for (const content of message.content) {
    if (content.type === "tool_call" && content.tool_call) {
      toolCalls.push(content.tool_call)
    }
  }

  // From tool_calls array (OpenAI style)
  if (message.tool_calls) {
    toolCalls.push(...message.tool_calls)
  }

  return toolCalls
}

export function addTextContent(
  message: UniversalMessage,
  text: string,
): UniversalMessage {
  return {
    ...message,
    content: [
      ...message.content,
      {
        text,
        type: "text",
      },
    ],
  }
}

export function replaceTextContent(
  message: UniversalMessage,
  newText: string,
): UniversalMessage {
  return {
    ...message,
    content: [
      {
        text: newText,
        type: "text",
      },
      // Keep non-text content
      ...message.content.filter((content) => content.type !== "text"),
    ],
  }
}

export function countTokens(universal: UniversalBody): {
  inputTokens: number
  estimatedOutputTokens: number
} {
  // Simple approximation - in production, use tiktoken or similar
  let inputTokens = 0

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
      // Add approximate tokens for multimodal content
      if (content.type === "image") inputTokens += 85 // GPT-4V approximation
      if (content.type === "audio") inputTokens += 100
      if (content.type === "video") inputTokens += 200
      if (content.type === "document") inputTokens += 500
    }
  }

  // Estimate output tokens based on max_tokens or default
  const estimatedOutputTokens = universal.max_tokens || 1000

  return { estimatedOutputTokens, inputTokens }
}

export function validateUniversalBody(universal: UniversalBody): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (!universal.model) {
    errors.push("Model is required")
  }

  if (!universal.messages || universal.messages.length === 0) {
    errors.push("At least one message is required")
  }

  if (universal.messages) {
    for (const [index, message] of universal.messages.entries()) {
      if (!message.role) {
        errors.push(`Message at index ${index} is missing role`)
      }

      if (!message.content || message.content.length === 0) {
        errors.push(`Message at index ${index} is missing content`)
      }

      // Validate content types
      for (const [contentIndex, content] of message.content.entries()) {
        if (!content.type) {
          errors.push(
            `Content at message ${index}, content ${contentIndex} is missing type`,
          )
        }

        if (content.type === "text" && !content.text) {
          errors.push(
            `Text content at message ${index}, content ${contentIndex} is missing text`,
          )
        }

        if (content.type === "tool_call" && !content.tool_call) {
          errors.push(
            `Tool call content at message ${index}, content ${contentIndex} is missing tool_call`,
          )
        }
      }
    }
  }

  return {
    errors,
    valid: errors.length === 0,
  }
}
