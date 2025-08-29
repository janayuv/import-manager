# MCP Server for Code & Backend Quality Checks

This MCP (Model Context Protocol) server provides comprehensive quality checking tools for the Import Manager project. It integrates with Cursor to automatically detect code errors, logic bugs, and quality issues.

## 🎯 Features

### Core Quality Tools

1. **`lint_code`** - ESLint-based code quality checks
   - Detects syntax errors, style violations, and potential bugs
   - Supports auto-fixing of common issues
   - Configurable file targeting

2. **`type_check`** - TypeScript type safety validation
   - Ensures type safety across the codebase
   - Supports strict mode checking
   - Configurable project file targeting

3. **`run_tests`** - Test execution and validation
   - Runs unit tests (Vitest)
   - Runs E2E tests (Playwright)
   - Supports coverage reporting
   - Watch mode for development

4. **`check_quality`** - Comprehensive code quality analysis
   - Security vulnerability detection
   - Code complexity analysis
   - Maintainability assessment
   - Dependency analysis

5. **`check_backend_logic`** - Backend-specific validation
   - Database migration validation
   - API endpoint analysis
   - Business logic verification
   - Tauri command validation

## 🚀 Installation

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Cursor IDE with MCP support

### Setup Steps

1. **Install MCP Server Dependencies**
   ```bash
   # Copy the package.json to your project
   cp mcp-server-quality-package.json package-mcp-quality.json
   
   # Install dependencies
   npm install --package-lock-only --prefix ./
   ```

2. **Make Server Executable**
   ```bash
   chmod +x mcp-server-quality.js
   ```

3. **Configure Cursor**
   
   Add the MCP server to your Cursor configuration:
   
   ```json
   {
     "mcpServers": {
       "quality-check": {
         "command": "node",
         "args": ["mcp-server-quality.js"],
         "env": {}
       }
     }
   }
   ```

## 📋 Usage

### Tool Parameters

#### `lint_code`
```json
{
  "files": ["src/components/", "src/pages/"],
  "fix": true
}
```

#### `type_check`
```json
{
  "strict": true,
  "project": "tsconfig.json"
}
```

#### `run_tests`
```json
{
  "type": "all",
  "coverage": true,
  "watch": false
}
```

#### `check_quality`
```json
{
  "include_security": true,
  "include_complexity": true,
  "include_maintainability": true
}
```

#### `check_backend_logic`
```json
{
  "check_database": true,
  "check_api_endpoints": true,
  "check_business_logic": true
}
```

### Integration with Development Workflow

#### Pre-commit Checks
```bash
# Run all quality checks before committing
cursor mcp quality-check check_quality
cursor mcp quality-check type_check
cursor mcp quality-check lint_code
```

#### CI/CD Integration
```bash
# Run tests in CI environment
cursor mcp quality-check run_tests --type=all --coverage=true
```

#### Development Mode
```bash
# Run tests in watch mode during development
cursor mcp quality-check run_tests --type=unit --watch=true
```

## 🔧 Configuration

### ESLint Configuration
The server uses your existing `eslint.config.js` configuration. Ensure it includes:

```javascript
// Example ESLint config for the project
export default tseslint.config([
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
    ],
    rules: {
      'prettier/prettier': 'error',
      // Add your custom rules here
    },
  },
])
```

### TypeScript Configuration
Ensure your `tsconfig.json` includes strict mode:

```json
{
  "compilerOptions": {
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

### Test Configuration
The server supports both Vitest and Playwright:

- **Vitest**: Uses `vitest.config.ts`
- **Playwright**: Uses `playwright.config.ts`

## 📊 Output Format

All tools return structured JSON output with the following format:

```json
{
  "tool": "tool_name",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "summary": {
    "total_issues": 5,
    "errors": 2,
    "warnings": 3,
    "passed": true
  },
  "issues": [
    {
      "file": "src/components/example.tsx",
      "line": 42,
      "column": 15,
      "severity": "error",
      "message": "Type 'string' is not assignable to type 'number'",
      "rule": "typescript"
    }
  ]
}
```

## 🛡️ Security Features

### Security Analysis
- Hardcoded secret detection
- Dependency vulnerability scanning
- SQL injection pattern detection
- Input validation analysis

### Best Practices
- Environment variable usage validation
- Authentication pattern checking
- Authorization logic verification
- Secure coding guideline enforcement

## 🔍 Quality Metrics

### Code Complexity
- Cyclomatic complexity analysis
- Function length monitoring
- Nesting depth checking
- Cognitive complexity assessment

### Maintainability
- Documentation coverage
- Code duplication detection
- Dependency management
- Technical debt identification

### Performance
- Bundle size analysis
- Database query optimization
- Memory usage patterns
- Runtime performance monitoring

## 🚨 Error Handling

The server provides comprehensive error handling:

- **Tool Execution Errors**: Detailed error messages with context
- **Configuration Errors**: Clear guidance on fixing configuration issues
- **Dependency Errors**: Helpful suggestions for missing dependencies
- **Permission Errors**: Guidance on file system permissions

## 🔄 Continuous Integration

### GitHub Actions Example
```yaml
name: Quality Checks
on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run quality checks
        run: |
          node mcp-server-quality.js type_check
          node mcp-server-quality.js lint_code
          node mcp-server-quality.js run_tests
```

## 🛠️ Troubleshooting

### Common Issues

1. **MCP Server Not Starting**
   - Check Node.js version (requires 18+)
   - Verify file permissions
   - Check for missing dependencies

2. **Tool Execution Failures**
   - Verify project configuration files exist
   - Check for required dependencies
   - Review error messages for specific guidance

3. **Performance Issues**
   - Use file targeting to limit scope
   - Enable caching where available
   - Consider incremental analysis

### Debug Mode
Enable debug logging by setting the environment variable:
```bash
DEBUG=mcp-server-quality node mcp-server-quality.js
```

## 📈 Metrics and Reporting

### Quality Dashboard
The server can generate quality reports including:

- Code quality trends over time
- Test coverage metrics
- Security vulnerability tracking
- Performance benchmarks

### Custom Reports
Extend the server to generate custom reports:

```javascript
// Example: Custom report generation
const customReport = {
  timestamp: new Date().toISOString(),
  metrics: {
    codeQuality: calculateQualityScore(),
    testCoverage: getTestCoverage(),
    securityScore: getSecurityScore(),
  },
  recommendations: generateRecommendations(),
}
```

## 🤝 Contributing

### Adding New Tools
To add a new quality check tool:

1. Define the tool schema in `setupTools()`
2. Implement the tool handler method
3. Add appropriate error handling
4. Update documentation

### Extending Existing Tools
Each tool can be extended with:

- Additional configuration options
- Custom analysis rules
- Integration with external tools
- Custom output formats

## 📚 API Reference

### Server Methods

#### `lintCode(args)`
Runs ESLint analysis on specified files.

#### `typeCheck(args)`
Performs TypeScript type checking.

#### `runTests(args)`
Executes test suites with specified options.

#### `checkQuality(args)`
Performs comprehensive quality analysis.

#### `checkBackendLogic(args)`
Validates backend implementation and logic.

### Helper Methods

#### `executeCommand(command, args)`
Executes shell commands with proper error handling.

#### `analyzeSecurity(projectRoot)`
Performs security vulnerability analysis.

#### `analyzeComplexity(projectRoot)`
Analyzes code complexity metrics.

#### `analyzeMaintainability(projectRoot)`
Assesses code maintainability factors.

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

For issues and questions:

1. Check the troubleshooting section
2. Review the error messages for guidance
3. Check the project documentation
4. Create an issue with detailed information

---

**Note**: This MCP server is specifically designed for the Import Manager project and may require customization for other projects.
