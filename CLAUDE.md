# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an LLM bridge/proxy library that provides a universal interface for multiple AI providers (OpenAI, Anthropic, Google). It translates between different provider formats and a common universal format, enabling seamless switching between providers while maintaining observability and request modification capabilities.

## Architecture

The codebase follows a modular architecture with clear separation of concerns:

- **`src/handler.ts`**: Main entry point containing `handleUniversalRequest()` - the core function that orchestrates request processing
- **`src/models/`**: Contains the translation layer between provider formats and universal format
  - `detector.ts`: Detects which provider is being used based on URL/body
  - `translate.ts`: Main translation functions `toUniversal()` and `fromUniversal()`
  - `*-format/` directories: Provider-specific translation implementations
  - `helpers.ts`: Token counting and observability utilities
- **`src/types/`**: TypeScript type definitions
  - `universal.ts`: Core universal format types (`UniversalBody`, `UniversalMessage`, etc.)
  - `providers.ts`: Provider-specific type definitions
  - `observability.ts`: Observability and metrics types
- **`src/helpers/`**: Utility functions for request processing
- **`src/errors/`**: Custom error definitions

## Key Concepts

- **Universal Format**: A common format that abstracts away provider differences
- **Provider Translation**: Bidirectional conversion between provider formats and universal format
- **Observability**: Token counting and metrics collection for request analysis
- **Request Modification**: Supports an `editFunction` parameter to modify requests before forwarding

## Development Commands

```bash
# Install dependencies
pnpm install

# Build the library
pnpm run build

# Build without type declaration files (faster)
pnpm run build-fast

# Run tests
pnpm run test

# Run tests with Vitest
vitest run
```

## Testing

- Uses Vitest for testing
- Test files are located in `test/` directory
- Run single test files with `vitest run test/filename.test.ts`
- No additional test configuration files present

## Build System

- Uses `tsup` for building with both CommonJS and ESM outputs
- TypeScript configuration supports both module formats
- Main entry point: `src/index.ts`
- Built files output to `dist/` directory
