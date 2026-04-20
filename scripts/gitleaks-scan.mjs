#!/usr/bin/env node
/**
 * Runs gitleaks with PATH resolution that matches typical Windows setups
 * (cmd/PowerShell), avoiding false "not installed" when Husky runs under Git sh.
 *
 * By default, `git log` is limited to the **current branch** (`--log-opts` = branch
 * name or `HEAD`) so unrelated local branches are not scanned. For a full-repo
 * audit (all refs), run with: `GITLEAKS_LOG_OPTS=--all` (PowerShell: `$env:GITLEAKS_LOG_OPTS='--all'`).
 */
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const isWin = process.platform === 'win32';

function currentBranchLogOpts() {
  const r = spawnSync('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], {
    encoding: 'utf8',
    cwd: process.cwd(),
  });
  if (r.status === 0 && r.stdout?.trim()) {
    return r.stdout.trim();
  }
  return 'HEAD';
}

function printNotFoundHelp() {
  console.warn('');
  console.warn('⚠️  gitleaks was not found in PATH for this hook environment.');
  console.warn(
    '    Pre-commit will continue, but secrets will not be scanned.'
  );
  console.warn('');
  console.warn('    Windows: install gitleaks, add it to PATH, then verify:');
  console.warn('      gitleaks version');
  console.warn('');
  console.warn('    See README: "Installing gitleaks (Windows)".');
  console.warn('    Releases: https://github.com/gitleaks/gitleaks/releases');
  console.warn('');
}

function runGitleaks(args, inheritStdio) {
  return spawnSync('gitleaks', args, {
    shell: isWin,
    stdio: inheritStdio ? 'inherit' : 'pipe',
    encoding: 'utf8',
  });
}

function looksLikeCommandNotFound(result) {
  if (result.error?.code === 'ENOENT') return true;
  const msg = `${result.stderr || ''}${result.stdout || ''}`;
  return /not recognized|not found|No such file|cannot find/i.test(msg);
}

const probe = runGitleaks(['version'], false);

if (probe.status === 0) {
  const logOpts = process.env.GITLEAKS_LOG_OPTS || currentBranchLogOpts();
  const detect = runGitleaks(
    ['detect', '--source', '.', '--no-banner', '--log-opts', logOpts],
    true
  );
  const code = detect.status;
  process.exit(code === null ? 1 : code);
}

if (looksLikeCommandNotFound(probe) || probe.status === 127) {
  printNotFoundHelp();
  process.exit(0);
}

console.error(
  probe.stderr?.trim() || probe.stdout?.trim() || 'gitleaks version failed'
);
process.exit(probe.status ?? 1);
