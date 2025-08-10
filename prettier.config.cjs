/**
 * Prettier configuration with powerful formatting controls:
 * - Tailwind class sorting
 * - Consistent code style across JS/TS/TSX
 */
module.exports = {
  semi: false,
  singleQuote: true,
  printWidth: 100,
  tabWidth: 2,
  trailingComma: 'es5',
  bracketSpacing: true,
  arrowParens: 'always',
  endOfLine: 'lf',
  plugins: [
    'prettier-plugin-tailwindcss',
  ],
}


