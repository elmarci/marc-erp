import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        orange: {
          DEFAULT: '#FF6B2C',
          dark: '#E55520',
          light: '#FF8F5E',
          pale: '#FFF0E8',
        },
        green: {
          DEFAULT: '#2ECC71',
          dark: '#27AE60',
          pale: '#E8FBF0',
        },
        cream: '#FFF8F0',
        bg: '#FAFAF8',
        marc: '#1A1A1A',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 2px 12px rgba(0,0,0,0.06)',
        'card-hover': '0 8px 30px rgba(0,0,0,0.12)',
        orange: '0 4px 15px rgba(255,107,44,0.3)',
      },
    },
  },
  plugins: [],
} satisfies Config
