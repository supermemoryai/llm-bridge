import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  clean: true,
  splitting: false,
  sourcemap: false,
  minify: false,
  // Skip bundling dependencies to avoid namespace issues
  external: ['openai', '@anthropic-ai/sdk', '@google/generative-ai'],
  // Configure DTS generation to avoid bundling external type definitions
  dts: {
    resolve: true,
    // Don't bundle external package types
    compilerOptions: {
      skipLibCheck: true,
      // Preserve external module references
      declaration: true,
      emitDeclarationOnly: false,
    }
  }
})