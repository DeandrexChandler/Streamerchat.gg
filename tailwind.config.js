/**
 * Tailwind v3 config, bridged to shadcn's v4-style CSS variables.
 *
 * shadcn now emits `@theme inline` and oklch tokens intended for Tailwind v4.
 * This project is on v3, which knows nothing about them, so every token is
 * mapped here by hand. Upgrading to v4 was the alternative and was rejected:
 * it changes utility behaviour across the entire app, and the simulator's
 * styling is explicitly off limits.
 *
 * Each colour is wrapped in color-mix so opacity modifiers work. shadcn's
 * components lean on these heavily (bg-primary/80, ring-ring/50,
 * bg-destructive/10 …), and a bare `var(--primary)` silently drops the alpha.
 */

/** Builds a v3 colour value that honours `/50`-style opacity modifiers. */
const token = (name) =>
  `color-mix(in oklab, var(--${name}) calc(<alpha-value> * 100%), transparent)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: token('background'),
        foreground: token('foreground'),
        card: {
          DEFAULT: token('card'),
          foreground: token('card-foreground'),
        },
        popover: {
          DEFAULT: token('popover'),
          foreground: token('popover-foreground'),
        },
        primary: {
          DEFAULT: token('primary'),
          foreground: token('primary-foreground'),
        },
        secondary: {
          DEFAULT: token('secondary'),
          foreground: token('secondary-foreground'),
        },
        muted: {
          DEFAULT: token('muted'),
          foreground: token('muted-foreground'),
        },
        accent: {
          DEFAULT: token('accent'),
          foreground: token('accent-foreground'),
        },
        destructive: {
          DEFAULT: token('destructive'),
          foreground: token('primary-foreground'),
        },
        border: token('border'),
        input: token('input'),
        ring: token('ring'),
        sidebar: {
          DEFAULT: token('sidebar'),
          foreground: token('sidebar-foreground'),
          primary: token('sidebar-primary'),
          'primary-foreground': token('sidebar-primary-foreground'),
          accent: token('sidebar-accent'),
          'accent-foreground': token('sidebar-accent-foreground'),
          border: token('sidebar-border'),
          ring: token('sidebar-ring'),
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: 'calc(var(--radius) + 4px)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
