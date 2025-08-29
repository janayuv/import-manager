#!/usr/bin/env node

/**
 * Test script that simulates Cursor's MCP connection
 */

import { spawn } from 'child_process';
import { join } from 'path';

async function testCursorMCPConnection() {
  console.log('🧪 Testing Cursor MCP Connection...');

  const serverPath = join(process.cwd(), 'working-mcp-server.js');
  console.log(`Server path: ${serverPath}`);

  try {
    const child = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });

    let responses = [];
    let initialized = false;
    let toolsListed = false;

    child.stdout.on('data', data => {
      const response = data.toString().trim();
      if (response) {
        responses.push(response);
        console.log('📥 Received response:', response);

        try {
          const parsed = JSON.parse(response);
          if (parsed.result && parsed.result.protocolVersion) {
            initialized = true;
            console.log('✅ Initialization successful');
          }
          if (parsed.result && parsed.result.tools) {
            toolsListed = true;
            console.log(
              '✅ Tools list received:',
              parsed.result.tools.map(t => t.name)
            );
          }
        } catch (e) {
          // Continue reading
        }
      }
    });

    child.stderr.on('data', data => {
      console.log('🔍 Server log:', data.toString().trim());
    });

    // Step 1: Send initialization request (what Cursor does first)
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
        clientInfo: {
          name: 'cursor',
          version: '1.0.0',
        },
      },
    };

    console.log('📤 Sending initialization request...');
    child.stdin.write(JSON.stringify(initRequest) + '\n');

    // Wait a bit for initialization
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 2: Send tools/list request
    const toolsRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    };

    console.log('📤 Sending tools/list request...');
    child.stdin.write(JSON.stringify(toolsRequest) + '\n');

    // Wait for responses
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Close the connection
    child.stdin.end();

    // Wait for server to finish
    await new Promise(resolve => {
      child.on('close', () => {
        console.log('🔌 Server connection closed');
        resolve();
      });
    });

    console.log('\n🎉 Cursor MCP Connection Test Results:');
    console.log(`✅ Initialization: ${initialized ? 'SUCCESS' : 'FAILED'}`);
    console.log(`✅ Tools listing: ${toolsListed ? 'SUCCESS' : 'FAILED'}`);
    console.log(`📊 Total responses: ${responses.length}`);

    if (initialized && toolsListed) {
      console.log('\n✅ Server is ready for Cursor!');
      console.log('📋 Next steps:');
      console.log('1. Restart Cursor completely');
      console.log('2. Check MCP Tools section in Cursor settings');
      console.log('3. The quality-check server should show green status');
    } else {
      console.log('\n❌ Server has issues that need to be fixed');
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testCursorMCPConnection().catch(console.error);
