import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#0f172a",
          light: "#1e293b",
          dark: "#020617",
        },
        kp: {
          // Accent blue — legible in light and dark (was near-black #0f172a).
          primary: "#2563eb",
          success: "#059669",
          warning: "#d97706",
          danger: "#dc2626",
          info: "#0891b2",
          secondary: "#64748b",
          dark: "#0f172a",
        },
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #020617 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
