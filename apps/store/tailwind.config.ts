import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#2ECC71',   // MARC green — acción principal
          dark: '#27AE60',
          light: '#4CD787',
          pale: '#E8FBF0',      // verde muy suave para fondos hover
        },
        marc: {
          black: '#1A1A1A',     // negro MARC para texto
          white: '#FFFFFF',
          bg: '#F8FFF9',        // blanco con tinte verde casi imperceptible
          card: '#FFFFFF',
          border: '#D6F0E0',    // borde verde muy sutil
          muted: '#6B6B6B',
        },
        // Alias para uso directo en clases
        green: {
          DEFAULT: '#2ECC71',
          dark: '#27AE60',
          pale: '#E8FBF0',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 2px 12px rgba(0,0,0,0.05)',
        'card-hover': '0 8px 28px rgba(0,0,0,0.10)',
        green: '0 4px 15px rgba(46,204,113,0.25)',
      },
    },
  },
  plugins: [],
} satisfies Config
