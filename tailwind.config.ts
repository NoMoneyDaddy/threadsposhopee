import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        shopee: "#ee4d2d"
      }
    }
  },
  plugins: []
};

export default config;
