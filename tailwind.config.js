/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Sarabun', 'sans-serif'],
      },
      colors: {
        minimal: {
          bg: '#FFFFFF',
          subtle: '#F8FAFC',
          border: '#E2E8F0',
          text: '#0F172A',
          muted: '#64748B',
        },
      },
    },
  },
  plugins: [],
};
