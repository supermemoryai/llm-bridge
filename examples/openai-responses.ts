/**
 * Example: Using OpenAI Responses API with llm-bridge
 * 
 * This example demonstrates:
 * 1. Simple text generation with Responses API
 * 2. Stateful conversations using previous_response_id
 * 3. Using built-in tools (web_search_preview)
 * 4. Translation between providers
 */

import { handleUniversalRequest } from "../src/handler"
import { 
  fromUniversal, 
  toUniversal,
  translateBetweenProviders,
  OpenAIResponsesBody 
} from "../src/models"
import { UniversalBody } from "../src/types/universal"

// Mock OpenAI API key (replace with your actual key)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "sk-..."

async function example1_SimpleResponse() {
  console.log("\n=== Example 1: Simple Responses API Call ===\n")
  
  const requestBody: OpenAIResponsesBody = {
    model: "gpt-5",
    instructions: "You are a helpful assistant.",
    input: "Write a one-sentence bedtime story about a unicorn."
  }
  
  // Use the bridge to handle the request
  const result = await handleUniversalRequest(
    "https://api.openai.com/v1/responses",
    requestBody,
    {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    "POST",
    async (universal) => {
      // You can edit the request here if needed
      console.log("Universal format:", JSON.stringify(universal, null, 2))
      return { request: universal, contextModified: false }
    }
  )
  
  console.log("Response status:", result.response.status)
  const responseBody = await result.response.json()
  console.log("Response:", JSON.stringify(responseBody, null, 2))
}

async function example2_StatefulConversation() {
  console.log("\n=== Example 2: Stateful Conversation ===\n")
  
  // First request
  const request1: OpenAIResponsesBody = {
    model: "gpt-5",
    input: "What is the capital of France?",
    store: true // Enable storage for stateful conversation
  }
  
  const result1 = await handleUniversalRequest(
    "https://api.openai.com/v1/responses",
    request1,
    {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    "POST",
    async (universal) => ({ request: universal, contextModified: false })
  )
  
  const response1 = await result1.response.json()
  const responseId = response1.id
  console.log("First response ID:", responseId)
  
  // Second request, continuing the conversation
  const request2: OpenAIResponsesBody = {
    model: "gpt-5",
    input: "And its population?",
    previous_response_id: responseId, // Reference previous response
    store: true
  }
  
  const result2 = await handleUniversalRequest(
    "https://api.openai.com/v1/responses",
    request2,
    {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    "POST",
    async (universal) => {
      // The previous_response_id is preserved in provider_params
      console.log("Previous response ID in universal:", 
        universal.provider_params?.previous_response_id)
      return { request: universal, contextModified: false }
    }
  )
  
  const response2 = await result2.response.json()
  console.log("Follow-up response:", JSON.stringify(response2, null, 2))
}

async function example3_BuiltInTools() {
  console.log("\n=== Example 3: Using Built-in Tools ===\n")
  
  const request: OpenAIResponsesBody = {
    model: "gpt-5",
    input: "Who is the current president of France?",
    tools: [
      { type: "web_search_preview" } // Use built-in web search
    ]
  }
  
  const result = await handleUniversalRequest(
    "https://api.openai.com/v1/responses",
    request,
    {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    "POST",
    async (universal) => {
      // Built-in tools are preserved in provider_params
      console.log("Tools in universal:", 
        universal.provider_params?.responses_tools)
      return { request: universal, contextModified: false }
    }
  )
  
  const response = await result.response.json()
  console.log("Response with web search:", JSON.stringify(response, null, 2))
}

async function example4_TranslateToUniversal() {
  console.log("\n=== Example 4: Translate to Universal Format ===\n")
  
  // Responses API format
  const responsesBody: OpenAIResponsesBody = {
    model: "gpt-5",
    instructions: "You are a helpful assistant.",
    input: [
      { role: "user", content: "Hello!" },
      { role: "assistant", content: "Hi there! How can I help you?" },
      { role: "user", content: "Tell me a joke" }
    ],
    temperature: 0.7,
    max_tokens: 150
  }
  
  // Convert to universal format
  const universal = toUniversal("openai", responsesBody, "https://api.openai.com/v1/responses")
  
  console.log("Universal format:")
  console.log("- System:", universal.system)
  console.log("- Messages:", universal.messages.length, "messages")
  universal.messages.forEach((msg, i) => {
    console.log(`  ${i + 1}. ${msg.role}: ${msg.content.map(c => 
      c.type === "text" ? c.text : c.type).join(", ")}`)
  })
  console.log("- Temperature:", universal.temperature)
  console.log("- Max tokens:", universal.max_tokens)
  
  // Convert back to Responses format
  const backToResponses = fromUniversal("openai", universal, "https://api.openai.com/v1/responses")
  console.log("\nConverted back to Responses format:", 
    JSON.stringify(backToResponses, null, 2))
}

async function example5_HelperFunctions() {
  console.log("\n=== Example 5: Helper Functions ===\n")
  
  // Helper to set previous_response_id
  function usePreviousResponseId(universal: UniversalBody, responseId: string): UniversalBody {
    return {
      ...universal,
      provider_params: {
        ...universal.provider_params,
        previous_response_id: responseId
      }
    }
  }
  
  // Helper to enable storage
  function enableStorage(universal: UniversalBody): UniversalBody {
    return {
      ...universal,
      provider_params: {
        ...universal.provider_params,
        store: true
      }
    }
  }
  
  // Helper to add encrypted reasoning for ZDR
  function useEncryptedReasoning(universal: UniversalBody): UniversalBody {
    return {
      ...universal,
      provider_params: {
        ...universal.provider_params,
        store: false, // Required for ZDR
        include: ["reasoning.encrypted_content"]
      }
    }
  }
  
  // Example usage
  const request: OpenAIResponsesBody = {
    model: "gpt-5",
    input: "Explain quantum computing"
  }
  
  let universal = toUniversal("openai", request, "https://api.openai.com/v1/responses")
  universal = enableStorage(universal)
  universal = usePreviousResponseId(universal, "resp_12345")
  
  console.log("Universal with helpers applied:", 
    JSON.stringify(universal.provider_params, null, 2))
}

// Main function to run examples
async function main() {
  try {
    // Note: These examples will only work with a valid OpenAI API key
    // and when the Responses API is available
    
    // Example 1: Simple response
    // await example1_SimpleResponse()
    
    // Example 2: Stateful conversation  
    // await example2_StatefulConversation()
    
    // Example 3: Built-in tools
    // await example3_BuiltInTools()
    
    // Example 4: Translation (doesn't require API calls)
    await example4_TranslateToUniversal()
    
    // Example 5: Helper functions (doesn't require API calls)
    await example5_HelperFunctions()
    
  } catch (error) {
    console.error("Error:", error)
  }
}

// Run if called directly
if (require.main === module) {
  main()
}

export {
  example1_SimpleResponse,
  example2_StatefulConversation,
  example3_BuiltInTools,
  example4_TranslateToUniversal,
  example5_HelperFunctions
}
