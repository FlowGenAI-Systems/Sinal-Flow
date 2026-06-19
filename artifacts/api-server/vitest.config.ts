import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Every suite builds throwaway fixtures (whatsapp_messages, etc.) in the
    // SAME local Postgres with the SAME table names, so running suites in
    // parallel races on DDL. Force sequential execution across files.
    fileParallelism: false,
    // Workspace packages (e.g. @workspace/db) are exported as raw .ts via the
    // package "exports" map, so they must be transformed instead of treated as
    // pre-built externals.
    server: {
      deps: {
        inline: [/@workspace\//],
      },
    },
  },
});
