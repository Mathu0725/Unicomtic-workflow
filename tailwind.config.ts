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
        brand: {
          50: "#f0f7ff",
          100: "#e0effe",
          200: "#bae0fd",
          300: "#7cc5fb",
          400: "#36a4f7",
          500: "#0c87eb",
          600: "#026ac9",
          700: "#0354a3",
          800: "#074885",
          900: "#0c3d6f",
          950: "#082749",
        },
        navy: {
          800: "#131f37",
          900: "#0a1128",
          950: "#060a17",
        },
      },
    },
  },
  plugins: [],
};
export default config;
