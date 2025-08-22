/**
 * Prettier configuration for Import Manager
 * - Optimized for React, TypeScript, Tailwind CSS
 * - Supports JSON, Markdown, TOML for project files
 * - Integrates with ESLint and Tailwind
 * - Enhanced for data-heavy Excel parsing and UI components
 */
module.exports = {
  semi: false,
  singleQuote: true,
  printWidth: 120,
  tabWidth: 2,
  trailingComma: 'es5',
  bracketSpacing: true,
  arrowParens: 'always',
  endOfLine: 'lf',
  singleAttributePerLine: true,
  plugins: ['prettier-plugin-tailwindcss', 'prettier-plugin-toml'],
  tailwindConfig: './tailwind.config.js',
  overrides: [
    {
      files: ['*.json', '*.md'],
      options: { tabWidth: 2, useTabs: false },
    },
    {
      files: ['Cargo.toml', '*.toml'],
      options: { parser: 'toml', tabWidth: 2 },
    },
  ],
}
