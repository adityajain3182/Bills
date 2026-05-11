/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#f5efe4',
        surface: '#fdfaf3',
        forest: {
          DEFAULT: '#1f3a2e',
          50: '#eef3f0',
          100: '#d4e0d9',
          500: '#3d6a55',
          600: '#2a503f',
          700: '#1f3a2e',
          900: '#11241c',
        },
        coral: {
          DEFAULT: '#e8765a',
          50: '#fdeee9',
          100: '#fbd5c9',
          500: '#e8765a',
          600: '#d35a3d',
        },
        warmred: '#c44536',
        ink: {
          DEFAULT: '#2a2620',
          muted: '#7a716a',
          soft: '#a7a098',
        },
        line: '#e6dfd1',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Manrope', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '1.25rem',
        sheet: '1.5rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(31, 58, 46, 0.04), 0 4px 14px rgba(31, 58, 46, 0.06)',
        sheet: '0 -8px 32px rgba(31, 58, 46, 0.12)',
        fab: '0 6px 16px rgba(31, 58, 46, 0.25)',
      },
      keyframes: {
        sheetIn: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
        pop: {
          '0%': { transform: 'scale(0.95)', opacity: 0 },
          '100%': { transform: 'scale(1)', opacity: 1 },
        },
      },
      animation: {
        sheetIn: 'sheetIn 240ms cubic-bezier(0.32, 0.72, 0, 1)',
        fadeIn: 'fadeIn 200ms ease-out',
        pop: 'pop 180ms ease-out',
      },
    },
  },
  plugins: [],
};
