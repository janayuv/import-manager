#!/usr/bin/env node

/**
 * Test script for MCP Quality Check Server
 * Validates that the server can be executed and tools are available
 */

import { spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

class MCPTester {
  constructor(serverPath = null) {
    this.projectRoot = process.cwd();
    this.serverPath =
      serverPath || join(this.projectRoot, 'mcp-server-quality.js');
    this.testResults = [];
    this.maxTimeout = 10000; // 10 seconds timeout
  }

  async testServerAvailability() {
    console.log('🔍 Testing MCP Server Availability...');

    if (!existsSync(this.serverPath)) {
      throw new Error(`MCP server not found at: ${this.serverPath}`);
    }

    console.log('✅ MCP server file exists');
    this.testResults.push({ test: 'server_availability', status: 'passed' });
    return true;
  }

  async testServerStartup() {
    console.log('🚀 Testing MCP Server Startup...');

    return new Promise((resolve, reject) => {
      const server = spawn('node', [this.serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: this.projectRoot,
      });

      let stdout = '';
      let stderr = '';
      let startupDetected = false;
      const maxWaitTime = 5000; // 5 seconds max wait
      const startTime = Date.now();

      server.stdout.on('data', data => {
        stdout += data.toString();
      });

      server.stderr.on('data', data => {
        stderr += data.toString();

        // Check for startup message on each stderr data event
        if (stderr.includes('Quality Check MCP Server started')) {
          startupDetected = true;
          server.kill();
          console.log('✅ MCP server starts successfully');
          this.testResults.push({ test: 'server_startup', status: 'passed' });
          resolve(true);
        }
      });

      // Poll for startup message
      const pollInterval = setInterval(() => {
        if (startupDetected) {
          clearInterval(pollInterval);
          return;
        }

        if (Date.now() - startTime > maxWaitTime) {
          clearInterval(pollInterval);
          server.kill();
          console.log('❌ MCP server failed to start within timeout');
          console.log('STDERR:', stderr);
          this.testResults.push({
            test: 'server_startup',
            status: 'failed',
            error: 'Timeout',
          });
          reject(new Error('Server startup timeout'));
        }
      }, 100);

      server.on('close', code => {
        clearInterval(pollInterval);
        if (!startupDetected) {
          console.log('❌ MCP server closed unexpectedly');
          this.testResults.push({
            test: 'server_startup',
            status: 'failed',
            error: 'Unexpected close',
          });
          reject(new Error('Server closed unexpectedly'));
        }
      });

      server.on('error', error => {
        clearInterval(pollInterval);
        console.log('❌ Failed to spawn MCP server:', error.message);
        this.testResults.push({
          test: 'server_startup',
          status: 'failed',
          error: error.message,
        });
        reject(error);
      });
    });
  }

  async testToolExecution() {
    console.log('🛠️ Testing Tool Execution...');

    // Test type checking tool
    try {
      const result = await this.executeTool('type_check', {
        strict: true,
        project: 'tsconfig.json',
      });

      if (result && result.tool === 'type_check') {
        console.log('✅ Type check tool works correctly');
        console.log(`   Found ${result.summary.total_issues} issues`);
        this.testResults.push({
          test: 'type_check_tool',
          status: 'passed',
          issues: result.summary.total_issues,
        });
      } else {
        console.log('❌ Type check tool returned unexpected format');
        this.testResults.push({
          test: 'type_check_tool',
          status: 'failed',
          error: 'Unexpected format',
        });
      }
    } catch (error) {
      console.log('❌ Type check tool failed:', error.message);
      this.testResults.push({
        test: 'type_check_tool',
        status: 'failed',
        error: error.message,
      });
    }

    // Test lint tool with configurable file path
    const testFile = 'src/pages/item.tsx';
    const testFilePath = join(this.projectRoot, testFile);

    if (existsSync(testFilePath)) {
      try {
        const result = await this.executeTool('lint_code', {
          files: [testFile],
          fix: false,
        });

        if (result && result.tool === 'lint_code') {
          console.log('✅ Lint tool works correctly');
          console.log(`   Found ${result.summary.total_issues} issues`);
          this.testResults.push({
            test: 'lint_tool',
            status: 'passed',
            issues: result.summary.total_issues,
          });
        } else {
          console.log('❌ Lint tool returned unexpected format');
          this.testResults.push({
            test: 'lint_tool',
            status: 'failed',
            error: 'Unexpected format',
          });
        }
      } catch (error) {
        console.log('❌ Lint tool failed:', error.message);
        this.testResults.push({
          test: 'lint_tool',
          status: 'failed',
          error: error.message,
        });
      }
    } else {
      console.log(
        '⚠️  Skipping lint tool test - test file not found:',
        testFile
      );
      this.testResults.push({
        test: 'lint_tool',
        status: 'skipped',
        reason: 'Test file not found',
      });
    }
  }

  async executeTool(toolName, args) {
    return new Promise((resolve, reject) => {
      const server = spawn('node', [this.serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: this.projectRoot,
      });

      let stdout = '';
      let stderr = '';
      let timeoutId;

      // Set timeout
      timeoutId = setTimeout(() => {
        server.kill();
        reject(new Error('Tool execution timeout'));
      }, this.maxTimeout);

      server.stdout.on('data', data => {
        stdout += data.toString();
      });

      server.stderr.on('data', data => {
        stderr += data.toString();
      });

      // Send tool call request
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args,
        },
      };

      server.stdin.write(JSON.stringify(request) + '\n');
      server.stdin.end();

      server.on('close', code => {
        clearTimeout(timeoutId);
        try {
          // More robust output parsing
          const lines = stdout.split('\n').filter(line => line.trim());
          let toolResult = null;
          let errorResponse = null;

          for (const line of lines) {
            try {
              const response = JSON.parse(line);

              // Check for error response
              if (response.error) {
                errorResponse = response.error;
                continue;
              }

              // Check for successful response
              if (response.result && response.result.content) {
                const content = response.result.content[0];
                if (content.type === 'text') {
                  try {
                    toolResult = JSON.parse(content.text);
                    break;
                  } catch (parseError) {
                    // Try to extract JSON from the text
                    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                      try {
                        toolResult = JSON.parse(jsonMatch[0]);
                        break;
                      } catch (matchError) {
                        // Continue to next line
                      }
                    }
                  }
                }
              }
            } catch (parseError) {
              // Skip non-JSON lines
            }
          }

          if (errorResponse) {
            reject(
              new Error(
                `Tool execution error: ${errorResponse.message || JSON.stringify(errorResponse)}`
              )
            );
          } else if (toolResult) {
            resolve(toolResult);
          } else {
            // Log full output for debugging
            console.log('Full stdout:', stdout);
            console.log('Full stderr:', stderr);
            reject(new Error('No valid tool response received'));
          }
        } catch (error) {
          reject(error);
        }
      });

      server.on('error', error => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  async testConfigurationFiles() {
    console.log('📋 Testing Configuration Files...');

    const requiredFiles = [
      'package.json',
      'tsconfig.json',
      'eslint.config.js',
      'vitest.config.ts',
      'playwright.config.ts',
      'src-tauri/Cargo.toml',
    ];

    for (const file of requiredFiles) {
      const filePath = join(this.projectRoot, file);
      if (existsSync(filePath)) {
        console.log(`✅ ${file} exists`);
        this.testResults.push({ test: `config_${file}`, status: 'passed' });
      } else {
        console.log(`❌ ${file} missing`);
        this.testResults.push({
          test: `config_${file}`,
          status: 'failed',
          error: 'File not found',
        });
      }
    }
  }

  async testDependencies() {
    console.log('📦 Testing Dependencies...');

    try {
      const packageJson = JSON.parse(
        readFileSync(join(this.projectRoot, 'package.json'), 'utf8')
      );

      const requiredDeps = [
        'eslint',
        'typescript',
        'vitest',
        '@playwright/test',
      ];

      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      for (const dep of requiredDeps) {
        if (allDeps[dep]) {
          console.log(`✅ ${dep} is installed (${allDeps[dep]})`);
          this.testResults.push({
            test: `dep_${dep}`,
            status: 'passed',
            version: allDeps[dep],
          });
        } else {
          console.log(`❌ ${dep} is missing`);
          this.testResults.push({
            test: `dep_${dep}`,
            status: 'failed',
            error: 'Dependency not found',
          });
        }
      }

      // Check for Tauri/Rust dependencies
      const cargoTomlPath = join(this.projectRoot, 'src-tauri', 'Cargo.toml');
      if (existsSync(cargoTomlPath)) {
        try {
          const cargoToml = readFileSync(cargoTomlPath, 'utf8');
          if (cargoToml.includes('rusqlite')) {
            console.log('✅ rusqlite dependency found in Cargo.toml');
            this.testResults.push({ test: 'dep_rusqlite', status: 'passed' });
          } else {
            console.log('❌ rusqlite dependency not found in Cargo.toml');
            this.testResults.push({
              test: 'dep_rusqlite',
              status: 'failed',
              error: 'Dependency not found',
            });
          }
        } catch (fileError) {
          console.log('❌ Could not read Cargo.toml:', fileError.message);
          this.testResults.push({
            test: 'dep_rusqlite',
            status: 'failed',
            error: fileError.message,
          });
        }
      } else {
        console.log('⚠️  Cargo.toml not found, skipping Rust dependency check');
        this.testResults.push({
          test: 'dep_rusqlite',
          status: 'skipped',
          reason: 'Cargo.toml not found',
        });
      }
    } catch (error) {
      console.log('❌ Failed to read package.json:', error.message);
      this.testResults.push({
        test: 'dependencies',
        status: 'failed',
        error: error.message,
      });
    }
  }

  async runAllTests() {
    console.log('🧪 Running MCP Server Tests...\n');

    const tests = [
      { name: 'Server Availability', fn: () => this.testServerAvailability() },
      { name: 'Configuration Files', fn: () => this.testConfigurationFiles() },
      { name: 'Dependencies', fn: () => this.testDependencies() },
      { name: 'Server Startup', fn: () => this.testServerStartup() },
      { name: 'Tool Execution', fn: () => this.testToolExecution() },
    ];

    for (const test of tests) {
      try {
        await test.fn();
      } catch (error) {
        console.log(`❌ ${test.name} failed:`, error.message);
        this.testResults.push({
          test: test.name.toLowerCase().replace(/\s+/g, '_'),
          status: 'failed',
          error: error.message,
        });
      }
    }

    // Print summary
    this.printTestSummary();

    // Exit with appropriate code
    const failedTests = this.testResults.filter(r => r.status === 'failed');
    if (failedTests.length > 0) {
      console.log('\n❌ Some tests failed!');
      process.exit(1);
    } else {
      console.log('\n🎉 All tests passed! MCP server is ready to use.');
      process.exit(0);
    }
  }

  printTestSummary() {
    console.log('\n📊 Test Summary:');
    console.log('================');

    const passed = this.testResults.filter(r => r.status === 'passed').length;
    const failed = this.testResults.filter(r => r.status === 'failed').length;
    const skipped = this.testResults.filter(r => r.status === 'skipped').length;

    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⚠️  Skipped: ${skipped}`);
    console.log(`📈 Total: ${this.testResults.length}`);

    if (failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.testResults
        .filter(r => r.status === 'failed')
        .forEach(r => {
          console.log(`  - ${r.test}: ${r.error || 'Unknown error'}`);
        });
    }
  }

  // Export results for CI
  exportResults() {
    return {
      timestamp: new Date().toISOString(),
      serverPath: this.serverPath,
      projectRoot: this.projectRoot,
      results: this.testResults,
      summary: {
        passed: this.testResults.filter(r => r.status === 'passed').length,
        failed: this.testResults.filter(r => r.status === 'failed').length,
        skipped: this.testResults.filter(r => r.status === 'skipped').length,
        total: this.testResults.length,
      },
    };
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const serverPath = process.argv[2] || null;
  const tester = new MCPTester(serverPath);
  tester.runAllTests();
}

export { MCPTester };
