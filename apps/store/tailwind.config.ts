import type { Config } from 'tailwindcss'
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Sistema "Azul de confianza" (2026-11): el azul del logo manda
      // (cabecera, carrito, enlaces), el verde queda SOLO para "Agregar",
      // amarillo para ofertas. Todos los pares texto/fondo pasan AA.
      // Fuente de verdad: .claude/skills/marc-brand/SKILL.md.
      fontFamily: {
        sans: ['Figtree', 'system-ui', 'sans-serif'],
        display: ['Figtree', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          blue: {
            50: '#eef3fc', 100: '#dce7fa', 200: '#b9cff4', 300: '#8bb0ea',
            400: '#4f86dc', 500: '#1d5fc9', 600: '#1450b4', 700: '#0c3a8a',
            800: '#0a2d6b', 900: '#071f4a',
          },
          green: {
            50: '#eef8e8', 100: '#e6f4df', 200: '#bfe3ad', 300: '#8fcc74',
            400: '#5cae3c', 500: '#3c9320', 600: '#2b7a12', 700: '#226110',
            800: '#1a4a0c', 900: '#123308',
          },
          // Amarillo de oferta: fondo #FFD84D con texto sun-900.
          sun: { 100: '#fff4c7', 400: '#ffd84d', 500: '#f5c518', 900: '#3d2f00' },
          // Se conservan para pantallas aún no rediseñadas (insignias).
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
        // Neutros: fondo gris azulado muy claro, tarjetas blancas encima.
        // Ningún gris de texto baja de 4.5:1 (antes ink-ghost daba 2.2:1).
        paper: {
          bg: '#f4f6fb',
          surface: '#eef1f7',
          raised: '#ffffff',
          line: '#e1e6f0',
          ink: '#14213d',
          'ink-soft': '#4a5568',
          'ink-faint': '#566074',
          'ink-ghost': '#5f6b7e',
        },
        process: { yellow: '#ffd84d' },
      },
      boxShadow: {
        card: '0 1px 3px rgba(20,33,61,.08)',
        float: '0 6px 16px rgba(20,80,180,.30)',
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
