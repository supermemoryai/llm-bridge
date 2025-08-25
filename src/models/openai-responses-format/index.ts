import { generateId } from "../../helpers/utils"
import {
  UniversalBody,
  UniversalContent,
  UniversalMessage,
} from "../../types/universal"

// OpenAI Responses API types (minimal, just what we need)
export interface OpenAIResponsesBody {
  model: string
  instructions?: string
  input: string | Array<{
    role: "user" | "assistant" | "system"
    content: string | Array<{
      type: "text" | "image_url"
      text?: string
      image_url?: { url: string; detail?: "low" | "high" | "auto" }
    }>
  }>
  
  // State management
  previous_response_id?: string
  store?: boolean
  include?: string[]
  
  // Tools
  tools?: Array<{
    type: "web_search_preview" | "file_search" | "code_interpreter" | "computer_use" | "remote_mcp" | "function"
    function?: {
      name: string
      description?: string
      parameters?: Record<string, unknown>
    }
  }>
  tool_choice?: "auto" | "required" | "none" | { type: "function"; function: { name: string } }
  
  // Generation parameters
  temperature?: number
  max_tokens?: number
  top_p?: number
  frequency_penalty?: number
  presence_penalty?: number
  seed?: number
  stream?: boolean
  
  // Structured outputs (Responses uses text.format)
  text?: {
    format?: "json_object" | "json_schema"
    json_schema?: Record<string, unknown>
  }
  
  // Other Responses-specific fields
  modalities?: string[]
  attachments?: Array<Record<string, unknown>>
  metadata?: Record<string, unknown>
}

function parseResponsesInput(
  input: OpenAIResponsesBody["input"]
): UniversalMessage<"openai">[] {
  // If input is a string, create a single user message
  if (typeof input === "string") {
    return [
      {
        id: generateId(),
        role: "user",
        content: [
          {
            type: "text",
            text: input,
            _original: { provider: "openai", raw: input },
          },
        ],
        metadata: {
          provider: "openai",
          originalIndex: 0,
        },
      },
    ]
  }
  
  // If input is an array of messages, convert each
  if (Array.isArray(input)) {
    return input.map((msg, index) => {
      const content: UniversalContent[] = []
      
      if (typeof msg.content === "string") {
        content.push({
          type: "text",
          text: msg.content,
          _original: { provider: "openai", raw: msg.content },
        })
      } else if (Array.isArray(msg.content)) {
        msg.content.forEach((part) => {
          if (part.type === "text") {
            content.push({
              type: "text",
              text: part.text || "",
              _original: { provider: "openai", raw: part },
            })
          } else if (part.type === "image_url") {
            content.push({
              type: "image",
              media: {
                url: part.image_url?.url,
                detail: part.image_url?.detail,
              },
              _original: { provider: "openai", raw: part },
            })
          }
        })
      }
      
      return {
        id: generateId(),
        role: msg.role,
        content,
        metadata: {
          provider: "openai",
          originalIndex: index,
        },
      }
    })
  }
  
  // Fallback - should not happen with valid input
  return []
}

export function openaiResponsesToUniversal(
  body: OpenAIResponsesBody
): UniversalBody<"openai"> {
  // Parse messages from input
  const messages = parseResponsesInput(body.input)
  
  // Build universal body
  const universal: UniversalBody<"openai"> = {
    provider: "openai",
    model: body.model,
    messages,
    
    // Map instructions to system
    system: body.instructions,
    
    // Generation parameters
    temperature: body.temperature,
    max_tokens: body.max_tokens,
    top_p: body.top_p,
    frequency_penalty: body.frequency_penalty,
    presence_penalty: body.presence_penalty,
    seed: body.seed,
    stream: body.stream,
    
    // Preserve all Responses-specific fields in provider_params
    provider_params: {
      // State management
      previous_response_id: body.previous_response_id,
      store: body.store,
      include: body.include,
      
      // Structured outputs (Responses format)
      text: body.text,
      
      // Other Responses-specific
      modalities: body.modalities,
      attachments: body.attachments,
      metadata: body.metadata,
      
      // Tools (preserve raw for now)
      responses_tools: body.tools,
      responses_tool_choice: body.tool_choice,
    },
    
    // Preserve original for perfect reconstruction
    _original: {
      provider: "openai",
      raw: body,
    },
  }
  
  // Handle tools if present (but keep them raw in provider_params)
  // We're not normalizing built-in tools yet
  if (body.tools && body.tools.length > 0) {
    // Only extract function tools to universal format
    const functionTools = body.tools.filter((t): t is {
      type: "function"
      function: { name: string; description?: string; parameters?: Record<string, unknown> }
    } => t.type === "function" && !!t.function && typeof t.function.name === "string")
    if (functionTools.length > 0) {
      universal.tools = functionTools.map(tool => ({
        name: tool.function.name,
        description: tool.function.description || "",
        parameters: tool.function.parameters || {},
        metadata: {
          type: "function",
        },
        _original: {
          provider: "openai",
          raw: tool,
        },
      }))
    }
  }
  
  return universal
}

function hasMessagesBeenModified(universal: UniversalBody<"openai">): boolean {
  if (!universal._original?.raw) return true
  
  const originalBody = universal._original.raw as OpenAIResponsesBody
  
  // For Responses API, check if input structure changed
  if (typeof originalBody.input === "string") {
    // Original was a simple string, check if we still have just one user message
    if (universal.messages.length !== 1 || 
        universal.messages[0].role !== "user" ||
        universal.messages[0].content.length !== 1 ||
        universal.messages[0].content[0].type !== "text") {
      return true
    }
  } else if (Array.isArray(originalBody.input)) {
    // Original was a message array, check count
    if (originalBody.input.length !== universal.messages.length) {
      return true
    }
  }
  
  // Check for injected messages
  const hasInjectedMessages = universal.messages.some(m => 
    m.metadata.contextInjection || 
    !("originalIndex" in m.metadata)
  )
  
  return hasInjectedMessages
}

export function universalToOpenAIResponses(
  universal: UniversalBody<"openai">
): OpenAIResponsesBody {
  // Perfect reconstruction if we have the original and no modifications
  if (universal._original?.provider === "openai" && 
      !hasMessagesBeenModified(universal)) {
    const original = universal._original.raw as OpenAIResponsesBody
    // But check if system/instructions changed
    if (original.instructions === universal.system) {
      return original
    }
  }
  
  // Build input from messages
  let input: OpenAIResponsesBody["input"]
  
  // If we have a single user message with single text content, use string format
  if (universal.messages.length === 1 && 
      universal.messages[0].role === "user" &&
      universal.messages[0].content.length === 1 &&
      universal.messages[0].content[0].type === "text") {
    input = universal.messages[0].content[0].text || ""
  } else {
    // Otherwise, use message array format
    input = universal.messages.map(msg => {
      // Try to use original content if available
      if (msg.content.length === 1 && 
          msg.content[0]._original?.provider === "openai") {
        const originalContent = msg.content[0]._original.raw
        return {
          role: msg.role as "user" | "assistant" | "system",
          content: originalContent as Exclude<OpenAIResponsesBody["input"], string>[number]["content"],
        }
      }
      
      // Build content array
      const content = msg.content.map(c => {
        if (c._original?.provider === "openai") {
          return c._original.raw as Exclude<OpenAIResponsesBody["input"], string>[number]["content"] extends Array<infer P> ? P : never
        }
        
        if (c.type === "text") {
          return {
            type: "text" as const,
            text: c.text || "",
          }
        }
        
        if (c.type === "image") {
          return {
            type: "image_url" as const,
            image_url: {
              url: c.media?.url ?? "",
              detail: c.media?.detail,
            },
          }
        }
        
        // Fallback
        return {
          type: "text" as const,
          text: JSON.stringify(c),
        }
      })
      
      return {
        role: msg.role as "user" | "assistant" | "system",
        content: content.length === 1 && content[0].type === "text" 
          ? content[0].text 
          : content,
      }
    })
  }
  
  // Build the Responses body
  const result: OpenAIResponsesBody = {
    model: universal.model,
    input,
  }
  
  // Add instructions from system
  if (universal.system) {
    result.instructions = typeof universal.system === "string" 
      ? universal.system 
      : universal.system.content
  }
  
  // Add generation parameters
  if (universal.temperature !== undefined) result.temperature = universal.temperature
  if (universal.max_tokens !== undefined) result.max_tokens = universal.max_tokens
  if (universal.top_p !== undefined) result.top_p = universal.top_p
  if (universal.frequency_penalty !== undefined) result.frequency_penalty = universal.frequency_penalty
  if (universal.presence_penalty !== undefined) result.presence_penalty = universal.presence_penalty
  if (universal.seed !== undefined) result.seed = universal.seed
  if (universal.stream !== undefined) result.stream = universal.stream
  
  // Restore Responses-specific fields from provider_params
  if (universal.provider_params) {
    const params = universal.provider_params
    
    // State management
    if (params.previous_response_id !== undefined) {
      result.previous_response_id = params.previous_response_id as string
    }
    if (params.store !== undefined) {
      result.store = params.store as boolean
    }
    if (params.include !== undefined) {
      result.include = params.include as string[]
    }
    
    // Structured outputs
    if (params.text !== undefined) {
      result.text = params.text as OpenAIResponsesBody["text"]
    }
    
    // Other Responses-specific
    if (params.modalities !== undefined) {
      result.modalities = params.modalities as string[]
    }
    if (params.attachments !== undefined) {
      result.attachments = params.attachments as Array<Record<string, unknown>>
    }
    if (params.metadata !== undefined) {
      result.metadata = params.metadata as Record<string, unknown>
    }
    
    // Tools (use raw if preserved)
    if (params.responses_tools !== undefined) {
      result.tools = params.responses_tools as NonNullable<OpenAIResponsesBody["tools"]>
    } else if (universal.tools && universal.tools.length > 0) {
      // Fallback: convert from universal tools (function tools only)
      result.tools = universal.tools.map(tool => {
        if (tool._original?.provider === "openai") {
          return tool._original.raw as NonNullable<OpenAIResponsesBody["tools"]>[number]
        }
        return {
          type: "function" as const,
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        }
      })
    }
    
    if (params.responses_tool_choice !== undefined) {
      result.tool_choice = params.responses_tool_choice as OpenAIResponsesBody["tool_choice"]
    } else if (universal.tool_choice !== undefined) {
      // Map universal tool_choice to Responses format
      if (typeof universal.tool_choice === "string") {
        result.tool_choice = universal.tool_choice as OpenAIResponsesBody["tool_choice"]
      } else if (universal.tool_choice && "name" in universal.tool_choice) {
        result.tool_choice = {
          type: "function",
          function: { name: universal.tool_choice.name },
        }
      }
    }
  }
  
  return result
}
