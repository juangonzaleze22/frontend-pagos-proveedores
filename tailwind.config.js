/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        // Escala dinámica controlada por BrandingService (variables CSS en runtime).
        primary: "rgb(var(--brand-500) / <alpha-value>)",
        "primary-hover": "rgb(var(--brand-600) / <alpha-value>)",
        "primary-dark": "rgb(var(--brand-800) / <alpha-value>)",
        blue: {
          50: "rgb(var(--brand-50) / <alpha-value>)",
          100: "rgb(var(--brand-100) / <alpha-value>)",
          200: "rgb(var(--brand-200) / <alpha-value>)",
          300: "rgb(var(--brand-300) / <alpha-value>)",
          400: "rgb(var(--brand-400) / <alpha-value>)",
          500: "rgb(var(--brand-500) / <alpha-value>)",
          600: "rgb(var(--brand-600) / <alpha-value>)",
          700: "rgb(var(--brand-700) / <alpha-value>)",
          800: "rgb(var(--brand-800) / <alpha-value>)",
          900: "rgb(var(--brand-900) / <alpha-value>)",
          950: "rgb(var(--brand-950) / <alpha-value>)"
        },
        "background-light": "#f3f4f6", // Gray-100
        "background-dark": "#18181b", // Zinc-900 (más suave que 950)
        "surface-light": "#ffffff",
        "surface-dark": "#27272a", // Zinc-800 (cards/superficies)
        "card-light": "#ffffff",
        "card-dark": "#3f3f46", // Zinc-700 (cards destacan)
        "input-light": "#f9fafb",
        "input-dark": "#27272a", // Zinc-800
        "border-light": "#e5e7eb",
        "border-dark": "#52525b", // Zinc-600 (bordes visibles, neutros)
      },
      fontFamily: {
        display: ["Manrope", "sans-serif"], // Para login
        sans: ["Inter", "sans-serif"], // Principal para toda la app
        body: ["Inter", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "0.5rem",
        lg: "0.75rem",
        xl: "1rem",
        "2xl": "1.5rem",
        full: "9999px"
      },
    },
  },
  plugins: [],
}

