/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './ui/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    colors: {
      background: '#000000',
      primary: '#FFFFFF',
      secondary: '#ACACAC',
    },
    extend: {},
  },
  plugins: [],
}
