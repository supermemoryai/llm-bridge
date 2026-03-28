/**
 * Cross-Provider Image Analysis Example
 *
 * Demonstrates how to perform image analysis across different LLM providers
 * using LLM Bridge's multimodal content translation capabilities.
 */

import { toUniversal, fromUniversal, translateBetweenProviders } from "../src"
import type { ProviderType } from "../src"

const sampleImageBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="

class UniversalImageAnalyzer {
  async analyzeImage(
    imageData: string,
    prompt: string = "Analyze this image in detail",
    provider: ProviderType = "openai",
    options: { detail?: string; maxTokens?: number; temperature?: number } = {},
  ) {
    console.log(`Analyzing image with ${provider}`)

    // Build request in OpenAI format as canonical starting point
    const baseRequest = {
      model: this.getModelForProvider(provider),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${imageData}`,
                detail: options.detail || "auto",
              },
            },
          ],
        },
      ],
      max_tokens: options.maxTokens || 300,
      temperature: options.temperature || 0.7,
    } as any

    // Translate to target provider format
    const providerRequest =
      provider === "openai" ? baseRequest : translateBetweenProviders("openai", provider, baseRequest)

    console.log(`Translated to ${provider} format`)

    // Mock API call
    const response = await this.mockApiCall(provider, providerRequest)
    return { provider, response: this.extractResponseText(response, provider) }
  }

  async compareProviders(
    imageData: string,
    prompt: string = "Describe what you see in this image",
    providers: ProviderType[] = ["openai", "anthropic", "google"],
  ) {
    console.log(`Comparing image analysis across ${providers.length} providers\n`)

    const results = []
    for (const provider of providers) {
      try {
        const result = await this.analyzeImage(imageData, prompt, provider)
        results.push(result)
        console.log(`${provider}: ${result.response}\n`)
      } catch (error: any) {
        console.log(`${provider} failed: ${error.message}\n`)
      }
    }
    return results
  }

  async performSpecializedAnalysis(
    imageData: string,
    analysisType: "ocr" | "objects" | "colors" | "emotion" | "style",
    provider: ProviderType = "openai",
  ) {
    const prompts = {
      ocr: "Extract and transcribe all visible text from this image.",
      objects: "Identify and list all objects visible in this image.",
      colors: "Analyze the color palette of this image.",
      emotion: "Analyze the emotional tone and mood conveyed by this image.",
      style: "Analyze the artistic style of this image.",
    }

    return await this.analyzeImage(imageData, prompts[analysisType], provider, {
      maxTokens: 500,
      temperature: 0.3,
    })
  }

  private getModelForProvider(provider: ProviderType): string {
    const models: Record<string, string> = {
      openai: "gpt-4o",
      anthropic: "claude-sonnet-4-20250514",
      google: "gemini-2.5-pro",
    }
    return models[provider] || "gpt-4o"
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

  private async mockApiCall(provider: string, _request: any) {
    await new Promise((resolve) => setTimeout(resolve, 300))
    const responses: Record<string, any> = {
      openai: { choices: [{ message: { content: "I see a 1x1 pixel red image." } }] },
      anthropic: { content: [{ text: "This is a single-pixel red test image." }] },
      google: { candidates: [{ content: { parts: [{ text: "A minimal 1-pixel red square." }] } }] },
    }
    return responses[provider] || responses.openai
  }
}

// Format translation demo
function demonstrateFormatTranslation() {
  console.log("\n--- Multimodal Format Translation ---\n")

  const openaiRequest = {
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Describe this chart" },
          { type: "image_url", image_url: { url: "data:image/jpeg;base64,iVBORw0KGgoAAAA...", detail: "high" } },
        ],
      },
    ],
  } as any

  console.log("OpenAI Format:")
  console.log(JSON.stringify(openaiRequest, null, 2))

  const anthropicFormat = translateBetweenProviders("openai", "anthropic", openaiRequest)
  console.log("\nAnthropic Format:")
  console.log(JSON.stringify(anthropicFormat, null, 2))

  const googleFormat = translateBetweenProviders("openai", "google", openaiRequest)
  console.log("\nGoogle Format:")
  console.log(JSON.stringify(googleFormat, null, 2))

  // Round-trip
  const universal = toUniversal("openai", openaiRequest)
  const roundTrip = fromUniversal("openai", universal)
  console.log("\nRound-trip preserved image data:", JSON.stringify(roundTrip).includes("base64"))
}

async function main() {
  console.log("Universal Image Analysis Demo\n")

  const analyzer = new UniversalImageAnalyzer()

  console.log("--- Single Provider ---")
  await analyzer.analyzeImage(sampleImageBase64, "What do you see?", "openai")

  console.log("\n--- Multi-Provider Comparison ---")
  await analyzer.compareProviders(sampleImageBase64)

  console.log("--- Specialized Analysis ---")
  await analyzer.performSpecializedAnalysis(sampleImageBase64, "colors", "anthropic")

  demonstrateFormatTranslation()

  console.log("\nDone!")
}

if (import.meta.main) {
  main().catch(console.error)
}

export { UniversalImageAnalyzer }
