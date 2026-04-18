#!/usr/bin/env node

/**
 * Direct test script for MCP tools functionality
 */

import { spawn } from 'child_process';
import { join } from 'path';

class MCPToolsTester {
  constructor() {
    this.projectRoot = process.cwd();
    this.serverPath = join(this.projectRoot, 'working-mcp-server.js');
  }

  async testLintCode() {
    console.log('🔍 Testing lint_code tool...');
    try {
      const result = await this.executeTool('lint_code', {
        files: ['src/pages/item.tsx'],
        fix: false,
      });

      if (result && result.tool === 'lint_code') {
        console.log('✅ lint_code tool works correctly');
        console.log(`   Found ${result.summary.total_issues} issues`);
        console.log(
          `   Errors: ${result.summary.errors}, Warnings: ${result.summary.warnings}`
        );

        if (result.issues && result.issues.length > 0) {
          console.log('   Sample issues:');
          result.issues.slice(0, 3).forEach(issue => {
            console.log(
              `     - ${issue.file}:${issue.line} - ${issue.message}`
            );
          });
        }
      } else {
        console.log('❌ lint_code tool returned unexpected format');
      }
    } catch (error) {
      console.log('❌ lint_code tool failed:', error.message);
    }
  }

  async testTypeCheck() {
    console.log('🔍 Testing type_check tool...');
    try {
      const result = await this.executeTool('type_check', {
        strict: true,
        project: 'tsconfig.json',
      });

      if (result && result.tool === 'type_check') {
        console.log('✅ type_check tool works correctly');
        console.log(`   Found ${result.summary.total_issues} issues`);
        console.log(
          `   Errors: ${result.summary.errors}, Warnings: ${result.summary.warnings}`
        );

        if (result.issues && result.issues.length > 0) {
          console.log('   Sample issues:');
          result.issues.slice(0, 3).forEach(issue => {
            console.log(
              `     - ${issue.file}:${issue.line} - ${issue.message}`
            );
          });
        }
      } else {
        console.log('❌ type_check tool returned unexpected format');
      }
    } catch (error) {
      console.log('❌ type_check tool failed:', error.message);
    }
  }

  async testRunTests() {
    console.log('🔍 Testing run_tests tool...');
    try {
      const result = await this.executeTool('run_tests', {
        type: 'unit',
        coverage: false,
        watch: false,
      });

      if (result && result.tool === 'run_tests') {
        console.log('✅ run_tests tool works correctly');
        console.log(`   Total tests: ${result.summary.total_tests}`);
        console.log(
          `   Passed: ${result.summary.passed}, Failed: ${result.summary.failed}`
        );

        if (result.results && result.results.length > 0) {
          result.results.forEach(testResult => {
            console.log(
              `   - ${testResult.type} (${testResult.framework}): ${testResult.exit_code === 0 ? 'PASSED' : 'FAILED'}`
            );
          });
        }
      } else {
        console.log('❌ run_tests tool returned unexpected format');
      }
    } catch (error) {
      console.log('❌ run_tests tool failed:', error.message);
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
      }, 30000); // 30 seconds timeout

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
          // Parse output
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

  async runAllTests() {
    console.log('🧪 Testing MCP Quality Check Tools...\n');

    await this.testLintCode();
    console.log('');

    await this.testTypeCheck();
    console.log('');

    await this.testRunTests();
    console.log('');

    console.log('🎉 MCP tool testing completed!');
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new MCPToolsTester();
  tester.runAllTests().catch(console.error);
}

export { MCPToolsTester };
