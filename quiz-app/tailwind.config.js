/** @type {import('tailwindcss').Config} */

// Compose a token-backed color so Tailwind opacity modifiers (e.g. /30) work:
// rgb(var(--token) / <alpha-value>).
const tokenColor = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Override Tailwind's gray scale with theme variables so every existing
        // `*-gray-*` class becomes theme-aware (see src/index.css for the ramp).
        gray: {
          50: tokenColor('gray-50'),
          100: tokenColor('gray-100'),
          200: tokenColor('gray-200'),
          300: tokenColor('gray-300'),
          400: tokenColor('gray-400'),
          500: tokenColor('gray-500'),
          600: tokenColor('gray-600'),
          700: tokenColor('gray-700'),
          800: tokenColor('gray-800'),
          900: tokenColor('gray-900'),
          950: tokenColor('gray-950'),
        },
        // Named semantic tokens for primitives and future components.
        background: tokenColor('background'),
        foreground: tokenColor('foreground'),
        card: tokenColor('card'),
        border: tokenColor('border'),
        ring: tokenColor('ring'),
      },
    },
  },
  plugins: [],
}
