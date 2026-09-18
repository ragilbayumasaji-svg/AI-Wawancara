import forms from '@tailwindcss/forms'

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        maroon: {
          50: '#fdf2f2',
          100: '#fde8e8',
          500: '#9b1c1c',
          600: '#800000',
          700: '#6b0000',
          800: '#520000',
        }
      }
    },
  },
  plugins: [
    forms,
  ],
}
