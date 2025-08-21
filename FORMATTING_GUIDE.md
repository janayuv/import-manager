# Code Formatting Guide

This document outlines the code formatting setup and best practices for the Import Manager project.

## 🎯 Overview

The project uses **Prettier** for consistent code formatting across all files. This ensures:
- Consistent code style across the entire codebase
- Automatic formatting on save (when configured)
- CI/CD enforcement of formatting standards
- Reduced code review time spent on formatting issues

## 📋 Available Commands

### For Developers

```bash
# Format all files in the project
npm run format

# Check if files are properly formatted (fails if not)
npm run format:check

# Format and fix all files (alias for format)
npm run format:fix
```

### For CI/CD

```bash
# Used in GitHub Actions to verify formatting
npm run format:check
```

## 🔧 Configuration

### Prettier Configuration (`prettier.config.cjs`)

```javascript
module.exports = {
  semi: false,                    // No semicolons
  singleQuote: true,              // Use single quotes
  printWidth: 100,                // Line length limit
  tabWidth: 2,                    // Indentation size
  trailingComma: 'es5',           // Trailing commas where valid in ES5
  bracketSpacing: true,           // Spaces in object literals
  arrowParens: 'always',          // Always use parentheses for arrow functions
  endOfLine: 'lf',                // Unix line endings
  plugins: ['prettier-plugin-tailwindcss'], // Tailwind class sorting
}
```

### Ignored Files (`.prettierignore`)

The following files and directories are ignored by Prettier:

- **Dependencies**: `node_modules/`, `package-lock.json`, etc.
- **Build artifacts**: `dist/`, `build/`, `src-tauri/target/`
- **Generated files**: `*.min.js`, `*.bundle.js`, etc.
- **Documentation**: `*.md` (except `src/**/*.md`)
- **Config files**: `.eslintrc*`, `.prettierrc*`, etc.
- **Test results**: `test-results/`, `playwright-report/`, `coverage/`

## 🚀 GitHub Actions Integration

### CI Pipeline

The main CI pipeline (`ci.yml`) includes a formatting check:

```yaml
- name: Run Prettier check
  run: npm run format:check
```

This step will fail the build if any files are not properly formatted.

### Auto-Formatting Workflow

A separate workflow (`format.yml`) is available for automatic formatting:

- **Manual trigger**: Can be run manually from GitHub Actions
- **PR trigger**: Automatically runs on pull requests
- **Auto-commit**: Commits formatting changes back to the branch

## 💻 Editor Setup

### VS Code

1. Install the Prettier extension
2. Enable "Format on Save" in settings
3. Set Prettier as the default formatter

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

### Other Editors

- **WebStorm**: Enable Prettier in Settings → Languages & Frameworks → JavaScript → Prettier
- **Vim/Neovim**: Use `prettier-vim` plugin
- **Sublime Text**: Use `JsPrettier` package

## 🔄 Pre-commit Hooks

The project uses `husky` and `lint-staged` to automatically format files before commits:

```json
{
  "lint-staged": {
    "*.{ts,tsx,js,jsx,css,html,md,json}": [
      "prettier --write"
    ],
    "src/**/*.{ts,tsx,js,jsx}": [
      "eslint --fix"
    ]
  }
}
```

This ensures that:
- All staged files are formatted before commit
- ESLint fixes are applied automatically
- Commits never contain formatting issues

## 📁 File Types Supported

Prettier formats the following file types:

- **TypeScript**: `.ts`, `.tsx`
- **JavaScript**: `.js`, `.jsx`
- **CSS**: `.css`
- **HTML**: `.html`
- **Markdown**: `.md` (in `src/` directory only)
- **JSON**: `.json`

## 🎨 Tailwind CSS Integration

The project includes `prettier-plugin-tailwindcss` which:

- Automatically sorts Tailwind CSS classes
- Maintains consistent class ordering
- Reduces class conflicts
- Improves readability

Example:
```tsx
// Before
<div className="flex p-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600">

// After (automatically sorted)
<div className="flex rounded-lg bg-blue-500 p-4 text-white hover:bg-blue-600">
```

## 🚨 Troubleshooting

### Common Issues

1. **Format check fails in CI**
   - Run `npm run format` locally
   - Commit the changes
   - Push to trigger CI again

2. **Editor not formatting on save**
   - Check if Prettier extension is installed
   - Verify "Format on Save" is enabled
   - Ensure Prettier is set as default formatter

3. **Conflicts with ESLint**
   - The project uses `eslint-config-prettier` to disable conflicting rules
   - ESLint handles code quality, Prettier handles formatting

### Manual Formatting

If automatic formatting isn't working:

```bash
# Format a specific file
npx prettier --write src/components/MyComponent.tsx

# Format a specific directory
npx prettier --write src/components/

# Check formatting without changing files
npx prettier --check src/
```

## 📚 Best Practices

### For Developers

1. **Always run formatting before committing**
   ```bash
   npm run format
   git add .
   git commit -m "feat: add new feature"
   ```

2. **Use the pre-commit hooks**
   - They automatically format your code
   - No need to remember to run formatting manually

3. **Check formatting in CI**
   - The CI pipeline will catch any formatting issues
   - Fix them locally and push again

### For Code Reviews

1. **Don't review formatting**
   - Prettier handles all formatting automatically
   - Focus on logic, architecture, and business requirements

2. **Use the auto-format workflow**
   - If formatting issues are found, use the GitHub Actions workflow
   - It will automatically fix and commit the changes

### For Team Leads

1. **Enforce formatting in CI**
   - The current setup already does this
   - No additional configuration needed

2. **Document the setup**
   - This guide serves as the reference
   - Share with new team members

## 🔄 Migration Guide

If you're migrating from a project without Prettier:

1. **Install dependencies** (already done)
2. **Configure your editor** (see Editor Setup section)
3. **Format existing code**:
   ```bash
   npm run format
   ```
4. **Commit the formatting changes**
5. **Enable pre-commit hooks** (already configured)

## 📖 Additional Resources

- [Prettier Documentation](https://prettier.io/docs/en/)
- [Prettier Configuration](https://prettier.io/docs/en/configuration.html)
- [Tailwind CSS Prettier Plugin](https://github.com/tailwindlabs/prettier-plugin-tailwindcss)
- [VS Code Prettier Extension](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

---

**Note**: This formatting setup is designed to be unobtrusive and automatic. Once configured, you should rarely need to think about code formatting - it just works!
