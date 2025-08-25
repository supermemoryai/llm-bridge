# 🎨 LLM Bridge Examples

This directory contains practical examples demonstrating how to use LLM Bridge in real-world scenarios.

## 📂 Examples

### 🚀 Basic Examples

- **[basic-translation.ts](./basic-translation.ts)** - Simple provider-to-provider translation

### 🏗️ Advanced Integration Patterns

- **[universal-middleware.ts](./universal-middleware.ts)** - Universal LLM middleware for Express.js
- **[load-balancer.ts](./load-balancer.ts)** - Multi-provider load balancing with fallbacks
- **[cost-optimizer.ts](./cost-optimizer.ts)** - Automatic cost optimization across providers

### 🖼️ Multimodal Examples

- **[image-analysis.ts](./image-analysis.ts)** - Cross-provider image analysis

### 🛠️ Tool Calling Examples

- **[function-calling.ts](./function-calling.ts)** - Tool calling across providers

### 🔧 Utility Examples

- (See repository tests and README for additional patterns)

### 🏢 Production Examples

- **[chatbot-service.ts](./chatbot-service.ts)** - Production chatbot service

## 🚀 Running Examples

```bash
# Install dependencies
npm install

# Run any example
npx tsx examples/basic-translation.ts
npx tsx examples/load-balancer.ts
npx tsx examples/chatbot-service.ts
npx tsx examples/cost-optimizer.ts
npx tsx examples/function-calling.ts
npx tsx examples/image-analysis.ts
```

## 📝 Notes

- All examples are fully typed with TypeScript
- Examples use mock API calls for demonstration purposes
- Replace mock functions with actual provider SDK calls in production
- Each example includes comprehensive comments explaining the concepts
