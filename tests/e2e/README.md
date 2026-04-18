# End-to-End Testing Setup

This directory contains comprehensive end-to-end tests for the Import Manager application using Playwright.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ installed
- Application dependencies installed (`npm install`)

### Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run tests with UI (interactive mode)
npm run test:e2e:ui

# Run tests in headed mode (see browser)
npm run test:e2e:headed

# Run tests in debug mode
npm run test:e2e:debug

# View test report
npm run test:e2e:report
```

## 📁 Test Structure

```
tests/e2e/
├── pages/                 # Page Object Models
│   ├── dashboard-page.ts
│   └── expenses-page.ts
├── utils/                 # Test utilities and helpers
│   └── test-utils.ts
├── fixtures/              # Test data files
│   ├── sample-expenses.csv
│   └── invalid-file.txt
├── dashboard.spec.ts      # Dashboard tests
├── expenses.spec.ts       # Expenses module tests
├── user-workflow.spec.ts  # Complete workflow tests
└── README.md             # This file
```

## 🧪 Test Categories

### 1. Dashboard Tests (`dashboard.spec.ts`)

- Dashboard loading and navigation
- Stats cards functionality
- Chart interactions
- Filter changes
- Module navigation

### 2. Expenses Module Tests (`expenses.spec.ts`)

- Expense management workflow
- Import/Export functionality
- Form validation
- Table operations
- Error handling

### 3. Complete User Workflow Tests (`user-workflow.spec.ts`)

- End-to-end user journeys
- Cross-module navigation
- Data persistence
- Error scenarios
- Responsive behavior

## 🛠️ Test Utilities

### TestUtils Class

Provides common testing operations:

- `waitForAppLoad()` - Wait for app to fully load
- `login()` - Login to application
- `navigateTo()` - Navigate to specific pages
- `waitForToast()` - Wait for toast notifications
- `fillField()` - Fill form fields with validation
- `selectOption()` - Select dropdown options
- `uploadFile()` - Upload files
- `expectVisible()` - Check element visibility
- `expectContainsText()` - Check text content
- `waitForTableData()` - Wait for table data to load
- `getTableRowCount()` - Get table row count
- `clickTableRow()` - Click on table rows
- `confirmDialog()` / `cancelDialog()` - Handle dialogs

## 📊 Test Data

### Sample Files

- `sample-expenses.csv` - Valid expense data for import testing
- `invalid-file.txt` - Invalid file for error handling tests

## 🔧 Configuration

### Playwright Config (`playwright.config.ts`)

- **Base URL**: `http://localhost:1420` (Tauri dev server)
- **Test Directory**: `./tests/e2e`
- **Browsers**: Chromium, Firefox, WebKit
- **Reports**: HTML, JSON, JUnit XML
- **Screenshots**: On failure
- **Videos**: On failure
- **Traces**: On first retry

### Environment Variables

- `CI` - Enables CI-specific settings (retries, single worker)
- `DEBUG` - Enables debug mode

## 🎯 Test Coverage

### Core Functionality

- ✅ User authentication
- ✅ Dashboard analytics
- ✅ Expense management
- ✅ Import/Export operations
- ✅ Navigation between modules
- ✅ Form validation
- ✅ Error handling
- ✅ Responsive design

### User Workflows

- ✅ Complete expense management cycle
- ✅ File import workflow
- ✅ Data export workflow
- ✅ Cross-module navigation
- ✅ Error recovery

## 🚨 Troubleshooting

### Common Issues

1. **Tests fail with "Connection refused"**
   - Ensure dev server is running: `npm run dev`
   - Check if port 1420 is available

2. **Login fails**
   - Verify default credentials in `test-utils.ts`
   - Check if authentication is properly configured

3. **File upload tests fail**
   - Ensure test fixtures exist in `fixtures/` directory
   - Check file paths are correct for your OS

4. **Tests timeout**
   - Increase timeout in `playwright.config.ts`
   - Check for slow network or system resources

### Debug Mode

```bash
npm run test:e2e:debug
```

This opens Playwright Inspector for step-by-step debugging.

### View Test Results

```bash
npm run test:e2e:report
```

Opens HTML report with detailed test results, screenshots, and videos.

## 📝 Adding New Tests

### 1. Create Page Object (if needed)

```typescript
// tests/e2e/pages/new-module-page.ts
import { Page } from '@playwright/test'
import { TestUtils } from '../utils/test-utils'

export class NewModulePage {
  private utils: TestUtils

  constructor(private page: Page) {
    this.utils = new TestUtils(page)
  }

  async goto() {
    await this.utils.navigateTo('/new-module')
  }

  async expectLoaded() {
    await this.utils.expectVisible('h1:has-text("New Module")')
  }
}
```

### 2. Create Test File

```typescript
// tests/e2e/new-module.spec.ts
import { test, expect } from '@playwright/test'
import { NewModulePage } from './pages/new-module-page'
import { TestUtils } from './utils/test-utils'

test.describe('New Module', () => {
  let newModulePage: NewModulePage
  let utils: TestUtils

  test.beforeEach(async ({ page }) => {
    newModulePage = new NewModulePage(page)
    utils = new TestUtils(page)
    await utils.login()
  })

  test('should load new module', async ({ page }) => {
    await newModulePage.goto()
    await newModulePage.expectLoaded()
  })
})
```

### 3. Add Test Data (if needed)

Create sample files in `fixtures/` directory for testing.

## 🔄 Continuous Integration

### GitHub Actions Example

```yaml
name: E2E Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run build
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

## 📈 Best Practices

1. **Use Page Objects** - Keep tests maintainable and reusable
2. **Test User Workflows** - Focus on real user scenarios
3. **Handle Async Operations** - Use proper waits and timeouts
4. **Test Error Scenarios** - Ensure graceful error handling
5. **Keep Tests Independent** - Each test should be self-contained
6. **Use Meaningful Assertions** - Test behavior, not implementation
7. **Maintain Test Data** - Keep fixtures up to date

## 🤝 Contributing

When adding new tests:

1. Follow existing patterns and structure
2. Add appropriate test data
3. Update this README if needed
4. Ensure tests pass in CI environment
5. Add meaningful test descriptions
