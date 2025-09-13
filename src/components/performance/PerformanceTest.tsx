import { useCallback, useState } from 'react';

import {
  OptimizedButton,
  OptimizedCard,
  OptimizedContainer,
  OptimizedGrid,
  OptimizedImage,
  OptimizedList,
  OptimizedSkeleton,
} from '@/components/performance/OptimizedComponents';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useCachedData,
  useOptimizedForm,
  useOptimizedImage,
  useOptimizedIntersectionObserver,
  useOptimizedList,
  useOptimizedScroll,
  useOptimizedWindowSize,
  usePerformanceMonitor,
} from '@/hooks/usePerformance';
import { CACHE_TTL, cache } from '@/lib/cache';
import {
  BundleAnalyzer,
  MemoryManager,
  PerformanceObserver,
  PerformanceReporter,
  performanceUtils,
} from '@/lib/performance';

// Sample data for testing
const sampleData = Array.from({ length: 100 }, (_, i) => ({
  id: i + 1,
  name: `Item ${i + 1}`,
  value: Math.random() * 1000,
  category: ['A', 'B', 'C'][Math.floor(Math.random() * 3)],
  date: new Date(Date.now() - Math.random() * 10000000000).toISOString(),
}));

// Remove unused sample data

export const PerformanceTest = () => {
  usePerformanceMonitor('PerformanceTest');

  const [activeTab, setActiveTab] = useState('caching');
  const [testResults, setTestResults] = useState<
    Record<string, number | string>
  >({});
  const [isRunning, setIsRunning] = useState(false);

  // Performance monitoring
  const { renderCount, isTransitioning } =
    usePerformanceMonitor('PerformanceTest');

  // Cached data example
  const {
    data: cachedData,
    loading: cachedLoading,
    refetch: refetchCached,
  } = useCachedData(
    'performance-test-data',
    async () => {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      return sampleData.slice(0, 10);
    },
    { ttl: CACHE_TTL.SHORT }
  );

  // Remove unused tauri data

  // Optimized list example
  const {
    data: listData,
    loading: listLoading,
    updateFilters,
  } = useOptimizedList(
    async ({ page, pageSize, filters }) => {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      const filtered = sampleData.filter(
        item => !filters?.category || item.category === filters.category
      );
      const start = (page - 1) * pageSize;
      const end = start + pageSize;
      return {
        data: filtered.slice(start, end),
        total: filtered.length,
        page,
        pageSize,
      };
    },
    { initialPageSize: 10 }
  );

  // Optimized form example
  const {
    data: formData,
    updateData,
    reset,
  } = useOptimizedForm(
    { name: '', email: '', message: '' },
    { debounceMs: 300 }
  );

  // Optimized table example

  // Optimized image example
  const {
    src: imageSrc,
    loading: imageLoading,
    error: imageError,
  } = useOptimizedImage('https://picsum.photos/200/200', {
    cacheType: 'memory',
  });

  // Optimized scroll example
  const { scrollPosition } = useOptimizedScroll('performance-test');

  // Optimized window size example
  const windowSize = useOptimizedWindowSize();

  // Optimized intersection observer example
  const { ref: intersectionRef, isIntersecting } =
    useOptimizedIntersectionObserver();

  // Performance tests
  const runPerformanceTests = useCallback(async () => {
    setIsRunning(true);
    const results: Record<string, number | string> = {};

    try {
      // Cache performance test
      const cacheStart = performance.now();
      for (let i = 0; i < 1000; i++) {
        cache.memory.set(`test-${i}`, { data: i, timestamp: Date.now() });
      }
      const cacheEnd = performance.now();
      results.cacheWrite = cacheEnd - cacheStart;

      const cacheReadStart = performance.now();
      for (let i = 0; i < 1000; i++) {
        cache.memory.get(`test-${i}`);
      }
      const cacheReadEnd = performance.now();
      results.cacheRead = cacheReadEnd - cacheReadStart;

      // Memory usage test
      const memoryUsage = MemoryManager.getMemoryUsage();
      results.memoryUsage = JSON.stringify(memoryUsage);

      // Bundle analysis test
      const bundleStats = BundleAnalyzer.getBundleStats();
      results.bundleStats = JSON.stringify(bundleStats);

      // Performance metrics test
      const observer = PerformanceObserver.getInstance();
      const metrics = observer.getMetrics();
      results.performanceMetrics = JSON.stringify(metrics);

      // Function timing test
      const timingResult = performanceUtils.measureTime(() => {
        let sum = 0;
        for (let i = 0; i < 1000000; i++) {
          sum += i;
        }
        return sum;
      }, 'Sum calculation');
      results.functionTiming = timingResult;

      setTestResults(results);
    } catch (error) {
      console.error('Performance test failed:', error);
    } finally {
      setIsRunning(false);
    }
  }, []);

  // Clear cache test
  const clearCache = useCallback(() => {
    cache.clearAll();
    console.log('All caches cleared');
  }, []);

  // Memory cleanup test
  const triggerMemoryCleanup = useCallback(() => {
    MemoryManager.checkMemoryUsage();
    console.log('Memory cleanup triggered');
  }, []);

  // Export performance report
  const exportReport = useCallback(() => {
    const reports = PerformanceReporter.getReports();
    const averageMetrics = PerformanceReporter.getAverageMetrics();
    const report = {
      reports,
      averageMetrics,
      currentMetrics: PerformanceObserver.getInstance().getMetrics(),
      cacheStats: cache.getStats(),
      memoryUsage: MemoryManager.getMemoryUsage(),
      bundleStats: BundleAnalyzer.getBundleStats(),
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'performance-report.json';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  return (
    <OptimizedContainer maxWidth="full" padding="lg">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Performance Optimization & Caching Test
            <div className="flex items-center space-x-2">
              <Badge variant="outline">Renders: {renderCount}</Badge>
              {isTransitioning && (
                <Badge variant="secondary">Transitioning</Badge>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="caching">Caching</TabsTrigger>
              <TabsTrigger value="hooks">Hooks</TabsTrigger>
              <TabsTrigger value="components">Components</TabsTrigger>
              <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
              <TabsTrigger value="tests">Tests</TabsTrigger>
              <TabsTrigger value="results">Results</TabsTrigger>
            </TabsList>

            <TabsContent value="caching" className="space-y-6">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Cache Operations</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex space-x-2">
                      <OptimizedButton
                        onClick={() =>
                          cache.memory.set('test-key', 'test-value')
                        }
                      >
                        Set Memory Cache
                      </OptimizedButton>
                      <OptimizedButton
                        onClick={() =>
                          cache.session.set('test-key', 'test-value')
                        }
                      >
                        Set Session Cache
                      </OptimizedButton>
                      <OptimizedButton
                        onClick={() =>
                          cache.persistent.set('test-key', 'test-value')
                        }
                      >
                        Set Persistent Cache
                      </OptimizedButton>
                    </div>
                    <div className="flex space-x-2">
                      <OptimizedButton
                        onClick={() =>
                          console.log(cache.memory.get('test-key'))
                        }
                      >
                        Get Memory Cache
                      </OptimizedButton>
                      <OptimizedButton
                        onClick={() => console.log(cache.smart.get('test-key'))}
                      >
                        Get Smart Cache
                      </OptimizedButton>
                    </div>
                    <OptimizedButton onClick={clearCache} variant="destructive">
                      Clear All Caches
                    </OptimizedButton>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Cache Statistics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="bg-muted rounded p-2 text-xs">
                      {JSON.stringify(cache.getStats(), null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="hooks" className="space-y-6">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Cached Data Hook</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <OptimizedButton
                      onClick={refetchCached}
                      loading={cachedLoading}
                    >
                      {cachedLoading ? 'Loading...' : 'Fetch Data'}
                    </OptimizedButton>
                    <div className="text-sm">
                      <p>
                        Data:{' '}
                        {cachedData ? `${cachedData.length} items` : 'No data'}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Optimized List Hook</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex space-x-2">
                      <OptimizedButton
                        onClick={() => updateFilters({ category: 'A' })}
                      >
                        Filter A
                      </OptimizedButton>
                      <OptimizedButton
                        onClick={() => updateFilters({ category: 'B' })}
                      >
                        Filter B
                      </OptimizedButton>
                      <OptimizedButton onClick={() => updateFilters({})}>
                        Clear Filter
                      </OptimizedButton>
                    </div>
                    <div className="text-sm">
                      <p>Items: {listData?.length || 0}</p>
                      <p>Loading: {listLoading ? 'Yes' : 'No'}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Optimized Form Hook</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <input
                      type="text"
                      placeholder="Name"
                      value={formData.name}
                      onChange={e => updateData({ name: e.target.value })}
                      className="w-full rounded border p-2"
                    />
                    <input
                      type="email"
                      placeholder="Email"
                      value={formData.email}
                      onChange={e => updateData({ email: e.target.value })}
                      className="w-full rounded border p-2"
                    />
                    <textarea
                      placeholder="Message"
                      value={formData.message}
                      onChange={e => updateData({ message: e.target.value })}
                      className="w-full rounded border p-2"
                    />
                    <OptimizedButton onClick={() => reset()}>
                      Reset Form
                    </OptimizedButton>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>System Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-sm">
                      <p>
                        Window Size: {windowSize.width} x {windowSize.height}
                      </p>
                      <p>Scroll Position: {scrollPosition}px</p>
                      <p>In Viewport: {isIntersecting ? 'Yes' : 'No'}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="components" className="space-y-6">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="rounded border p-4">
                  <p className="text-muted-foreground">
                    Data display component placeholder
                  </p>
                </div>

                <OptimizedList
                  items={sampleData.slice(0, 10)}
                  renderItem={item => (
                    <div
                      key={(item as { id: string }).id}
                      className="flex items-center justify-between rounded border p-2"
                    >
                      <span>{(item as { name: string }).name}</span>
                      <span>
                        {(item as { value: number }).value.toFixed(2)}
                      </span>
                    </div>
                  )}
                  containerHeight={200}
                />

                <div className="rounded border p-4">
                  <p className="text-muted-foreground">
                    Table component placeholder
                  </p>
                </div>

                <OptimizedCard title="Optimized Image">
                  <OptimizedImage
                    src={imageSrc}
                    alt="Test image"
                    className="h-32 w-full rounded object-cover"
                  />
                  {imageLoading && <p>Loading image...</p>}
                  {imageError && (
                    <p className="text-destructive">Failed to load image</p>
                  )}
                </OptimizedCard>

                <OptimizedGrid cols={3} gap="md">
                  <OptimizedSkeleton count={3} height="h-8" />
                </OptimizedGrid>

                <div ref={intersectionRef as React.RefObject<HTMLDivElement>}>
                  <OptimizedCard title="Intersection Observer Test">
                    <p>
                      This card is {isIntersecting ? 'visible' : 'not visible'}{' '}
                      in the viewport
                    </p>
                  </OptimizedCard>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="monitoring" className="space-y-6">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Performance Metrics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="bg-muted rounded p-2 text-xs">
                      {JSON.stringify(
                        PerformanceObserver.getInstance().getMetrics(),
                        null,
                        2
                      )}
                    </pre>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Memory Usage</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="bg-muted rounded p-2 text-xs">
                      {JSON.stringify(MemoryManager.getMemoryUsage(), null, 2)}
                    </pre>
                    <OptimizedButton
                      onClick={triggerMemoryCleanup}
                      className="mt-2"
                    >
                      Trigger Cleanup
                    </OptimizedButton>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Bundle Analysis</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="bg-muted rounded p-2 text-xs">
                      {JSON.stringify(BundleAnalyzer.getBundleStats(), null, 2)}
                    </pre>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Performance Reports</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="text-sm">
                      <p>
                        Total Reports: {PerformanceReporter.getReports().length}
                      </p>
                      <p>
                        Average Metrics:{' '}
                        {
                          Object.keys(PerformanceReporter.getAverageMetrics())
                            .length
                        }{' '}
                        metrics
                      </p>
                    </div>
                    <OptimizedButton onClick={exportReport}>
                      Export Report
                    </OptimizedButton>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="tests" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Performance Tests</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <OptimizedButton
                    onClick={runPerformanceTests}
                    loading={isRunning}
                    disabled={isRunning}
                  >
                    {isRunning ? 'Running Tests...' : 'Run Performance Tests'}
                  </OptimizedButton>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="rounded border p-4">
                      <h4 className="mb-2 font-semibold">Cache Performance</h4>
                      <p>Tests memory cache read/write performance</p>
                    </div>
                    <div className="rounded border p-4">
                      <h4 className="mb-2 font-semibold">Memory Usage</h4>
                      <p>Checks current memory consumption</p>
                    </div>
                    <div className="rounded border p-4">
                      <h4 className="mb-2 font-semibold">Bundle Analysis</h4>
                      <p>Analyzes bundle size and composition</p>
                    </div>
                    <div className="rounded border p-4">
                      <h4 className="mb-2 font-semibold">Function Timing</h4>
                      <p>Measures function execution time</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="results" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Test Results</CardTitle>
                </CardHeader>
                <CardContent>
                  {Object.keys(testResults).length > 0 ? (
                    <pre className="bg-muted max-h-96 overflow-auto rounded p-4 text-xs">
                      {JSON.stringify(testResults, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-muted-foreground">
                      No test results available. Run tests first.
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </OptimizedContainer>
  );
};

export default PerformanceTest;
