#!/usr/bin/env node

/**
 * MCP Server for Code & Backend Quality Checks
 * Compatible with MCP SDK v0.4.0+
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { spawn, execSync } from 'child_process';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

class QualityCheckServer {
  constructor() {
    this.server = new Server(
      {
        name: 'quality-check-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupTools();
  }

  setupTools() {
    // Register tools list handler
    this.server.setRequestHandler('tools/list', async () => {
      return {
        tools: [
          {
            name: 'lint_code',
            description: 'Runs ESLint for frontend code quality checks',
            inputSchema: {
              type: 'object',
              properties: {
                files: {
                  type: 'array',
                  items: { type: 'string' },
                  description:
                    'Specific files to lint (optional, defaults to all)',
                },
                fix: {
                  type: 'boolean',
                  description: 'Automatically fix auto-fixable issues',
                  default: false,
                },
              },
            },
          },
          {
            name: 'type_check',
            description: 'Runs TypeScript compiler for type safety checks',
            inputSchema: {
              type: 'object',
              properties: {
                strict: {
                  type: 'boolean',
                  description: 'Run in strict mode',
                  default: true,
                },
                project: {
                  type: 'string',
                  description: 'TypeScript project file to check',
                  default: 'tsconfig.json',
                },
              },
            },
          },
          {
            name: 'run_tests',
            description: 'Runs unit and integration tests',
            inputSchema: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['unit', 'integration', 'e2e', 'all'],
                  description: 'Type of tests to run',
                  default: 'all',
                },
                coverage: {
                  type: 'boolean',
                  description: 'Generate coverage report',
                  default: false,
                },
                watch: {
                  type: 'boolean',
                  description: 'Run tests in watch mode',
                  default: false,
                },
              },
            },
          },
          {
            name: 'check_quality',
            description: 'Runs comprehensive code quality analysis (beta)',
            inputSchema: {
              type: 'object',
              properties: {
                include_security: {
                  type: 'boolean',
                  description: 'Include security analysis',
                  default: true,
                },
                include_complexity: {
                  type: 'boolean',
                  description: 'Include complexity analysis (beta)',
                  default: true,
                },
                include_maintainability: {
                  type: 'boolean',
                  description: 'Include maintainability analysis (beta)',
                  default: true,
                },
              },
            },
          },
          {
            name: 'check_backend_logic',
            description: 'Runs backend logic and API validation checks (beta)',
            inputSchema: {
              type: 'object',
              properties: {
                check_database: {
                  type: 'boolean',
                  description: 'Check database migrations and schema',
                  default: true,
                },
                check_api_endpoints: {
                  type: 'boolean',
                  description: 'Check API endpoint definitions (beta)',
                  default: true,
                },
                check_business_logic: {
                  type: 'boolean',
                  description: 'Check business logic implementation (beta)',
                  default: true,
                },
              },
            },
          },
        ],
      };
    });

    // Register tool call handler
    this.server.setRequestHandler('tools/call', async request => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'lint_code':
            return await this.lintCode(args);
          case 'type_check':
            return await this.typeCheck(args);
          case 'run_tests':
            return await this.runTests(args);
          case 'check_quality':
            return await this.checkQuality(args);
          case 'check_backend_logic':
            return await this.checkBackendLogic(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error executing ${name}: ${error.message}\nStack: ${error.stack || 'No stack trace available'}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async lintCode(args) {
    const { files = [], fix = false } = args;
    const projectRoot = process.cwd();

    try {
      // Check if ESLint config exists
      const eslintConfig = join(projectRoot, 'eslint.config.js');
      if (!existsSync(eslintConfig)) {
        throw new Error('ESLint configuration not found');
      }

      // Build ESLint command
      const eslintArgs = ['--format=json'];
      if (fix) {
        eslintArgs.push('--fix');
      }
      if (files.length > 0) {
        eslintArgs.push(...files);
      } else {
        eslintArgs.push('.');
      }

      const result = await this.executeCommand('npx', [
        'eslint',
        ...eslintArgs,
      ]);

      if (result.exitCode !== 0 && result.exitCode !== 1) {
        throw new Error(`ESLint failed with exit code ${result.exitCode}`);
      }

      // Parse ESLint output
      const lintResults = JSON.parse(result.stdout || '[]');
      const issues = [];

      for (const file of lintResults) {
        for (const message of file.messages) {
          issues.push({
            file: file.filePath,
            line: message.line,
            column: message.column,
            severity: message.severity === 2 ? 'error' : 'warning',
            message: message.message,
            rule: message.ruleId,
          });
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                tool: 'lint_code',
                timestamp: new Date().toISOString(),
                summary: {
                  total_files: lintResults.length,
                  total_issues: issues.length,
                  errors: issues.filter(i => i.severity === 'error').length,
                  warnings: issues.filter(i => i.severity === 'warning').length,
                  fixed: fix ? 'auto-fix applied' : 'no auto-fix',
                },
                issues,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Lint check failed: ${error.message}`);
    }
  }

  async typeCheck(args) {
    const { strict = true, project = 'tsconfig.json' } = args;
    const projectRoot = process.cwd();

    try {
      // Check if TypeScript config exists
      const tsConfig = join(projectRoot, project);
      if (!existsSync(tsConfig)) {
        throw new Error(`TypeScript configuration not found: ${project}`);
      }

      // Build TypeScript command
      const tscArgs = ['--noEmit', '--project', project];
      if (strict) {
        tscArgs.push('--strict');
      }

      const result = await this.executeCommand('npx', ['tsc', ...tscArgs]);

      // Parse TypeScript output
      const issues = [];
      const lines = result.stderr.split('\n').filter(line => line.trim());

      for (const line of lines) {
        // Parse TypeScript error format: file(line,col): error TS1234: message
        const match = line.match(
          /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/
        );
        if (match) {
          issues.push({
            file: match[1],
            line: parseInt(match[2]),
            column: parseInt(match[3]),
            severity: match[4],
            code: match[5],
            message: match[6],
          });
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                tool: 'type_check',
                timestamp: new Date().toISOString(),
                summary: {
                  exit_code: result.exitCode,
                  total_issues: issues.length,
                  errors: issues.filter(i => i.severity === 'error').length,
                  warnings: issues.filter(i => i.severity === 'warning').length,
                  strict_mode: strict,
                  project_file: project,
                },
                issues,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Type check failed: ${error.message}`);
    }
  }

  async runTests(args) {
    const { type = 'all', coverage = false, watch = false } = args;
    const projectRoot = process.cwd();

    try {
      let testResults = [];

      if (type === 'all' || type === 'unit') {
        // Run Vitest unit tests
        const vitestArgs = [];

        if (watch) {
          vitestArgs.push('--watch');
        } else {
          vitestArgs.push('run');
        }

        if (coverage) {
          vitestArgs.push('--coverage');
        }

        const vitestResult = await this.executeCommand('npm', [
          'run',
          'test',
          '--',
          ...vitestArgs,
        ]);
        testResults.push({
          type: 'unit',
          framework: 'vitest',
          exit_code: vitestResult.exitCode,
          output: vitestResult.stdout,
          error: vitestResult.stderr,
        });
      }

      if (type === 'all' || type === 'e2e') {
        // Run Playwright E2E tests
        const playwrightArgs = [];

        if (watch) {
          playwrightArgs.push('--ui');
        } else {
          playwrightArgs.push('test');
        }

        const playwrightResult = await this.executeCommand('npx', [
          'playwright',
          ...playwrightArgs,
        ]);
        testResults.push({
          type: 'e2e',
          framework: 'playwright',
          exit_code: playwrightResult.exitCode,
          output: playwrightResult.stdout,
          error: playwrightResult.stderr,
        });
      }

      // Parse test results
      const summary = {
        total_tests: testResults.length,
        passed: testResults.filter(r => r.exit_code === 0).length,
        failed: testResults.filter(r => r.exit_code !== 0).length,
        coverage_enabled: coverage,
        watch_mode: watch,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                tool: 'run_tests',
                timestamp: new Date().toISOString(),
                summary,
                results: testResults,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Test execution failed: ${error.message}`);
    }
  }

  async checkQuality(args) {
    const {
      include_security = true,
      include_complexity = true,
      include_maintainability = true,
    } = args;

    try {
      const results = {
        tool: 'check_quality',
        timestamp: new Date().toISOString(),
        summary: {
          security_issues: 0,
          complexity_score: 0,
          maintainability_score: 0,
          total_issues: 0,
        },
        details: {},
      };

      if (include_security) {
        const securityResult = await this.analyzeSecurity();
        results.details.security = securityResult;
        results.summary.security_issues = securityResult.issues.length;
        results.summary.total_issues += securityResult.issues.length;
      }

      if (include_complexity) {
        const complexityResult = await this.analyzeComplexity();
        results.details.complexity = complexityResult;
        results.summary.complexity_score = complexityResult.score;
      }

      if (include_maintainability) {
        const maintainabilityResult = await this.analyzeMaintainability();
        results.details.maintainability = maintainabilityResult;
        results.summary.maintainability_score = maintainabilityResult.score;
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Quality check failed: ${error.message}`);
    }
  }

  async checkBackendLogic(args) {
    const {
      check_database = true,
      check_api_endpoints = true,
      check_business_logic = true,
    } = args;

    try {
      const results = {
        tool: 'check_backend_logic',
        timestamp: new Date().toISOString(),
        summary: {
          database_issues: 0,
          api_issues: 0,
          business_logic_issues: 0,
          total_issues: 0,
        },
        details: {},
      };

      if (check_database) {
        const dbResult = await this.checkDatabaseLogic();
        results.details.database = dbResult;
        results.summary.database_issues = dbResult.issues.length;
        results.summary.total_issues += dbResult.issues.length;
      }

      if (check_api_endpoints) {
        const apiResult = await this.checkApiEndpoints();
        results.details.api = apiResult;
        results.summary.api_issues = apiResult.issues.length;
        results.summary.total_issues += apiResult.issues.length;
      }

      if (check_business_logic) {
        const logicResult = await this.checkBusinessLogic();
        results.details.business_logic = logicResult;
        results.summary.business_logic_issues = logicResult.issues.length;
        results.summary.total_issues += logicResult.issues.length;
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Backend logic check failed: ${error.message}`);
    }
  }

  async analyzeSecurity() {
    const issues = [];
    const projectRoot = process.cwd();

    try {
      // Check for common security patterns
      const secretPatterns = [
        /api_key\s*[:=]\s*['"][^'"]+['"]/gi,
        /password\s*[:=]\s*['"][^'"]+['"]/gi,
        /secret\s*[:=]\s*['"][^'"]+['"]/gi,
        /token\s*[:=]\s*['"][^'"]+['"]/gi,
        /private_key\s*[:=]\s*['"][^'"]+['"]/gi,
      ];

      // Check package.json for vulnerabilities
      try {
        const auditResult = await this.executeCommand('npm', [
          'audit',
          '--json',
        ]);
        const auditData = JSON.parse(auditResult.stdout || '{}');

        if (auditData.vulnerabilities) {
          Object.entries(auditData.vulnerabilities).forEach(([pkg, vuln]) => {
            issues.push({
              type: 'vulnerability',
              severity: 'high',
              message: `Vulnerability in ${pkg}: ${vuln.title}`,
              details: vuln,
            });
          });
        }
      } catch (error) {
        issues.push({
          type: 'audit_error',
          severity: 'medium',
          message: `Failed to run npm audit: ${error.message}`,
        });
      }

      // Check for hardcoded secrets in source files
      const sourceFiles = ['package.json', 'Cargo.toml'];
      for (const file of sourceFiles) {
        const filePath = join(projectRoot, file);
        if (existsSync(filePath)) {
          try {
            const content = readFileSync(filePath, 'utf8');
            secretPatterns.forEach((pattern, index) => {
              const matches = content.match(pattern);
              if (matches) {
                issues.push({
                  type: 'hardcoded_secret',
                  severity: 'high',
                  file,
                  message: `Potential hardcoded secret found in ${file}`,
                  pattern: pattern.toString(),
                });
              }
            });
          } catch (error) {
            issues.push({
              type: 'file_read_error',
              severity: 'low',
              file,
              message: `Failed to read ${file}: ${error.message}`,
            });
          }
        }
      }

      return {
        issues,
        summary: {
          total_issues: issues.length,
          high_severity: issues.filter(i => i.severity === 'high').length,
          medium_severity: issues.filter(i => i.severity === 'medium').length,
          low_severity: issues.filter(i => i.severity === 'low').length,
        },
      };
    } catch (error) {
      return {
        issues: [
          {
            type: 'analysis_error',
            severity: 'medium',
            message: `Security analysis failed: ${error.message}`,
          },
        ],
        summary: {
          total_issues: 1,
          high_severity: 0,
          medium_severity: 1,
          low_severity: 0,
        },
      };
    }
  }

  async analyzeComplexity() {
    try {
      const projectRoot = process.cwd();
      const sourceFiles = [
        'src/**/*.ts',
        'src/**/*.tsx',
        'src-tauri/src/**/*.rs',
      ];
      let totalFunctions = 0;
      let totalLines = 0;

      // Basic complexity analysis
      for (const pattern of sourceFiles) {
        try {
          // This is a simplified analysis - in production, you'd use a proper complexity analyzer
          const files = this.globFiles(pattern, projectRoot);
          for (const file of files.slice(0, 10)) {
            // Limit to first 10 files for performance
            if (existsSync(file)) {
              const content = readFileSync(file, 'utf8');
              const lines = content.split('\n').length;
              const functions = (
                content.match(
                  /function\s+\w+|const\s+\w+\s*=\s*\(|fn\s+\w+/g
                ) || []
              ).length;

              totalLines += lines;
              totalFunctions += functions;
            }
          }
        } catch (error) {
          // Continue with other files
        }
      }

      const complexityScore =
        totalFunctions > 0
          ? Math.round((totalLines / totalFunctions) * 10) / 10
          : 0;

      return {
        score: complexityScore,
        metrics: {
          total_functions: totalFunctions,
          total_lines: totalLines,
          average_lines_per_function:
            totalFunctions > 0 ? Math.round(totalLines / totalFunctions) : 0,
        },
        recommendations:
          complexityScore > 20
            ? ['Consider breaking down large functions']
            : ['Complexity looks good'],
      };
    } catch (error) {
      return {
        score: 0,
        metrics: {
          total_functions: 0,
          total_lines: 0,
          average_lines_per_function: 0,
        },
        recommendations: [`Complexity analysis failed: ${error.message}`],
      };
    }
  }

  async analyzeMaintainability() {
    try {
      const issues = [];

      // Check for outdated dependencies
      try {
        const outdatedResult = await this.executeCommand('npm', [
          'outdated',
          '--json',
        ]);
        const outdatedData = JSON.parse(outdatedResult.stdout || '{}');

        Object.entries(outdatedData).forEach(([pkg, info]) => {
          issues.push({
            type: 'outdated_dependency',
            severity: 'medium',
            message: `${pkg} is outdated (current: ${info.current}, latest: ${info.latest})`,
            details: info,
          });
        });
      } catch (error) {
        issues.push({
          type: 'outdated_check_error',
          severity: 'low',
          message: `Failed to check outdated dependencies: ${error.message}`,
        });
      }

      const maintainabilityScore = Math.max(0, 100 - issues.length * 10);

      return {
        score: maintainabilityScore,
        issues,
        recommendations:
          issues.length > 0
            ? ['Update outdated dependencies']
            : ['Dependencies are up to date'],
      };
    } catch (error) {
      return {
        score: 0,
        issues: [
          {
            type: 'analysis_error',
            severity: 'medium',
            message: `Maintainability analysis failed: ${error.message}`,
          },
        ],
        recommendations: [`Analysis failed: ${error.message}`],
      };
    }
  }

  async checkDatabaseLogic() {
    const issues = [];
    const projectRoot = process.cwd();

    try {
      // Check for database migrations
      const migrationsDir = join(projectRoot, 'src-tauri', 'migrations');
      if (existsSync(migrationsDir)) {
        try {
          const files = readdirSync(migrationsDir);
          const sqlFiles = files.filter(f => f.endsWith('.sql'));

          if (sqlFiles.length === 0) {
            issues.push({
              type: 'no_migrations',
              severity: 'medium',
              message: 'No database migration files found',
            });
          } else {
            // Check migration file structure
            for (const file of sqlFiles.slice(0, 3)) {
              // Check first 3 files
              const filePath = join(migrationsDir, file);
              try {
                const content = readFileSync(filePath, 'utf8');
                if (
                  !content.includes('CREATE TABLE') &&
                  !content.includes('ALTER TABLE')
                ) {
                  issues.push({
                    type: 'invalid_migration',
                    severity: 'low',
                    file,
                    message: `Migration file ${file} may not contain proper schema changes`,
                  });
                }
              } catch (error) {
                issues.push({
                  type: 'migration_read_error',
                  severity: 'low',
                  file,
                  message: `Failed to read migration file ${file}: ${error.message}`,
                });
              }
            }
          }
        } catch (error) {
          issues.push({
            type: 'migrations_dir_error',
            severity: 'medium',
            message: `Failed to read migrations directory: ${error.message}`,
          });
        }
      } else {
        issues.push({
          type: 'no_migrations_dir',
          severity: 'medium',
          message: 'Migrations directory not found',
        });
      }

      // Check Cargo.toml for database dependencies
      const cargoTomlPath = join(projectRoot, 'src-tauri', 'Cargo.toml');
      if (existsSync(cargoTomlPath)) {
        try {
          const content = readFileSync(cargoTomlPath, 'utf8');
          if (!content.includes('rusqlite') && !content.includes('sqlx')) {
            issues.push({
              type: 'no_database_deps',
              severity: 'medium',
              message: 'No database dependencies found in Cargo.toml',
            });
          }
        } catch (error) {
          issues.push({
            type: 'cargo_read_error',
            severity: 'low',
            message: `Failed to read Cargo.toml: ${error.message}`,
          });
        }
      }

      return {
        issues,
        summary: {
          total_issues: issues.length,
          migrations_found:
            issues.filter(i => i.type === 'no_migrations').length === 0,
          database_deps_found:
            issues.filter(i => i.type === 'no_database_deps').length === 0,
        },
      };
    } catch (error) {
      return {
        issues: [
          {
            type: 'analysis_error',
            severity: 'medium',
            message: `Database logic check failed: ${error.message}`,
          },
        ],
        summary: {
          total_issues: 1,
          migrations_found: false,
          database_deps_found: false,
        },
      };
    }
  }

  async checkApiEndpoints() {
    const issues = [];
    const projectRoot = process.cwd();

    try {
      // Check Rust command files for API patterns
      const rustSrcDir = join(projectRoot, 'src-tauri', 'src');
      if (existsSync(rustSrcDir)) {
        try {
          const files = readdirSync(rustSrcDir);
          const rustFiles = files.filter(f => f.endsWith('.rs'));

          for (const file of rustFiles) {
            const filePath = join(rustSrcDir, file);
            try {
              const content = readFileSync(filePath, 'utf8');

              // Check for proper error handling
              if (
                content.includes('Result<') &&
                !content.includes('.map_err(')
              ) {
                issues.push({
                  type: 'missing_error_handling',
                  severity: 'medium',
                  file,
                  message: `Missing error handling in ${file}`,
                });
              }

              // Check for proper return types
              if (
                content.includes('#[tauri::command]') &&
                !content.includes('Result<')
              ) {
                issues.push({
                  type: 'invalid_return_type',
                  severity: 'medium',
                  file,
                  message: `Tauri command in ${file} should return Result type`,
                });
              }
            } catch (error) {
              issues.push({
                type: 'file_read_error',
                severity: 'low',
                file,
                message: `Failed to read ${file}: ${error.message}`,
              });
            }
          }
        } catch (error) {
          issues.push({
            type: 'src_dir_error',
            severity: 'medium',
            message: `Failed to read src directory: ${error.message}`,
          });
        }
      }

      return {
        issues,
        summary: {
          total_issues: issues.length,
          api_endpoints_found:
            issues.filter(i => i.type === 'invalid_return_type').length > 0,
        },
      };
    } catch (error) {
      return {
        issues: [
          {
            type: 'analysis_error',
            severity: 'medium',
            message: `API endpoint check failed: ${error.message}`,
          },
        ],
        summary: { total_issues: 1, api_endpoints_found: false },
      };
    }
  }

  async checkBusinessLogic() {
    const issues = [];
    const projectRoot = process.cwd();

    try {
      // Check React components for business logic patterns
      const srcDir = join(projectRoot, 'src');
      if (existsSync(srcDir)) {
        try {
          const files = this.globFiles('**/*.tsx', srcDir);

          for (const file of files.slice(0, 10)) {
            // Limit to first 10 files
            try {
              const content = readFileSync(file, 'utf8');

              // Check for proper error handling
              if (content.includes('try') && !content.includes('catch')) {
                issues.push({
                  type: 'incomplete_error_handling',
                  severity: 'medium',
                  file,
                  message: `Incomplete try-catch block in ${file}`,
                });
              }

              // Check for validation patterns
              if (
                content.includes('validate') ||
                content.includes('zod') ||
                content.includes('schema')
              ) {
                // This is good - validation is present
              } else if (
                content.includes('useState') &&
                content.includes('form')
              ) {
                issues.push({
                  type: 'missing_validation',
                  severity: 'low',
                  file,
                  message: `Form in ${file} may need validation`,
                });
              }
            } catch (error) {
              issues.push({
                type: 'file_read_error',
                severity: 'low',
                file,
                message: `Failed to read ${file}: ${error.message}`,
              });
            }
          }
        } catch (error) {
          issues.push({
            type: 'src_scan_error',
            severity: 'medium',
            message: `Failed to scan src directory: ${error.message}`,
          });
        }
      }

      return {
        issues,
        summary: {
          total_issues: issues.length,
          validation_patterns_found:
            issues.filter(i => i.type === 'missing_validation').length === 0,
        },
      };
    } catch (error) {
      return {
        issues: [
          {
            type: 'analysis_error',
            severity: 'medium',
            message: `Business logic check failed: ${error.message}`,
          },
        ],
        summary: { total_issues: 1, validation_patterns_found: false },
      };
    }
  }

  globFiles(pattern, cwd) {
    // Simplified glob implementation
    const files = [];
    try {
      const dir = cwd || process.cwd();
      const parts = pattern.split('/');
      this.walkDir(dir, parts, files);
    } catch (error) {
      // Return empty array if glob fails
    }
    return files;
  }

  walkDir(dir, parts, files, depth = 0) {
    if (depth >= parts.length) return;

    try {
      const items = readdirSync(dir);
      for (const item of items) {
        const fullPath = join(dir, item);
        const stat = readdirSync(fullPath, { withFileTypes: true });

        if (stat.isDirectory() && depth < parts.length - 1) {
          this.walkDir(fullPath, parts, files, depth + 1);
        } else if (stat.isFile() && depth === parts.length - 1) {
          const pattern = parts[parts.length - 1];
          if (pattern.includes('*')) {
            const regex = new RegExp(pattern.replace(/\*/g, '.*'));
            if (regex.test(item)) {
              files.push(fullPath);
            }
          } else if (item === pattern) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      // Skip directories that can't be read
    }
  }

  executeCommand(command, args = []) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', data => {
        stdout += data.toString();
      });

      child.stderr.on('data', data => {
        stderr += data.toString();
      });

      child.on('close', code => {
        resolve({
          exitCode: code,
          stdout,
          stderr,
        });
      });

      child.on('error', error => {
        reject(error);
      });
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('✅ Quality Check MCP Server started');
  }
}

// Start the server
const server = new QualityCheckServer();
server.run().catch(console.error);
