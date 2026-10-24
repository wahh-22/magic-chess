import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        // three.js and React Three Fiber change rarely: a separate chunk stays cached across game updates.
        // Its dependencies (React, zustand) stay out, or the title screen's entry would import three.js.
        advancedChunks: {
          groups: [{ name: "three", test: /node_modules[\\/](three|@react-three[\\/](fiber|drei))[\\/]/, includeDependenciesRecursively: false }],
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"],
  },
});
