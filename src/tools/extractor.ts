import { ProviderType } from "../types/providers"

/**
 * Normalized tool call representation across all providers
 */
export interface NormalizedToolCall {
  id: string
  name: string
  input: any
}

/**
 * Result of tool call extraction from provider responses
 */
export interface ToolCallExtractionResult {
  allTools: NormalizedToolCall[]
  hasToolCalls: boolean
}

/**
 * Extract and normalize tool calls from raw LLM provider responses
 * Supports OpenAI, Anthropic (Claude), and Google (Gemini) formats
 * 
 * Note: This extracts from the raw provider response JSON, not from UniversalMessage.
 * For extracting from UniversalMessage, use the helpers/utils.ts extractToolCalls function.
 */
export function extractToolCallsFromResponse(
  responseJson: any,
  provider: ProviderType
): ToolCallExtractionResult {
  const tools: NormalizedToolCall[] = []

  // Provider-specific extraction logic
  if (provider === "anthropic" && responseJson?.content && Array.isArray(responseJson.content)) {
    tools.push(...extractAnthropicToolCalls(responseJson.content))
  } else if (provider === "openai" && responseJson?.choices?.[0]?.message?.tool_calls) {
    tools.push(...extractOpenAIToolCalls(responseJson.choices[0].message.tool_calls))
  } else if (provider === "google" && responseJson?.candidates?.[0]?.content?.parts) {
    tools.push(...extractGoogleToolCalls(responseJson.candidates[0].content.parts))
  }

  return {
    allTools: tools,
    hasToolCalls: tools.length > 0,
  }
}

/**
 * Extract tool calls from Anthropic/Claude response format
 */
function extractAnthropicToolCalls(content: any[]): NormalizedToolCall[] {
  return content
    .filter((item) => item.type === "tool_use")
    .map((item) => ({
      id: item.id,
      name: item.name,
      input: item.input,
    }))
}

/**
 * Extract tool calls from OpenAI response format
 */
function extractOpenAIToolCalls(toolCalls: any[]): NormalizedToolCall[] {
  return toolCalls.map((call) => ({
    id: call.id,
    name: call.function?.name || "",
    input: safeParseJSON(call.function?.arguments || "{}"),
  }))
}

/**
 * Extract tool calls from Google/Gemini response format
 */
function extractGoogleToolCalls(parts: any[]): NormalizedToolCall[] {
  return parts
    .filter((part) => part.functionCall)
    .map((part) => ({
      id: `gemini_tool_${Date.now()}_${Math.random()}`,
      name: part.functionCall.name,
      input: part.functionCall.args,
    }))
}

/**
 * Safely parse JSON string, returning empty object on failure
 */
function safeParseJSON(jsonString: string): any {
  try {
    return JSON.parse(jsonString)
  } catch {
    console.warn(`[Tool Call] Failed to parse JSON: ${jsonString}`)
    return {}
  }
}

/**
 * Check if a tool call is a specific tool by name
 */
export function findToolCall(
  tools: NormalizedToolCall[],
  toolName: string
): NormalizedToolCall | null {
  return tools.find((t) => t.name === toolName) || null
}

/**
 * Check if tools contain any non-prefixed tools (useful for filtering)
 */
export function hasNonPrefixedTools(
  tools: NormalizedToolCall[],
  prefix: string
): boolean {
  return tools.some((t) => !t.name?.startsWith(prefix))
}

