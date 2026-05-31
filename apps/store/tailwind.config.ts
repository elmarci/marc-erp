import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta MARC — verde + negro + blanco en versión clara
        'g':    '#27AE60',   // verde MARC principal (más oscuro = mejor contraste)
        'g-l':  '#2ECC71',   // verde claro (hover)
        'g-p':  '#EAF7EF',   // verde pálido (fondos suaves)
        'g-xl': '#F2FCF5',   // verde ultra-suave (fondo página)
        'bk':   '#111827',   // negro texto principal
        'bk-2': '#374151',   // negro secundario
        'bk-3': '#6B7280',   // gris oscuro
        'bk-4': '#9CA3AF',   // gris claro
        'ln':   '#E5E7EB',   // líneas/bordes neutros
        'ln-g': '#D1EEE0',   // líneas/bordes verdes
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'sm2':  '0 1px 4px rgba(0,0,0,0.06)',
        'md2':  '0 4px 16px rgba(0,0,0,0.08)',
        'lg2':  '0 8px 32px rgba(0,0,0,0.10)',
        'btn':  '0 4px 12px rgba(39,174,96,0.30)',
      },
      borderRadius: {
        'xl2': '1rem',
        'xl3': '1.25rem',
        'xl4': '1.5rem',
      },
    },
  },
  plugins: [],
} satisfies Config
