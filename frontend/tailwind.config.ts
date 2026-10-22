import type { Config } from "tailwindcss";
export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', "sans-serif"],
        mono: ['"JetBrains Mono Variable"', "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
