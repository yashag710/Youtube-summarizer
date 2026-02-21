/** @type {import('tailwindcss').Config} */
import scrollbar from "tailwind-scrollbar"
module.exports = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./pages/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-cabin)", "sans-serif"],
      },
    },
  },
  plugins: [
    scrollbar
  ],
};
