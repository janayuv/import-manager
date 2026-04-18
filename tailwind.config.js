/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: 'var(--accent)',
        'accent-foreground': 'var(--accent-foreground)',
      },
      screens: {
        xs: '475px',
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
        '2xl': '1536px',
        '3xl': '1920px',
        '4xl': '2560px',
      },
      fontSize: {
        'fluid-xs': 'clamp(10px, 0.6vw + 8px, 12px)',
        'fluid-sm': 'clamp(12px, 0.8vw + 10px, 14px)',
        'fluid-base': 'clamp(14px, 1vw + 10px, 18px)',
        'fluid-lg': 'clamp(16px, 1.2vw + 12px, 20px)',
        'fluid-xl': 'clamp(18px, 1.4vw + 14px, 24px)',
        'fluid-2xl': 'clamp(20px, 1.6vw + 16px, 28px)',
        'fluid-3xl': 'clamp(24px, 2vw + 20px, 32px)',
      },
      spacing: {
        'fluid-xs': 'clamp(0.25rem, 0.5vw, 0.5rem)',
        'fluid-sm': 'clamp(0.5rem, 1vw, 1rem)',
        fluid: 'clamp(0.75rem, 1.5vw, 1.5rem)',
        'fluid-lg': 'clamp(1.5rem, 3vw, 3rem)',
        'fluid-xl': 'clamp(2rem, 4vw, 4rem)',
        'fluid-2xl': 'clamp(3rem, 6vw, 6rem)',
      },
      minWidth: {
        'fluid-btn': 'clamp(80px, 8vw, 120px)',
        'fluid-btn-sm': 'clamp(60px, 6vw, 90px)',
        'fluid-btn-lg': 'clamp(100px, 10vw, 150px)',
        'fluid-input': 'clamp(120px, 20vw, 300px)',
        'fluid-input-sm': 'clamp(100px, 15vw, 250px)',
        'fluid-input-lg': 'clamp(150px, 25vw, 400px)',
      },
      minHeight: {
        'fluid-btn': 'clamp(32px, 4vw, 44px)',
        'fluid-btn-sm': 'clamp(28px, 3.5vw, 36px)',
        'fluid-btn-lg': 'clamp(40px, 5vw, 52px)',
        'fluid-input': 'clamp(32px, 4vw, 44px)',
        'fluid-input-sm': 'clamp(28px, 3.5vw, 36px)',
        'fluid-input-lg': 'clamp(40px, 5vw, 52px)',
      },
      width: {
        'fluid-sidebar': 'clamp(200px, 15vw, 280px)',
        'fluid-sidebar-sm': 'clamp(180px, 12vw, 240px)',
        'fluid-sidebar-lg': 'clamp(220px, 18vw, 320px)',
        'fluid-sidebar-xl': 'clamp(240px, 20vw, 360px)',
      },
      height: {
        'fluid-icon': 'clamp(16px, 2vw, 24px)',
        'fluid-icon-sm': 'clamp(12px, 1.5vw, 18px)',
        'fluid-icon-lg': 'clamp(20px, 2.5vw, 32px)',
        'fluid-icon-xl': 'clamp(24px, 3vw, 40px)',
      },
      borderRadius: {
        fluid: 'clamp(4px, 0.5vw, 8px)',
        'fluid-sm': 'clamp(2px, 0.3vw, 6px)',
        'fluid-lg': 'clamp(6px, 0.8vw, 12px)',
        'fluid-xl': 'clamp(8px, 1vw, 16px)',
      },
    },
  },
  plugins: [],
};
