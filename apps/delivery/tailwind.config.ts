import type { Config } from 'tailwindcss'

// Marc Reparto v3 (aprobado por el dueño 2026-11-18): fondo claro, un solo
// color de acción (azul del logo), tinta y grises para todo lo demás.
// Toque biker: cabecera "azul noche" con línea de carril (ver .lane en
// index.css). El verde limón del logo solo marca "en ruta" y la meta del día.
// Letra: Bricolage Grotesque para direcciones y montos, Onest para el resto.
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Onest', 'system-ui', 'sans-serif'],
        display: ['"Bricolage Grotesque"', 'Onest', 'system-ui', 'sans-serif'],
      },
      colors: {
        blue: { DEFAULT: '#235AB7', press: '#0D4AA1', soft: '#EAF0FA' },
        night: { DEFAULT: '#0B2350', 2: '#123272' },
        lime: { DEFAULT: '#4AAC03', on: '#8BE04E' },
        ink: { DEFAULT: '#16203A', soft: '#5E6676', faint: '#8A91A0', ghost: '#B4B9C3' },
        bg: '#F3F4F7',
        card: '#FFFFFF',
        line: '#E7E9EE',
        bad: { DEFAULT: '#B42318', soft: '#FEF3F2' },
        warn: { DEFAULT: '#93370D', soft: '#FFF6E5' },
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.05)',
        sheet: '0 -8px 30px rgba(16,24,40,.12)',
      },
      keyframes: {
        enterUp: { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        shimmer: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '.5' } },
        ringPulse: { '0%': { boxShadow: '0 0 0 0 rgba(35,90,183,.45)' }, '100%': { boxShadow: '0 0 0 14px rgba(35,90,183,0)' } },
      },
      animation: {
        'enter-up': 'enterUp .18s ease-out both',
        shimmer: 'shimmer 1.3s ease-in-out infinite',
        'ring-pulse': 'ringPulse 1.6s cubic-bezier(.2,.6,.3,1) infinite',
      },
    },
  },
  plugins: [],
} satisfies Config
