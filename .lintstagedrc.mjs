function notGeneratedPath(file) {
  const n = file.replace(/\\/g, '/');
  const isTrackedPerformanceBaseline =
    n === 'test-results/performance-baselines.json' ||
    n.endsWith('/test-results/performance-baselines.json');
  if (isTrackedPerformanceBaseline) {
    return true;
  }
  return (
    !n.startsWith('playwright-report/') &&
    !n.includes('/playwright-report/') &&
    !n.startsWith('test-results/') &&
    !n.includes('/test-results/')
  );
}

/** @type {import('lint-staged').Configuration} */
export default {
  '**/*.{ts,tsx,js,jsx,css,html,md,json}': files => {
    const staged = files.filter(notGeneratedPath);
    if (!staged.length) {
      return [];
    }
    const quoted = staged.map(f => JSON.stringify(f)).join(' ');
    const srcTsLike = staged.filter(f => {
      const n = f.replace(/\\/g, '/');
      return /^src\/.*\.(tsx?|jsx?)$/.test(n);
    });
    const tasks = [`prettier --write ${quoted}`];
    if (srcTsLike.length) {
      tasks.push(
        `eslint --fix --rule 'react-hooks/exhaustive-deps: off' ${srcTsLike.map(f => JSON.stringify(f)).join(' ')}`
      );
    }
    return tasks;
  },
};
