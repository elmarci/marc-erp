import type { Config } from 'tailwindcss'
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      colors: {
        // Extraído del logo (logomarc.png): azul del wordmark "Marc" y del
        // carrito, verde de "MINIMARKET" y el aro del ícono.
        brand: {
          blue: {
            50: '#eef4fb', 100: '#d7e6f6', 200: '#aecdee', 300: '#7fb0e3',
            400: '#4a8ed4', 500: '#2460b4', 600: '#1c4c92', 700: '#153a70',
            800: '#0f2a51', 900: '#0a1d38',
          },
          green: {
            50: '#eefbe8', 100: '#d7f5c8', 200: '#b0ea97', 300: '#84db63',
            400: '#63c53c', 500: '#4ca324', 600: '#3d8a18', 700: '#2f6c12',
            800: '#22500d', 900: '#173809',
          },
        },
      },
      keyframes: {
        slideInLeft: { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(0)' } },
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        kenBurns: {
          '0%': { transform: 'scale(1) translate(0, 0)' },
          '100%': { transform: 'scale(1.12) translate(-1%, -1%)' },
        },
        floatBlob: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(4%, -6%) scale(1.08)' },
          '66%': { transform: 'translate(-3%, 4%) scale(0.96)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'slide-in-left': 'slideInLeft 0.25s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'ken-burns': 'kenBurns 12s ease-out forwards',
        'float-blob': 'floatBlob 14s ease-in-out infinite',
        'float-blob-slow': 'floatBlob 20s ease-in-out infinite',
        marquee: 'marquee 22s linear infinite',
        shimmer: 'shimmer 2.5s linear infinite',
      },
    },
  },
  plugins: [],
} satisfies Config
