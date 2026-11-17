import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Colores del ERP
        pos: {
          bg: 'hsl(var(--pos-bg))',
          cart: 'hsl(var(--pos-cart))',
          product: 'hsl(var(--pos-product))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        canvas: 'hsl(var(--canvas))',
        surface: { DEFAULT: 'hsl(var(--surface))', 2: 'hsl(var(--surface-2))' },
        line: { DEFAULT: 'hsl(var(--line))', strong: 'hsl(var(--line-strong))' },
        ink: { DEFAULT: 'hsl(var(--ink))', muted: 'hsl(var(--ink-muted))' },
        brand: { DEFAULT: 'hsl(var(--brand))', hover: 'hsl(var(--brand-hover))', soft: 'hsl(var(--brand-soft))' },
        ok: { DEFAULT: 'hsl(var(--ok))', ink: 'hsl(var(--ok-ink))' },
        warn: { DEFAULT: 'hsl(var(--warn))', ink: 'hsl(var(--warn-ink))' },
        bad: { DEFAULT: 'hsl(var(--bad))', ink: 'hsl(var(--bad-ink))' },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))',
        },
      },
      fontSize: {
        meta: ['12px', '16px'],
        table: ['13px', '18px'],
        body: ['14px', '20px'],
        section: ['16px', '22px'],
        title: ['20px', '28px'],
        kpi: ['24px', '30px'],
      },
      borderRadius: {
        ctl: '6px',
        srf: '8px',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
      },
    },
  },
  plugins: [animate],
};

export default config;
