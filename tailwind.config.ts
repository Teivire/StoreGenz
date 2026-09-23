import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "Arial", "sans-serif"],
        khmer: ["var(--font-noto-sans-khmer)", "Arial", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;
