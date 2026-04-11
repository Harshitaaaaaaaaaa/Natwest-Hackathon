/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'primary-blue': '#1a365d',
        'primary-blue-light': '#2b6cb0',
        'trust-green': '#2f855a',
        'trust-green-light': '#48bb78',
        'warning-amber': '#b7791f',
        'warning-amber-light': '#ecc94b',
        'error-red': '#c53030',
        'error-red-light': '#f56565'
      }
    },
  },
  plugins: [],
}
