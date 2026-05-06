import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#05060a",
        panel: "#10131f",
        glow: "#77f2a1",
      },
    },
  },
  plugins: [],
};

export default config;
