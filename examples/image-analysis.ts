/**
 * Cross-Provider Image Analysis Example
 * 
 * Demonstrates how to perform image analysis across different LLM providers
 * using LLM Bridge's multimodal content translation capabilities.
 */

import { toUniversal, fromUniversal, translateBetweenProviders } from '../src'

// Sample base64 image data (truncated for example)
const sampleImageBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="

// Mock provider responses for demonstration
const mockProviderResponses = {
  openai: {
    choices: [{
      message: {
        content: "I can see this is a simple 1x1 pixel red image. This appears to be a minimal test image commonly used for technical demonstrations."
      }
    }],
    usage: { prompt_tokens: 150, completion_tokens: 25 }
  },
  
  anthropic: {
    content: [{
      text: "This image appears to be a very small, single-pixel image in red color. It's likely a test image used for technical purposes or demonstrations."
    }],
    usage: { input_tokens: 145, output_tokens: 28 }
  },
  
  google: {
    candidates: [{
      content: {
        parts: [{
          text: "I can analyze this image. It's a minimal 1-pixel red square, commonly used as a test image in web development and image processing demonstrations."
        }]
      }
    }],
    usageMetadata: { promptTokenCount: 148, candidatesTokenCount: 30 }
  }
}

// Mock API call function
async function mockApiCall(provider: 'openai' | 'anthropic' | 'google', request: any): Promise<any> {
  console.log(`🌐 Making ${provider} API call...`)
  
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500))
  
  // Return mock response
  return mockProviderResponses[provider]
}

class UniversalImageAnalyzer {
  /**
   * Analyze image with any provider using universal format
   */
  async analyzeImage(
    imageData: string,
    prompt: string = "Analyze this image in detail",
    provider: 'openai' | 'anthropic' | 'google' = "openai",
    options: any = {}
  ) {
    console.log(`🖼️ Analyzing image with ${provider}`)
    console.log(`📝 Prompt: "${prompt}"`)
    
    // Create request in OpenAI format (as universal starting point)
    const baseRequest = {
      model: this.getModelForProvider(provider),
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${imageData}`,
              detail: options.detail || "auto"
            }
          }
        ]
      }],
      max_tokens: options.maxTokens || 300,
      temperature: options.temperature || 0.7
    }
    
    // Translate to target provider format
    const providerRequest = translateBetweenProviders("openai", provider, baseRequest as any)
    
    console.log(`🔄 Translated to ${provider} format`)
    console.log(`📊 Request structure:`, this.summarizeRequest(providerRequest, provider))
    
    // Make API call
    const response = await mockApiCall(provider, providerRequest)
    
    // Extract response text based on provider format
    const responseText = this.extractResponseText(response, provider)
    
    return {
      provider,
      request: providerRequest,
      response: responseText,
      usage: this.extractUsage(response, provider)
    }
  }
  
  /**
   * Compare analysis across multiple providers
   */
  async compareProviders(
    imageData: string,
    prompt: string = "Describe what you see in this image",
    providers: Array<'openai' | 'anthropic' | 'google'> = ["openai", "anthropic", "google"]
  ) {
    console.log(`🔍 Comparing image analysis across ${providers.length} providers\n`)
    
    const results: Array<{ provider: 'openai' | 'anthropic' | 'google'; request?: any; response?: string; usage?: object; error?: string }> = []
    
    for (const provider of providers) {
      try {
        const result = await this.analyzeImage(imageData, prompt, provider)
        results.push(result)
        console.log(`✅ ${provider} analysis completed\n`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.log(`❌ ${provider} analysis failed: ${message}\n`)
        results.push({
          provider,
          error: message
        })
      }
    }
    
    return results
  }
  
  /**
   * Multi-image analysis with different prompts
   */
  async analyzeMultipleImages(
    images: Array<{ data: string; prompt: string; name?: string }>,
    provider: 'openai' | 'anthropic' | 'google' = "openai"
  ) {
    console.log(`🖼️ Analyzing ${images.length} images with ${provider}\n`)
    
    const results: Array<{ name: string; provider: 'openai' | 'anthropic' | 'google'; request?: any; response?: string; usage?: object; error?: string }> = []
    
    for (let i = 0; i < images.length; i++) {
      const image = images[i]
      const imageName = image.name || `Image ${i + 1}`
      
      console.log(`📷 Processing ${imageName}`)
      
      try {
        const result = await this.analyzeImage(image.data, image.prompt, provider)
        results.push({
          name: imageName,
          ...result
        })
        console.log(`✅ ${imageName} processed successfully\n`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.log(`❌ ${imageName} failed: ${message}\n`)
        results.push({
          name: imageName,
          provider,
          error: message
        })
      }
    }
    
    return results
  }
  
  /**
   * Specialized image analysis tasks
   */
  async performSpecializedAnalysis(
    imageData: string,
    analysisType: 'ocr' | 'objects' | 'colors' | 'emotion' | 'style',
    provider: 'openai' | 'anthropic' | 'google' = "openai"
  ) {
    const prompts = {
      ocr: "Extract and transcribe all visible text from this image. List each text element separately.",
      objects: "Identify and list all objects visible in this image. Include their approximate positions and relationships.",
      colors: "Analyze the color palette of this image. Describe the dominant colors, color harmony, and overall color scheme.",
      emotion: "Analyze the emotional tone and mood conveyed by this image. Consider facial expressions, body language, and overall atmosphere.",
      style: "Analyze the artistic style of this image. Consider composition, lighting, technique, and artistic influences."
    }
    
    const prompt = prompts[analysisType]
    console.log(`🎯 Performing ${analysisType} analysis`)
    
    return await this.analyzeImage(imageData, prompt, provider, {
      maxTokens: 500,
      temperature: 0.3 // Lower temperature for more focused analysis
    })
  }
  
  // Helper methods
  private getModelForProvider(provider: 'openai' | 'anthropic' | 'google'): string {
    const models: Record<'openai' | 'anthropic' | 'google', string> = {
      openai: "gpt-4-vision-preview",
      anthropic: "claude-3-opus-20240229",
      google: "gemini-1.5-pro"
    }
    return models[provider]
  }
  
  private summarizeRequest(request: any, provider: 'openai' | 'anthropic' | 'google'): object {
    switch (provider) {
      case "openai":
        return {
          model: request.model,
          messageCount: request.messages?.length || 0,
          hasImages: request.messages?.some((m: any) => 
            Array.isArray(m.content) && m.content.some((c: any) => c.type === "image_url")
          ) || false
        }
      case "anthropic":
        return {
          model: request.model,
          messageCount: request.messages?.length || 0,
          hasImages: request.messages?.some((m: any) =>
            Array.isArray(m.content) && m.content.some((c: any) => c.type === "image")
          ) || false
        }
      case "google":
        return {
          contentCount: request.contents?.length || 0,
          hasImages: request.contents?.some((c: any) =>
            c.parts?.some((p: any) => p.inlineData)
          ) || false
        }
      default:
        return {}
    }
  }
  
  private extractResponseText(response: any, provider: string): string {
    switch (provider) {
      case "openai":
        return response.choices?.[0]?.message?.content || ""
      case "anthropic":
        return response.content?.[0]?.text || ""
      case "google":
        return response.candidates?.[0]?.content?.parts?.[0]?.text || ""
      default:
        return ""
    }
  }
  
  private extractUsage(response: any, provider: string): object {
    switch (provider) {
      case "openai":
        return response.usage || {}
      case "anthropic":
        return response.usage || {}
      case "google":
        return response.usageMetadata || {}
      default:
        return {}
    }
  }
}

// Example usage and demonstrations
async function demonstrateImageAnalysis() {
  console.log('🖼️ Universal Image Analysis Demo\n')
  
  const analyzer = new UniversalImageAnalyzer()
  
  // Example 1: Single provider analysis
  console.log('📝 Example 1: Single Provider Analysis')
  const singleResult = await analyzer.analyzeImage(
    sampleImageBase64,
    "What do you see in this image? Describe it in detail.",
    "openai"
  )
  
  console.log('🔍 Analysis Result:')
  console.log(`Provider: ${singleResult.provider}`)
  console.log(`Response: ${singleResult.response}`)
  console.log(`Usage:`, singleResult.usage)
  
  // Example 2: Multi-provider comparison
  console.log('\n📝 Example 2: Multi-Provider Comparison')
  const comparisonResults = await analyzer.compareProviders(
    sampleImageBase64,
    "Describe this image and identify any technical characteristics."
  )
  
  console.log('🔍 Comparison Results:')
  comparisonResults.forEach((result: any) => {
    if (result.error) {
      console.log(`❌ ${result.provider}: ${result.error}`)
    } else {
      const snippet = result.response ? result.response.substring(0, 100) : ''
      console.log(`✅ ${result.provider}: ${snippet}...`)
    }
  })
  
  // Example 3: Specialized analysis
  console.log('\n📝 Example 3: Specialized Analysis')
  const specializedTypes = ['colors', 'style', 'objects'] as const
  
  for (const type of specializedTypes) {
    console.log(`\n🎯 ${type.toUpperCase()} Analysis:`)
    const result = await analyzer.performSpecializedAnalysis(
      sampleImageBase64,
      type,
      "anthropic"
    )
    console.log(`Result: ${result.response.substring(0, 150)}...`)
  }
  
  // Example 4: Multi-image batch processing
  console.log('\n📝 Example 4: Multi-Image Batch Processing')
  const multipleImages = [
    {
      name: "Test Image 1",
      data: sampleImageBase64,
      prompt: "Analyze the technical properties of this image"
    },
    {
      name: "Test Image 2", 
      data: sampleImageBase64,
      prompt: "Describe the visual characteristics"
    }
  ]
  
  const batchResults = await analyzer.analyzeMultipleImages(multipleImages, "google")
  
  console.log('🔍 Batch Processing Results:')
  batchResults.forEach((result: any) => {
    if (result.error) {
      console.log(`❌ ${result.name}: ${result.error}`)
    } else {
      const snippet = result.response ? result.response.substring(0, 100) : ''
      console.log(`✅ ${result.name}: ${snippet}...`)
    }
  })
  
  console.log('\n🎉 Image analysis demonstrations completed!')
  console.log('\n💡 Key Capabilities:')
  console.log('   • Analyze images with any provider using universal format')
  console.log('   • Compare results across multiple providers')
  console.log('   • Perform specialized analysis tasks')
  console.log('   • Handle batch image processing')
  console.log('   • Seamless format translation for multimodal content')
}

// Format translation demonstration
function demonstrateFormatTranslation() {
  console.log('\n🔄 Multimodal Format Translation Demo\n')
  
  // OpenAI multimodal request
  const openaiRequest = {
    model: "gpt-4-vision-preview",
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "Describe this chart" },
        {
          type: "image_url",
          image_url: {
            url: "data:image/jpeg;base64,iVBORw0KGgoAAAA...",
            detail: "high"
          }
        }
      ]
    }]
  }
  
  console.log('📊 Original OpenAI Format:')
  console.log(JSON.stringify(openaiRequest, null, 2))
  
  // Translate to Anthropic
  const anthropicFormat = translateBetweenProviders("openai", "anthropic", openaiRequest as any)
  console.log('\n🤖 Anthropic Format:')
  console.log(JSON.stringify(anthropicFormat, null, 2))
  
  // Translate to Google
  const googleFormat = translateBetweenProviders("openai", "google", openaiRequest as any)
  console.log('\n🔍 Google Format:')
  console.log(JSON.stringify(googleFormat, null, 2))
  
  // Verify round-trip
  const universal = toUniversal("openai", openaiRequest as any)
  const roundTrip = fromUniversal("openai", universal)
  
  console.log('\n♻️ Round-trip Verification:')
  console.log('Original structure preserved:', JSON.stringify(openaiRequest) === JSON.stringify(roundTrip))
  const msg0 = (roundTrip as any).messages?.[0]
  const content1 = Array.isArray(msg0?.content) ? (msg0.content[1] as any) : undefined
  console.log('Image data preserved:', !!content1?.image_url?.url && String(content1.image_url.url).includes('base64'))
  console.log('Detail parameter preserved:', content1?.image_url?.detail === 'high')
}

// Run demonstrations if executed directly
if (require.main === module) {
  async function runAll() {
    await demonstrateImageAnalysis()
    demonstrateFormatTranslation()
  }
  
  runAll().catch(console.error)
}

export { UniversalImageAnalyzer }