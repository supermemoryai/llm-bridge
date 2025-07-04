import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    coverage: {
      provider: "istanbul", // or 'v8'
      include: ["src/**/*"],
    },
  },
})
