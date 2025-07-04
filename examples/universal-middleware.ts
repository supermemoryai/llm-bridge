/**
 * Universal LLM Middleware Example
 * 
 * Demonstrates how to create a universal middleware for Express.js that can
 * handle requests from any LLM provider and route them to any target provider.
 */

import * as express from 'express'
import { toUniversal, fromUniversal, detectProvider } from '../src'

// Mock provider clients (replace with actual SDK calls in production)
const mockProviderClients = {
  async openai(request: any) {
    return { 
      choices: [{ message: { content: `OpenAI response to: ${JSON.stringify(request.messages.slice(-1))}` } }],
      usage: { prompt_tokens: 100, completion_tokens: 50 }
    }
  },
  
  async anthropic(request: any) {
    return {
      content: [{ text: `Anthropic response to: ${JSON.stringify(request.messages.slice(-1))}` }],
      usage: { input_tokens: 95, output_tokens: 48 }
    }
  },
  
  async google(request: any) {
    return {
      candidates: [{ content: { parts: [{ text: `Google response to: ${JSON.stringify(request.contents.slice(-1))}` }] } }],
      usageMetadata: { promptTokenCount: 98, candidatesTokenCount: 52 }
    }
  }
}

// Universal LLM Middleware
function createUniversalLLMMiddleware() {
  return async (req: express.Request, res: express.Response) => {
    try {
      const { targetProvider = 'openai', ...requestBody } = req.body
      
      console.log(`🔄 Processing request for target provider: ${targetProvider}`)
      
      // Step 1: Auto-detect source provider format
      const sourceProvider = detectProvider(requestBody)
      console.log(`📡 Detected source provider: ${sourceProvider}`)
      
      // Step 2: Convert to universal format
      const universal = toUniversal(sourceProvider as any, requestBody)
      console.log(`🌐 Converted to universal format`)
      console.log(`   Model: ${universal.model}`)
      console.log(`   Messages: ${universal.messages.length}`)
      console.log(`   Temperature: ${universal.temperature}`)
      
      // Step 3: Apply universal transformations/policies
      // Normalize temperature to safe range
      if (universal.temperature && universal.temperature > 1) {
        universal.temperature = 1
        console.log(`⚠️  Temperature clamped to 1.0`)
      }
      
      // Apply max token limits
      if (universal.max_tokens && universal.max_tokens > 4000) {
        universal.max_tokens = 4000
        console.log(`⚠️  Max tokens clamped to 4000`)
      }
      
      // Add observability metadata
      universal.metadata = {
        ...universal.metadata,
        requestId: req.headers['x-request-id'] || `req-${Date.now()}`,
        sourceProvider,
        targetProvider,
        timestamp: new Date().toISOString()
      }
      
      // Step 4: Convert to target provider format
      const targetRequest = fromUniversal(targetProvider as any, universal)
      console.log(`🎯 Converted to ${targetProvider} format`)
      
      // Step 5: Call the target provider
      const response = await mockProviderClients[targetProvider](targetRequest)
      console.log(`✅ Received response from ${targetProvider}`)
      
      // Step 6: Return response with metadata
      res.json({
        response,
        metadata: {
          sourceProvider,
          targetProvider,
          requestId: universal.metadata.requestId,
          processingTime: Date.now() - parseInt(universal.metadata.requestId.split('-')[1])
        }
      })
      
    } catch (error) {
      console.error('❌ Middleware error:', error)
      res.status(500).json({ 
        error: 'Internal server error',
        message: error.message 
      })
    }
  }
}

// Express.js application setup
const app = express()
app.use(express.json())

// Universal LLM endpoint
app.post('/v1/chat/completions', createUniversalLLMMiddleware())

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() })
})

// Example usage function
async function demonstrateMiddleware() {
  console.log('🚀 Universal LLM Middleware Demo\n')
  
  // Example 1: OpenAI request → Anthropic provider
  console.log('📝 Example 1: OpenAI format → Anthropic provider')
  const openaiRequest = {
    model: "gpt-4",
    messages: [
      { role: "system", content: "You are a helpful assistant" },
      { role: "user", content: "What is the capital of France?" }
    ],
    temperature: 0.7,
    targetProvider: "anthropic"
  }
  
  console.log('Request:', JSON.stringify(openaiRequest, null, 2))
  // Simulate middleware processing
  const sourceProvider = detectProvider(openaiRequest)
  const universal = toUniversal(sourceProvider as any, openaiRequest)
  const anthropicFormat = fromUniversal("anthropic", universal)
  console.log('✅ Converted to Anthropic format successfully\n')
  
  // Example 2: Anthropic request → Google provider
  console.log('📝 Example 2: Anthropic format → Google provider')
  const anthropicRequest = {
    model: "claude-3-opus-20240229",
    system: "You are a helpful assistant",
    messages: [
      { role: "user", content: "Explain machine learning briefly" }
    ],
    max_tokens: 100,
    targetProvider: "google"
  }
  
  console.log('Request:', JSON.stringify(anthropicRequest, null, 2))
  const sourceProvider2 = detectProvider(anthropicRequest)
  const universal2 = toUniversal(sourceProvider2 as any, anthropicRequest)
  const googleFormat = fromUniversal("google", universal2)
  console.log('✅ Converted to Google format successfully\n')
  
  // Example 3: Google request → OpenAI provider
  console.log('📝 Example 3: Google format → OpenAI provider')
  const googleRequest = {
    contents: [
      {
        role: "user",
        parts: [{ text: "What are the benefits of renewable energy?" }]
      }
    ],
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 200
    },
    targetProvider: "openai"
  }
  
  console.log('Request:', JSON.stringify(googleRequest, null, 2))
  const sourceProvider3 = detectProvider(googleRequest)
  const universal3 = toUniversal(sourceProvider3 as any, googleRequest)
  const openaiFormat = fromUniversal("openai", universal3)
  console.log('✅ Converted to OpenAI format successfully\n')
  
  console.log('🎉 Middleware demonstration completed!')
  console.log('\n💡 Key Benefits:')
  console.log('   • Accept any provider format as input')
  console.log('   • Route to any provider as output')
  console.log('   • Apply universal policies and transformations')
  console.log('   • Maintain perfect data fidelity')
  console.log('   • Add observability and monitoring')
}

// Start server if running directly
if (require.main === module) {
  const PORT = process.env.PORT || 3000
  
  app.listen(PORT, () => {
    console.log(`🌐 Universal LLM Middleware listening on port ${PORT}`)
    console.log(`📡 POST /v1/chat/completions - Universal LLM endpoint`)
    console.log(`💚 GET /health - Health check`)
    console.log('\n🔧 Usage:')
    console.log(`curl -X POST http://localhost:${PORT}/v1/chat/completions \\`)
    console.log(`  -H "Content-Type: application/json" \\`)
    console.log(`  -d '{"model":"gpt-4","messages":[{"role":"user","content":"Hello"}],"targetProvider":"anthropic"}'`)
  })
  
  // Run demonstration
  setTimeout(demonstrateMiddleware, 1000)
}

export { createUniversalLLMMiddleware, app }