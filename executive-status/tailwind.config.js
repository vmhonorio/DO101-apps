/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Source Sans 3"', '"Segoe UI"', 'Roboto', 'Arial', 'sans-serif'],
      },
      colors: {
        navy: { 900: '#0b1f44', 800: '#132b5c', 700: '#1d3a75' },
      },
    },
  },
  plugins: [],
};
