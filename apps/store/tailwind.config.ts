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
    },
  },
  plugins: [],
} satisfies Config
