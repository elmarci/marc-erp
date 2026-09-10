import type { Config } from 'tailwindcss'
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Public Sans: cuerpo/transaccional — precios, botones, formularios,
        // todo el checkout. Reemplaza a Plus Jakarta Sans, que ya se sentía
        // "segura" (la usa cualquier app moderna, sin nada propio).
        sans: ['"Public Sans"', 'system-ui', 'sans-serif'],
        // Outfit: voz de marca — títulos de sección, precio grande de una
        // oferta. Reemplaza a Fredoka (se sentía "de caricatura" — feedback
        // real de testeo): geométrica y con calidez propia de app de
        // delivery moderna (Rappi/PedidosYa), sin el efecto burbuja
        // redondeada. Nunca en párrafos largos ni en formularios.
        display: ['Outfit', '"Public Sans"', 'sans-serif'],
      },
      colors: {
        // Extraído del logo (logomarc.png): azul del wordmark "Marc" y del
        // carrito, verde de "MINIMARKET" y el aro del ícono. Sin cambios —
        // es marca real, no parte de lo que se corrige.
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
          // Acento secundario "imprenta" del rediseño — uso raro: ofertas,
          // badges, sello de confirmación.
          magenta: {
            50: '#fde6f0', 100: '#fbc0dd', 200: '#f591c1', 300: '#ee5fa3',
            400: '#e3308a', 500: '#d6006c', 600: '#b3005a', 700: '#8a0446',
            800: '#630632', 900: '#3d0620',
          },
          // Achiote — el color de la sazón de mercado. Nuevo en esta pasada:
          // reemplaza el ámbar genérico de e-commerce para "fresco/oferta
          // real", algo que ninguna plantilla de delivery agregadora usa.
          achiote: {
            50: '#fbede4', 100: '#f3ddce', 200: '#e7b799', 300: '#da9268',
            400: '#d1723e', 500: '#c9552a', 600: '#ac4522', 700: '#85361b',
            800: '#5f2713', 900: '#3d190c',
          },
        },
        // Paleta neutra de la tienda — fondo blanco real (pedido explícito:
        // el tono mostaza/papel de la pasada anterior no se queda), con
        // superficies secundarias en gris neutro clarísimo para diferenciar
        // tarjetas/inputs del fondo sin volver al gris frío de "app de
        // oficina" ni al beige de mercado.
        paper: {
          bg: '#ffffff',
          surface: '#f4f4f2',
          raised: '#ffffff',
          line: '#e5e3dc',
          ink: '#26241c',
          'ink-soft': '#5b5744',
          'ink-faint': '#8a8570',
          'ink-ghost': '#b3ad94',
        },
        process: { yellow: '#edbb00' },
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
        screenIn: { from: { opacity: '0', transform: 'translateX(18px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
        stampIn: {
          '0%': { transform: 'scale(2.4) rotate(-9deg)', opacity: '0' },
          '55%': { transform: 'scale(0.88) rotate(-9deg)', opacity: '1' },
          '100%': { transform: 'scale(1) rotate(-9deg)', opacity: '1' },
        },
        ringPulse: {
          '0%': { boxShadow: '0 0 0 0 rgba(76,163,36,.45)' },
          '100%': { boxShadow: '0 0 0 10px rgba(76,163,36,0)' },
        },
        toastIn: { from: { opacity: '0', transform: 'translate(-50%, 10px)' }, to: { opacity: '1', transform: 'translate(-50%, 0)' } },
      },
      animation: {
        'slide-in-left': 'slideInLeft 0.25s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'ken-burns': 'kenBurns 12s ease-out forwards',
        'float-blob': 'floatBlob 14s ease-in-out infinite',
        'float-blob-slow': 'floatBlob 20s ease-in-out infinite',
        marquee: 'marquee 22s linear infinite',
        shimmer: 'shimmer 2.5s linear infinite',
        'screen-in': 'screenIn .35s cubic-bezier(.2,.8,.2,1)',
        'stamp-in': 'stampIn .5s cubic-bezier(.3,.7,.3,1) forwards',
        'ring-pulse': 'ringPulse 1.8s cubic-bezier(.2,.6,.3,1) infinite',
        'toast-in': 'toastIn .3s cubic-bezier(.2,.8,.2,1)',
      },
    },
  },
  plugins: [],
} satisfies Config
