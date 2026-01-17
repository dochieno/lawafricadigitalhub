import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/", // ✅ critical for deep routes on Vercel
  build: {
    sourcemap: true, // ✅ helps you see real errors in production console
  },
});
