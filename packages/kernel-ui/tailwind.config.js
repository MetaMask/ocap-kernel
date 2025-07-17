import { brandColor } from '@metamask/design-tokens';

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  presets: [
    // eslint-disable-next-line n/global-require
    require('@metamask/design-system-tailwind-preset'),
  ],
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    // Ensures tailwind classnames are generated for design system components
    '../../node_modules/@metamask/design-system-react/**/*.{js,mjs,cjs}',
  ],
  theme: {
    colors: {
      inherit: 'inherit',
      current: 'currentColor',
      transparent: 'transparent',
      black: brandColor.black,
      white: brandColor.white,
    },
    fontSize: {},
    extend: {},
  },
  plugins: [],
};
