#!/usr/bin/env node

/**
 * Simple test to verify MCP server functionality
 */

import { spawn } from 'child_process';
import { join } from 'path';

console.log('🧪 Testing MCP Server...');

const projectRoot = process.cwd();
const serverPath = join(projectRoot, 'working-mcp-server.js');

console.log('Server path:', serverPath);

// Test 1: Check if server file exists
import { existsSync } from 'fs';
if (!existsSync(serverPath)) {
  console.log('❌ MCP server file not found');
  process.exit(1);
}
console.log('✅ MCP server file exists');

// Test 2: Try to start the server
console.log('🚀 Starting MCP server...');
const server = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: projectRoot,
});

let stdout = '';
let stderr = '';
let startupDetected = false;

server.stdout.on('data', data => {
  stdout += data.toString();
  console.log('STDOUT:', data.toString());
});

server.stderr.on('data', data => {
  stderr += data.toString();
  console.log('STDERR:', data.toString());

  if (stderr.includes('✅ Quality Check MCP Server started')) {
    startupDetected = true;
    console.log('✅ MCP server started successfully');
    server.kill();
  }
});

server.on('close', code => {
  console.log('Server closed with code:', code);
  if (!startupDetected) {
    console.log('❌ MCP server failed to start properly');
    console.log('Full stderr:', stderr);
    process.exit(1);
  }
});

server.on('error', error => {
  console.log('❌ Failed to spawn MCP server:', error.message);
  process.exit(1);
});

// Give the server some time to start
setTimeout(() => {
  if (!startupDetected) {
    console.log('❌ MCP server startup timeout');
    server.kill();
    process.exit(1);
  }
}, 5000);
