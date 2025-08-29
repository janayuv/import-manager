#!/usr/bin/env node

/**
 * Simple test for MCP lint_code tool
 */

import { spawn } from 'child_process';
import { join } from 'path';

console.log('🧪 Testing MCP lint_code tool...');

const projectRoot = process.cwd();
const serverPath = join(projectRoot, 'working-mcp-server.js');

console.log('Server path:', serverPath);

// Test the lint_code tool
async function testLintCode() {
  return new Promise((resolve, reject) => {
    const server = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: projectRoot,
    });

    let stdout = '';
    let stderr = '';

    server.stdout.on('data', data => {
      stdout += data.toString();
      console.log('STDOUT:', data.toString());
    });

    server.stderr.on('data', data => {
      stderr += data.toString();
      console.log('STDERR:', data.toString());
    });

    // Send tool call request
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'lint_code',
        arguments: {
          files: ['src/pages/item.tsx'],
          fix: false,
        },
      },
    };

    console.log('Sending request:', JSON.stringify(request, null, 2));

    server.stdin.write(JSON.stringify(request) + '\n');
    server.stdin.end();

    server.on('close', code => {
      console.log('Server closed with code:', code);
      console.log('Full stdout:', stdout);
      console.log('Full stderr:', stderr);

      try {
        const lines = stdout.split('\n').filter(line => line.trim());
        for (const line of lines) {
          try {
            const response = JSON.parse(line);
            console.log('Parsed response:', JSON.stringify(response, null, 2));

            if (response.result && response.result.content) {
              const content = response.result.content[0];
              if (content.type === 'text') {
                try {
                  const toolResult = JSON.parse(content.text);
                  console.log(
                    '✅ Tool result:',
                    JSON.stringify(toolResult, null, 2)
                  );
                  resolve(toolResult);
                  return;
                } catch (parseError) {
                  console.log(
                    'Failed to parse tool result:',
                    parseError.message
                  );
                }
              }
            }
          } catch (parseError) {
            console.log('Failed to parse response line:', parseError.message);
          }
        }
        reject(new Error('No valid tool response found'));
      } catch (error) {
        reject(error);
      }
    });

    server.on('error', error => {
      console.log('Server error:', error.message);
      reject(error);
    });
  });
}

// Run the test
testLintCode()
  .then(result => {
    console.log('🎉 MCP lint_code tool test successful!');
    console.log(`Found ${result.summary.total_issues} issues`);
  })
  .catch(error => {
    console.log('❌ MCP lint_code tool test failed:', error.message);
  });
