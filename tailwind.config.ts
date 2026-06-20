import type { Config } from "tailwindcss";

// 語意色彩對映到 globals.css 的 CSS 變數（支援 /opacity 與深色切換）。
// 保留 `shopee` 別名與既有 neutral 類別，舊元件不受影響。
const token = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        shopee: "#ee4d2d",
        bg: token("--bg"),
        surface: { DEFAULT: token("--surface"), 2: token("--surface-2") },
        ink: { DEFAULT: token("--ink"), 2: token("--ink-2"), 3: token("--ink-3") },
        border: { DEFAULT: token("--border"), strong: token("--border-strong") },
        brand: token("--brand"),
        success: token("--success"),
        warn: token("--warn"),
        danger: token("--danger"),
        info: token("--info")
      },
      borderColor: {
        DEFAULT: token("--border"),
        strong: token("--border-strong")
      },
      boxShadow: {
        card: "var(--shadow-card)",
        pop: "var(--shadow-pop)"
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem"
      }
    }
  },
  plugins: []
};

export default config;
