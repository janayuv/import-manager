# MCP Quality Check Tools - Cursor Integration Guide

## 🎯 Overview

The MCP (Model Context Protocol) quality check server has been successfully integrated with Cursor. This server provides automated code quality checks, type safety validation, test execution, and backend logic analysis for the Import Manager project.

## ✅ Integration Status

- ✅ MCP server configured in Cursor (`c:\Users\Yogeswari\.cursor\mcp.json`)
- ✅ Server file: `D:\Import-Manager\working-mcp-server.js`
- ✅ All 5 quality check tools available
- ✅ Server tested and working correctly

## 🛠️ Available Tools

### 1. `lint_code` - ESLint Code Quality Checks
**Purpose**: Runs ESLint to check code style and potential issues

**Parameters**:
- `files` (optional): Array of specific files to lint
- `fix` (optional): Automatically fix auto-fixable issues (default: false)

**Usage in Cursor**:
```
mcp quality-check lint_code
mcp quality-check lint_code --files src/pages/item.tsx
mcp quality-check lint_code --fix
```

**Returns**: Structured JSON with file, line, severity, and message for each issue

### 2. `type_check` - TypeScript Type Safety
**Purpose**: Runs TypeScript compiler for type safety checks

**Parameters**:
- `strict` (optional): Run in strict mode (default: true)
- `project` (optional): TypeScript project file (default: 'tsconfig.json')

**Usage in Cursor**:
```
mcp quality-check type_check
mcp quality-check type_check --strict false
mcp quality-check type_check --project tsconfig.strict.json
```

**Returns**: Type errors and warnings with file locations and error codes

### 3. `run_tests` - Unit and Integration Tests
**Purpose**: Runs unit and integration tests

**Parameters**:
- `type` (optional): Test type - 'unit', 'integration', 'e2e', or 'all' (default: 'all')
- `coverage` (optional): Generate coverage report (default: false)
- `watch` (optional): Run tests in watch mode (default: false)

**Usage in Cursor**:
```
mcp quality-check run_tests
mcp quality-check run_tests --type unit
mcp quality-check run_tests --type e2e --watch
mcp quality-check run_tests --coverage
```

**Returns**: Test results with pass/fail status and coverage information

### 4. `check_quality` - Comprehensive Quality Analysis
**Purpose**: Runs comprehensive code quality analysis (beta)

**Parameters**:
- `include_security` (optional): Include security analysis (default: true)
- `include_complexity` (optional): Include complexity analysis (default: true)
- `include_maintainability` (optional): Include maintainability analysis (default: true)

**Usage in Cursor**:
```
mcp quality-check check_quality
mcp quality-check check_quality --include_security false
mcp quality-check check_quality --include_complexity false --include_maintainability false
```

**Returns**: Security vulnerabilities, complexity metrics, and maintainability scores

### 5. `check_backend_logic` - Backend Logic Validation
**Purpose**: Runs backend logic and API validation checks (beta)

**Parameters**:
- `check_database` (optional): Check database migrations and schema (default: true)
- `check_api_endpoints` (optional): Check API endpoint definitions (default: true)
- `check_business_logic` (optional): Check business logic implementation (default: true)

**Usage in Cursor**:
```
mcp quality-check check_backend_logic
mcp quality-check check_backend_logic --check_database false
mcp quality-check check_backend_logic --check_api_endpoints false --check_business_logic false
```

**Returns**: Database issues, API endpoint problems, and business logic concerns

## 🚀 Getting Started

### Step 1: Restart Cursor
After the MCP configuration was updated, restart Cursor to load the new quality-check server.

### Step 2: Verify Integration
In Cursor, try running:
```
mcp quality-check lint_code
```

You should see a response with linting results or a message indicating no issues found.

### Step 3: Run Quality Checks
Start with basic checks and gradually use more advanced features:

1. **Basic Code Quality**:
   ```
   mcp quality-check lint_code
   mcp quality-check type_check
   ```

2. **Test Execution**:
   ```
   mcp quality-check run_tests --type unit
   ```

3. **Comprehensive Analysis**:
   ```
   mcp quality-check check_quality
   mcp quality-check check_backend_logic
   ```

## 📋 Quality Check Workflow

### Pre-commit Checks
Before committing code, run these checks:

1. **Lint and Type Check**:
   ```
   mcp quality-check lint_code --fix
   mcp quality-check type_check
   ```

2. **Run Tests**:
   ```
   mcp quality-check run_tests --type unit
   ```

3. **Security Scan**:
   ```
   mcp quality-check check_quality --include_complexity false --include_maintainability false
   ```

### Continuous Integration
These tools can be integrated into CI/CD pipelines:

- Run all quality checks before merging
- Block merges if critical issues are found
- Generate quality reports for monitoring

## 🔧 Troubleshooting

### Issue: "MCP server not found"
**Solution**: Verify the server path in `c:\Users\Yogeswari\.cursor\mcp.json`:
```json
"quality-check": {
  "command": "node",
  "args": ["D:/Import-Manager/working-mcp-server.js"],
  "env": {}
}
```

### Issue: "Server startup failed"
**Solution**: Check if Node.js is available and the server file exists:
```bash
node --version
ls working-mcp-server.js
```

### Issue: "Tools not responding"
**Solution**: Restart Cursor and try again. The server may need time to initialize.

### Issue: "Permission denied"
**Solution**: Ensure the server file has execute permissions:
```bash
chmod +x working-mcp-server.js
```

## 📊 Expected Output Format

All tools return structured JSON responses with:

```json
{
  "tool": "tool_name",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "summary": {
    "total_issues": 0,
    "errors": 0,
    "warnings": 0
  },
  "issues": [
    {
      "file": "src/pages/item.tsx",
      "line": 10,
      "column": 5,
      "severity": "error",
      "message": "Description of the issue"
    }
  ]
}
```

## 🎯 Best Practices

1. **Regular Checks**: Run quality checks frequently during development
2. **Fix Issues Promptly**: Address errors and warnings as they appear
3. **Use Auto-fix**: Enable `--fix` flag for linting when possible
4. **Monitor Trends**: Track quality metrics over time
5. **Team Integration**: Share quality reports with the team

## 🔄 Updates and Maintenance

The MCP server is located at `D:\Import-Manager\working-mcp-server.js`. To update:

1. Modify the server code
2. Test with `node test-mcp-integration.js`
3. Restart Cursor to load changes

## 📞 Support

If you encounter issues:

1. Check the troubleshooting section above
2. Run the integration test: `node test-mcp-integration.js`
3. Review server logs for detailed error messages
4. Verify Cursor's MCP configuration

---

**Note**: The quality check tools are designed to help maintain code quality and catch issues early. They complement but don't replace manual code review and testing practices.
