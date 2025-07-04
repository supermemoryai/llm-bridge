# 🎨 LLM Bridge Examples

This directory contains practical examples demonstrating how to use LLM Bridge in real-world scenarios.

## 📂 Examples

### 🚀 Basic Examples
- **[basic-translation.ts](./basic-translation.ts)** - Simple provider-to-provider translation
- **[provider-detection.ts](./provider-detection.ts)** - Auto-detect provider format
- **[perfect-reconstruction.ts](./perfect-reconstruction.ts)** - Zero data loss round-trip conversion

### 🏗️ Advanced Integration Patterns
- **[universal-middleware.ts](./universal-middleware.ts)** - Universal LLM middleware for Express.js
- **[load-balancer.ts](./load-balancer.ts)** - Multi-provider load balancing with fallbacks
- **[cost-optimizer.ts](./cost-optimizer.ts)** - Automatic cost optimization across providers

### 🖼️ Multimodal Examples
- **[image-analysis.ts](./image-analysis.ts)** - Cross-provider image analysis
- **[multimodal-chat.ts](./multimodal-chat.ts)** - Multimodal chat application

### 🛠️ Tool Calling Examples
- **[function-calling.ts](./function-calling.ts)** - Tool calling across providers
- **[weather-agent.ts](./weather-agent.ts)** - Weather agent with tool calling

### 🔧 Utility Examples
- **[error-handling.ts](./error-handling.ts)** - Comprehensive error handling
- **[observability.ts](./observability.ts)** - Telemetry and monitoring
- **[token-counting.ts](./token-counting.ts)** - Token usage estimation

### 🏢 Production Examples
- **[chatbot-service.ts](./chatbot-service.ts)** - Production chatbot service
- **[api-proxy.ts](./api-proxy.ts)** - Universal LLM API proxy
- **[batch-processor.ts](./batch-processor.ts)** - Batch processing with multiple providers

## 🚀 Running Examples

```bash
# Install dependencies
npm install

# Run any example
npx tsx examples/basic-translation.ts
npx tsx examples/load-balancer.ts
npx tsx examples/chatbot-service.ts
```

## 📝 Notes

- All examples are fully typed with TypeScript
- Examples use mock API calls for demonstration purposes
- Replace mock functions with actual provider SDK calls in production
- Each example includes comprehensive comments explaining the concepts