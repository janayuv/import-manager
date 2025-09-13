#!/usr/bin/env node

/**
 * Simplified MCP Server for Code Quality Checks
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

class SimpleQualityCheckServer {
  constructor() {
    this.server = new Server(
      {
        name: 'simple-quality-check-server',
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
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error executing ${name}: ${error.message}`,
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
    console.error('Simple Quality Check MCP Server started');
  }
}

// Start the server
const server = new SimpleQualityCheckServer();
server.run().catch(console.error);
