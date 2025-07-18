import Anthropic from "@anthropic-ai/sdk"
import {
  UniversalBody,
  UniversalContent,
  UniversalMessage,
  UniversalRole,
  UniversalTool,
} from "../../types/universal"
import { AnthropicBody } from "../../types/providers"
import { generateId } from "../../helpers/utils"

function parseAnthropicContent(
  content: Anthropic.MessageParam["content"],
): UniversalContent[] {
  if (typeof content === "string") {
    return [
      {
        _original: { provider: "anthropic", raw: content },
        text: content,
        type: "text",
      },
    ]
  }

  if (Array.isArray(content)) {
    return content.map((block) => {
      if (block.type === "text") {
        return {
          _original: { provider: "anthropic", raw: block },
          text: block.text,
          type: "text" as const,
        }
      }
      if (block.type === "image") {
        const imageBlock = block as Anthropic.ImageBlockParam
        return {
          _original: { provider: "anthropic", raw: block },
          media: {
            data: (imageBlock.source as any).data,
            mimeType: (imageBlock.source as any).media_type,
          },
          type: "image" as const,
        }
      }
      if (block.type === "tool_use") {
        const toolBlock = block as Anthropic.Messages.ToolUseBlockParam
        return {
          _original: { provider: "anthropic", raw: block },
          tool_call: {
            arguments: (toolBlock.input as Record<string, unknown>) || {},
            id: toolBlock.id,
            metadata: {
              input: toolBlock.input,
            },
            name: toolBlock.name,
          },
          type: "tool_call" as const,
        }
      }
      if (block.type === "tool_result") {
        return {
          _original: { provider: "anthropic", raw: block },
          tool_result: {
            metadata: {
              content: block.content,
              tool_use_id: block.tool_use_id,
            },
            name: "", // Anthropic doesn't include function name in tool_result
            result: block.content,
            tool_call_id: block.tool_use_id,
          },
          type: "tool_result" as const,
        }
      }

      // Fallback for unknown content types
      return {
        _original: { provider: "anthropic", raw: block },
        text: JSON.stringify(block),
        type: "text" as const,
      }
    })
  }

  return [
    {
      _original: { provider: "anthropic", raw: content },
      text: JSON.stringify(content),
      type: "text",
    },
  ]
}

export function anthropicToUniversal(
  body: AnthropicBody,
): UniversalBody<"anthropic"> {
  // Validate and handle malformed input
  if (!body.messages || !Array.isArray(body.messages)) {
    return {
      _original: { provider: "anthropic", raw: body },
      messages: [],
      model: String(body.model || "unknown"),
      provider: "anthropic",
      max_tokens: body.max_tokens || 1024,
    }
  }

  const universalMessages: UniversalMessage<"anthropic">[] = body.messages.map(
    (msg, index) => {
      // Check for cache control in message content
      let cacheControl: { type: "ephemeral" } | undefined = undefined
      if (Array.isArray(msg.content)) {
        const hasCache = msg.content.some(
          (block) =>
            typeof block === "object" &&
            block &&
            "cache_control" in block &&
            block.cache_control,
        )
        if (hasCache) {
          cacheControl = { type: "ephemeral" }
        }
      }

      return {
        content: parseAnthropicContent(msg.content),
        id: generateId(),
        metadata: {
          originalIndex: index,
          provider: "anthropic",
          cache_control: cacheControl,
        },
        role: msg.role satisfies UniversalRole,
      }
    },
  )

  const tools: UniversalTool[] =
    body.tools?.map((tool) => {
      if ("input_schema" in tool) {
        return {
          _original: { provider: "anthropic", raw: tool },
          description: tool.description || "",
          metadata: {
            input_schema: tool.input_schema,
          },
          name: tool.name,
          parameters: tool.input_schema,
        }
      }
      return {
        _original: { provider: "anthropic", raw: tool },
        description: "",
        metadata: {},
        name: (tool as any).name || "unknown",
        parameters: {},
      }
    }) || []

  // Handle system prompt with cache control
  let systemPrompt: string | any = undefined
  if (body.system) {
    if (typeof body.system === "string") {
      systemPrompt = body.system
    } else if (Array.isArray(body.system)) {
      // Complex system prompt with cache control
      const textParts = body.system.filter((part) => part.type === "text")
      if (textParts.length > 0) {
        const mainText = textParts.map((part) => part.text).join(" ")
        const hasCacheControl = textParts.some((part) => part.cache_control)

        if (hasCacheControl) {
          systemPrompt = {
            content: mainText,
            cache_control: { type: "ephemeral" },
            _original: { provider: "anthropic", raw: body.system },
          }
        } else {
          systemPrompt = mainText
        }
      }
    }
  }

  return {
    _original: { provider: "anthropic", raw: body },
    max_tokens: body.max_tokens,
    messages: universalMessages,
    model: String(body.model),
    provider: "anthropic",
    provider_params: {
      anthropic_version: (body as any).anthropic_version,
      stop_sequences: body.stop_sequences,
    },
    stream: body.stream,
    system: systemPrompt,
    temperature: body.temperature,
    tool_choice:
      typeof body.tool_choice === "string"
        ? (body.tool_choice as any)
        : undefined,
    tools: tools.length > 0 ? tools : undefined,
    top_p: body.top_p,
  }
}

function hasMessagesBeenModified(universal: UniversalBody<"anthropic">): boolean {
  if (!universal._original?.raw) return true

  const originalBody = universal._original.raw as AnthropicBody
  const originalMessages = originalBody.messages || []

  // Check if message count changed
  if (originalMessages.length !== universal.messages.length) return true

  // Check if any messages have contextInjection metadata (indicates injection)
  const hasInjectedMessages = universal.messages.some(m =>
    m.metadata.contextInjection ||
    !m.metadata.originalIndex // New messages without originalIndex
  )

  return hasInjectedMessages
}

export function universalToAnthropic(
  universal: UniversalBody<"anthropic">,
): AnthropicBody {
  // If we have the original and no modifications, we can reconstruct perfectly
  if (universal._original?.provider === "anthropic" && !hasMessagesBeenModified(universal)) {
    return universal._original.raw as AnthropicBody
  }

  // Convert universal messages back to Anthropic format
  const messages: Anthropic.MessageParam[] = universal.messages.map((msg) => {
    const anthropicMessage: Anthropic.MessageParam = {
      content: msg.content.map((content) => {
        if (content._original?.provider === "anthropic") {
          if (typeof content._original.raw !== "string") {
            return content._original.raw as Anthropic.ContentBlock
          }
        }

        if (typeof content === "string") {
          return {
            text: content,
            type: "text",
          }
        }
        if (content.type === "text") {
          return {
            text: content.text || "",
            type: "text",
          }
        }
        if (content.type === "image") {
          return {
            source: {
              data: content.media?.data || "",
              media_type: content.media?.mimeType as any,
              type: "base64",
            },
            type: "image",
          }
        }
        if (content.type === "tool_call") {
          return {
            id: content.tool_call?.id || "",
            input: content.tool_call?.arguments || {},
            name: content.tool_call?.name || "",
            type: "tool_use",
          }
        }
        if (content.type === "tool_result") {
          return {
            content:
              typeof content.tool_result?.result === "string"
                ? content.tool_result.result
                : JSON.stringify(content.tool_result?.result || {}),
            tool_use_id: content.tool_result?.tool_call_id || "",
            type: "tool_result",
          }
        }

        // Fallback
        return {
          text: JSON.stringify(content),
          type: "text",
        }
      }),
      role: msg.role as "user" | "assistant",
    }

    return anthropicMessage
  })

  const result: AnthropicBody = {
    max_tokens: universal.max_tokens!,
    messages,
    model: universal.model,
    stream: universal.stream,
    temperature: universal.temperature,
    top_p: universal.top_p,
  }

  // Add system if present
  if (universal.system) {
    result.system =
      typeof universal.system === "string"
        ? universal.system
        : universal.system.content
  }

  // Add tools if present
  if (universal.tools) {
    result.tools = universal.tools.map((tool) => {
      if (tool._original?.provider === "anthropic") {
        return tool._original.raw as Anthropic.Tool
      }

      return {
        description: tool.description,
        input_schema: {
          ...tool.parameters,
          type: "object",
        },
        name: tool.name,
      }
    })
  }

  // Add tool choice
  if (universal.tool_choice) {
    if (typeof universal.tool_choice === "string") {
      result.tool_choice = { type: universal.tool_choice as any }
    } else {
      result.tool_choice = universal.tool_choice as any
    }
  }

  // Add provider-specific params
  if (universal.provider_params?.stop_sequences) {
    result.stop_sequences = universal.provider_params.stop_sequences
  }

  return result
}
