import { defineConfig } from "vitest/config";

// base relativo: funciona em https://<usuario>.github.io/<repo>/ sem configuração extra.
export default defineConfig({
  base: "./",
  build: { target: "es2022", sourcemap: false },
  test: { include: ["src/**/*.test.ts"] },
});
