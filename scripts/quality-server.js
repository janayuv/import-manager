#!/usr/bin/env node
/**
 * Husky pre-commit invokes this with `--pre-commit`.
 * The interactive MCP quality server lives at `scripts/mcp/mcp-server-quality.js`.
 */

const args = process.argv.slice(2);

if (args.includes('--pre-commit')) {
  console.log(
    'MCP quality (pre-commit): skipped — lint and typecheck already ran above.'
  );
  process.exit(0);
}

console.error(
  'Usage: node scripts/quality-server.js --pre-commit\n' +
    'MCP server (stdio): node scripts/mcp/mcp-server-quality.js'
);
process.exit(1);
