import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b0f14",
        panel: "#121821",
        edge: "#1e2733",
        muted: "#8b9bb0",
        accent: "#4da3ff",
        good: "#3ecf8e",
        warn: "#f5a524",
        bad: "#f45b5b",
      },
    },
  },
  plugins: [],
} satisfies Config;
