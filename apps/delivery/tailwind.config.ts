import type { Config } from 'tailwindcss'

// Mismos matices de marca que apps/store (brand.*) — ver skill `marc-brand` —
// pero esta app (herramienta interna para bikers, no cara al cliente) corre
// en oscuro con tipografía propia: decisión explícita del dueño tras ver que
// la versión clara con Outfit seguía sintiéndose "igual a cualquier app de
// delivery". `paper.*` pasa a ser la escala oscura de ESTA app — apps/store
// no se toca.
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Public Sans"', 'system-ui', 'sans-serif'],
        display: ['"Big Shoulders Display"', 'system-ui', 'sans-serif'],
      },
      colors: {
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
          magenta: {
            50: '#fde6f0', 100: '#fbc0dd', 200: '#f591c1', 300: '#ee5fa3',
            400: '#e3308a', 500: '#d6006c', 600: '#b3005a', 700: '#8a0446',
            800: '#630632', 900: '#3d0620',
          },
          achiote: {
            50: '#fbede4', 100: '#f3ddce', 200: '#e7b799', 300: '#da9268',
            400: '#d1723e', 500: '#c9552a', 600: '#ac4522', 700: '#85361b',
            800: '#5f2713', 900: '#3d190c',
          },
        },
        paper: {
          bg: '#1c1b15',
          surface: '#26241c',
          raised: '#2a2820',
          line: '#3a3728',
          ink: '#f5f1e6',
          'ink-soft': '#b8b3a0',
          'ink-faint': '#8f8a76',
          'ink-ghost': '#6b6656',
        },
        process: { yellow: '#edbb00' },
        // Versiones claras de los mismos matices de marca — para texto y
        // números grandes SOBRE fondo oscuro, donde brand.green.700 (pensado
        // para texto blanco encima) se vería apagado. Nunca usar estos como
        // fondo de botón con texto blanco.
        accent: {
          green: '#7ED957',
          achiote: '#E8895A',
          blue: '#5B9BE0',
        },
      },
      keyframes: {
        enterUp: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        stampIn: {
          '0%': { transform: 'scale(2.4) rotate(-9deg)', opacity: '0' },
          '55%': { transform: 'scale(0.88) rotate(-9deg)', opacity: '1' },
          '100%': { transform: 'scale(1) rotate(-9deg)', opacity: '1' },
        },
        ringPulse: {
          '0%': { boxShadow: '0 0 0 0 rgba(76,163,36,.45)' },
          '100%': { boxShadow: '0 0 0 14px rgba(76,163,36,0)' },
        },
        shimmer: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '.45' },
        },
        spin: { to: { transform: 'rotate(360deg)' } },
      },
      animation: {
        'enter-up': 'enterUp .18s ease-out both',
        'stamp-in': 'stampIn .5s cubic-bezier(.3,.7,.3,1) forwards',
        'ring-pulse': 'ringPulse 1.8s cubic-bezier(.2,.6,.3,1) infinite',
        shimmer: 'shimmer 1.3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config
