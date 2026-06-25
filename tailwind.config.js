/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          yellow:   '#ffd84a',
          orange:   '#faab55',
          pink:     '#f5a8a0',
          lavender: '#b48ae4',
        },
        surface: {
          bg:   '#ffffff',
          warm: '#f5f3f0',
        },
        // Prefixed to avoid conflicts with Tailwind's built-in text/border utilities
        content: {
          primary:   '#1a1a1a',
          secondary: '#6b6b6b',
          muted:     '#9ca3af',
        },
        stroke: '#e8e4df',
      },
      fontFamily: {
        display: ['Chetta Vissto', 'Playfair Display', 'Georgia', 'serif'],
        serif:   ['Cormorant Garamond', 'Georgia', 'serif'],
        heading: ['DM Sans', 'system-ui', 'sans-serif'],
        body:    ['Arimo', 'system-ui', 'sans-serif'],
        caption: ['Source Sans 3', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '20px',
        pill: '999px',
        blob: '60% 40% 70% 30% / 50% 60% 40% 50%',
      },
      boxShadow: {
        soft: '0 4px 24px rgba(0,0,0,0.06)',
        card: '0 8px 40px rgba(0,0,0,0.08)',
        glow: '0 0 40px rgba(180,138,228,0.25)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #faab55, #f5a8a0, #b48ae4)',
        'brand-gradient-radial': 'radial-gradient(circle at 60% 40%, #ffd84a33, #faab5533, #f5a8a033, #b48ae433)',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-12px)' },
        },
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        'float-slow': 'float 9s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
