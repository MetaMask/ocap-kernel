import { brandColor } from '@metamask/design-tokens';

/** @type {import('tailwindcss').Config} */
module.exports = {
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
    // Keep essential semantic colors, remove default palette colors. We want to rely on the colors provided by @metamask-previews/design-system-tailwind-preset
    colors: {
      inherit: 'inherit',
      current: 'currentColor',
      transparent: 'transparent',
      black: brandColor.black,
      white: brandColor.white,
    },
    fontSize: {}, // This removes all default Tailwind font sizes. We want to rely on the design system font sizes and enforce use of the Text component
    extend: {},
  },
  plugins: [],
};
