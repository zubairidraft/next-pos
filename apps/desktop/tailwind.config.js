/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        nastaliq: ['"Noto Nastaliq Urdu"', '"Urdu Typesetting"', '"Jameel Noori Nastaleeq"', 'serif'],
      },
    },
  },
  plugins: [],
};
