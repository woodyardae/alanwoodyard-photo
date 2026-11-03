/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        walnut: {
          950: '#0a0908',
          900: '#0e0c0a',
          850: '#14110f',
          800: '#1a1714',
          700: '#25211d'
        },
        brass: {
          light: '#dfb872',
          DEFAULT: '#c5a059',
          dark: '#967434'
        },
        linen: '#f7f4ee',
        sand: '#a89f91',
        muted: '#6e6557'
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace']
      }
    }
  },
  plugins: []
};