import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/",             // ✅ fixes relative asset href/src
  build: { sourcemap: true }
});
