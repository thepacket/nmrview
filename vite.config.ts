import vinext from "vinext";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    watch: {
      ignored: ["**/*.tsbuildinfo", "**/dist/**", "**/out/**"],
    },
  },
  plugins: [vinext()],
});
