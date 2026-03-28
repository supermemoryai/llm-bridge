# LLM Bridge Examples

Practical examples demonstrating how to use LLM Bridge in real-world scenarios.

## Examples

### Basic
- **[basic-translation.ts](./basic-translation.ts)** - Provider-to-provider translation (OpenAI, Anthropic, Google, Responses API)
- **[function-calling.ts](./function-calling.ts)** - Tool calling translation across all providers

### Multimodal
- **[image-analysis.ts](./image-analysis.ts)** - Cross-provider image analysis with format translation

### Production Patterns
- **[universal-middleware.ts](./universal-middleware.ts)** - Universal LLM proxy with Bun.serve()
- **[load-balancer.ts](./load-balancer.ts)** - Multi-provider load balancing with health checks and fallbacks
- **[cost-optimizer.ts](./cost-optimizer.ts)** - Automatic cost optimization across providers
- **[chatbot-service.ts](./chatbot-service.ts)** - Production chatbot with multi-provider routing and observability

## Running Examples

```bash
# Install dependencies
pnpm install

# Run any example
bun examples/basic-translation.ts
bun examples/load-balancer.ts
bun examples/chatbot-service.ts
```

## Notes

- All examples use mock API calls for demonstration
- Replace mock functions with actual provider SDK calls in production
- Examples support 4 providers: `openai`, `anthropic`, `google`, `openai-responses`
