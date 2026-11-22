import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          50: "#EEF3F8",
          100: "#D7E3F0",
          200: "#B0C7E0",
          600: "#1F4E79",
          700: "#1B365D",
          800: "#142947",
          900: "#0D1C31",
        },
      },
      fontFamily: {
        sans: ["Tajawal", "Segoe UI", "Tahoma", "Arial", "sans-serif"],
        academic: ["Traditional Arabic", "Amiri", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
