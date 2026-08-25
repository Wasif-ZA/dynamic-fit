/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#16232E',
          50: '#EEF2F5',
          100: '#D8E1E7',
          200: '#AFC0CB',
          300: '#7F97A6',
          400: '#516777',
          500: '#324756',
          600: '#233642',
          700: '#16232E',
          800: '#0F1922',
          900: '#0A1116',
        },
        panel: '#F4F6F5',
        brand: {
          DEFAULT: '#1E6F5C',
          50: '#E8F3F0',
          100: '#C7E4DB',
          400: '#2C8F76',
          500: '#1E6F5C',
          600: '#175747',
          700: '#0F3E33',
        },
        hazard: {
          DEFAULT: '#E8A400',
          ink: '#3A2A00',
        },
      },
      fontFamily: {
        display: ['"Barlow Condensed"', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
