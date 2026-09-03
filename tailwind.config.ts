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

        /**
         * Categorical series colours, assigned by slot and never cycled.
         * Validated for the #121821 chart surface: all five clear the dark
         * lightness band, the chroma floor, 3:1 contrast, and adjacent-pair
         * CVD separation (worst ΔE 8.4).
         */
        series: {
          1: "#3987e5",
          2: "#d95926",
          3: "#199e70",
          4: "#c98500",
          5: "#d55181",
        },

        /** Ordinal blue ramp for pipeline stages, light to dark. */
        stage: {
          1: "#b7d3f6",
          2: "#86b6ef",
          3: "#3987e5",
          4: "#256abf",
          5: "#184f95",
        },

        /** Status colours. Reserved — never reused as a series colour. */
        status: {
          good: "#0ca30c",
          warning: "#fab219",
          serious: "#ec835a",
          critical: "#d03b3b",
        },
      },
      fontSize: {
        // Wall-display sizes for TV mode, read from across the room.
        tv: ["2.75rem", { lineHeight: "1.1", fontWeight: "700" }],
        "tv-lg": ["4.5rem", { lineHeight: "1", fontWeight: "800" }],
      },
      keyframes: {
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-ring": {
          "0%": { opacity: "0.7", transform: "scale(0.9)" },
          "70%, 100%": { opacity: "0", transform: "scale(1.6)" },
        },
      },
      animation: {
        "slide-up": "slide-up 320ms ease-out",
        "pulse-ring": "pulse-ring 1.6s ease-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
