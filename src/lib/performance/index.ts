// Performance monitoring and optimization utilities

// Performance metrics interface
export interface PerformanceMetrics {
  // Timing metrics
  loadTime: number
  firstContentfulPaint: number
  largestContentfulPaint: number
  firstInputDelay: number
  cumulativeLayoutShift: number

  // Memory metrics
  memoryUsage: number
  memoryLimit: number

  // Cache metrics
  cacheHitRate: number
  cacheSize: number

  // Component metrics
  renderCount: number
  renderTime: number
}

// Performance observer for web vitals
export class PerformanceObserver {
  private static instance: PerformanceObserver | null = null
  private metrics: Partial<PerformanceMetrics> = {}
  private observers: Map<string, globalThis.PerformanceObserver> = new Map()

  static getInstance(): PerformanceObserver {
    if (!PerformanceObserver.instance) {
      PerformanceObserver.instance = new PerformanceObserver()
    }
    return PerformanceObserver.instance
  }

  // Start monitoring web vitals
  startMonitoring() {
    this.observeLargestContentfulPaint()
    this.observeFirstInputDelay()
    this.observeCumulativeLayoutShift()
    this.observeMemoryUsage()
  }

  private observeLargestContentfulPaint() {
    if ('PerformanceObserver' in window) {
      const observer = new globalThis.PerformanceObserver((list: PerformanceObserverEntryList) => {
        const entries = list.getEntries()
        const lastEntry = entries[entries.length - 1]
        this.metrics.largestContentfulPaint = lastEntry.startTime
      })
      observer.observe({ entryTypes: ['largest-contentful-paint'] })
      this.observers.set('lcp', observer)
    }
  }

  private observeFirstInputDelay() {
    if ('PerformanceObserver' in window) {
      const observer = new globalThis.PerformanceObserver((list: PerformanceObserverEntryList) => {
        const entries = list.getEntries()
        entries.forEach((entry: PerformanceEntry) => {
          this.metrics.firstInputDelay =
            ((entry as unknown as { processingStart: number }).processingStart ?? 0) - entry.startTime
        })
      })
      observer.observe({ entryTypes: ['first-input'] })
      this.observers.set('fid', observer)
    }
  }

  private observeCumulativeLayoutShift() {
    if ('PerformanceObserver' in window) {
      let clsValue = 0
      const observer = new globalThis.PerformanceObserver((list: PerformanceObserverEntryList) => {
        const entries = list.getEntries()
        entries.forEach((entry: PerformanceEntry) => {
          if (!(entry as unknown as { hadRecentInput: boolean }).hadRecentInput) {
            clsValue += (entry as unknown as { value: number }).value ?? 0
          }
        })
        this.metrics.cumulativeLayoutShift = clsValue
      })
      observer.observe({ entryTypes: ['layout-shift'] })
      this.observers.set('cls', observer)
    }
  }

  private observeMemoryUsage() {
    if ('memory' in performance) {
      const memory = (performance as { memory: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory
      this.metrics.memoryUsage = memory.usedJSHeapSize
      this.metrics.memoryLimit = memory.jsHeapSizeLimit
    }
  }

  // Get current metrics
  getMetrics(): Partial<PerformanceMetrics> {
    return { ...this.metrics }
  }

  // Stop monitoring
  stopMonitoring() {
    this.observers.forEach((observer) => observer.disconnect())
    this.observers.clear()
  }
}

// Bundle analyzer utility
export class BundleAnalyzer {
  private static chunks: Map<string, number> = new Map()
  private static modules: Map<string, number> = new Map()

  // Track chunk size
  static trackChunk(name: string, size: number) {
    this.chunks.set(name, size)
  }

  // Track module size
  static trackModule(name: string, size: number) {
    this.modules.set(name, size)
  }

  // Get bundle statistics
  static getBundleStats() {
    const totalChunkSize = Array.from(this.chunks.values()).reduce((sum, size) => sum + size, 0)
    const totalModuleSize = Array.from(this.modules.values()).reduce((sum, size) => sum + size, 0)

    return {
      chunks: {
        count: this.chunks.size,
        totalSize: totalChunkSize,
        averageSize: totalChunkSize / this.chunks.size,
        largest: Math.max(...this.chunks.values()),
        smallest: Math.min(...this.chunks.values()),
      },
      modules: {
        count: this.modules.size,
        totalSize: totalModuleSize,
        averageSize: totalModuleSize / this.modules.size,
        largest: Math.max(...this.modules.values()),
        smallest: Math.min(...this.modules.values()),
      },
    }
  }

  // Get largest chunks
  static getLargestChunks(limit: number = 10) {
    return Array.from(this.chunks.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([name, size]) => ({ name, size }))
  }

  // Get largest modules
  static getLargestModules(limit: number = 10) {
    return Array.from(this.modules.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([name, size]) => ({ name, size }))
  }
}

// Code splitting utility
export class CodeSplitter {
  private static loadedChunks: Set<string> = new Set()
  private static loadingChunks: Map<string, Promise<unknown>> = new Map()

  // Dynamic import with caching
  static async loadChunk(chunkName: string, importFn: () => Promise<unknown>) {
    // Check if already loaded
    if (this.loadedChunks.has(chunkName)) {
      return
    }

    // Check if currently loading
    if (this.loadingChunks.has(chunkName)) {
      return this.loadingChunks.get(chunkName)
    }

    // Start loading
    const loadPromise = importFn().then((module) => {
      this.loadedChunks.add(chunkName)
      this.loadingChunks.delete(chunkName)
      return module
    })

    this.loadingChunks.set(chunkName, loadPromise)
    return loadPromise
  }

  // Preload chunk
  static preloadChunk(chunkName: string, importFn: () => Promise<unknown>) {
    if (!this.loadedChunks.has(chunkName) && !this.loadingChunks.has(chunkName)) {
      this.loadChunk(chunkName, importFn)
    }
  }

  // Get loading status
  static getLoadingStatus() {
    return {
      loaded: Array.from(this.loadedChunks),
      loading: Array.from(this.loadingChunks.keys()),
    }
  }
}

// Image optimization utility
export class ImageOptimizer {
  private static imageCache: Map<string, string> = new Map()
  private static loadingImages: Map<string, Promise<string>> = new Map()

  // Optimize image with lazy loading
  static async optimizeImage(
    src: string,
    options: {
      width?: number
      height?: number
      quality?: number
      format?: 'webp' | 'jpeg' | 'png'
    } = {}
  ): Promise<string> {
    const cacheKey = `${src}:${JSON.stringify(options)}`

    // Check cache
    if (this.imageCache.has(cacheKey)) {
      return this.imageCache.get(cacheKey)!
    }

    // Check if currently loading
    if (this.loadingImages.has(cacheKey)) {
      return this.loadingImages.get(cacheKey)!
    }

    // Start optimization
    const optimizePromise = this.performOptimization(src).then((optimizedSrc) => {
      this.imageCache.set(cacheKey, optimizedSrc)
      this.loadingImages.delete(cacheKey)
      return optimizedSrc
    })

    this.loadingImages.set(cacheKey, optimizePromise)
    return optimizePromise
  }

  private static async performOptimization(src: string): Promise<string> {
    // For now, return the original src
    // In a real implementation, you would use a service like Cloudinary, imgix, or similar
    return src
  }

  // Preload image
  static preloadImage(src: string) {
    if (!this.imageCache.has(src) && !this.loadingImages.has(src)) {
      this.optimizeImage(src)
    }
  }

  // Get cache statistics
  static getCacheStats() {
    return {
      cachedImages: this.imageCache.size,
      loadingImages: this.loadingImages.size,
    }
  }
}

// Memory management utility
export class MemoryManager {
  private static memoryThreshold = 0.8 // 80% of available memory
  private static cleanupCallbacks: Set<() => void> = new Set()

  // Register cleanup callback
  static registerCleanup(callback: () => void) {
    this.cleanupCallbacks.add(callback)
  }

  // Unregister cleanup callback
  static unregisterCleanup(callback: () => void) {
    this.cleanupCallbacks.delete(callback)
  }

  // Check memory usage and trigger cleanup if needed
  static checkMemoryUsage() {
    if ('memory' in performance) {
      const memory = (performance as { memory: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory
      const usageRatio = memory.usedJSHeapSize / memory.jsHeapSizeLimit

      if (usageRatio > this.memoryThreshold) {
        this.triggerCleanup()
      }
    }
  }

  // Trigger cleanup
  private static triggerCleanup() {
    console.warn('Memory usage high, triggering cleanup...')
    this.cleanupCallbacks.forEach((callback) => {
      try {
        callback()
      } catch (error) {
        console.error('Cleanup callback failed:', error)
      }
    })
  }

  // Set memory threshold
  static setMemoryThreshold(threshold: number) {
    this.memoryThreshold = Math.max(0, Math.min(1, threshold))
  }

  // Get memory usage
  static getMemoryUsage() {
    if ('memory' in performance) {
      const memory = (
        performance as {
          memory: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number }
        }
      ).memory
      return {
        used: memory.usedJSHeapSize,
        total: memory.totalJSHeapSize,
        limit: memory.jsHeapSizeLimit,
        usageRatio: memory.usedJSHeapSize / memory.jsHeapSizeLimit,
      }
    }
    return null
  }
}

// Performance reporting utility
export class PerformanceReporter {
  private static reports: PerformanceMetrics[] = []
  private static maxReports = 100

  // Add performance report
  static addReport(metrics: PerformanceMetrics) {
    this.reports.push(metrics)

    // Keep only the latest reports
    if (this.reports.length > this.maxReports) {
      this.reports = this.reports.slice(-this.maxReports)
    }
  }

  // Get performance reports
  static getReports(): PerformanceMetrics[] {
    return [...this.reports]
  }

  // Get average metrics
  static getAverageMetrics(): Partial<PerformanceMetrics> {
    if (this.reports.length === 0) return {}

    const sum = this.reports.reduce(
      (acc, report) => ({
        loadTime: (acc.loadTime || 0) + report.loadTime,
        firstContentfulPaint: (acc.firstContentfulPaint || 0) + report.firstContentfulPaint,
        largestContentfulPaint: (acc.largestContentfulPaint || 0) + report.largestContentfulPaint,
        firstInputDelay: (acc.firstInputDelay || 0) + report.firstInputDelay,
        cumulativeLayoutShift: (acc.cumulativeLayoutShift || 0) + report.cumulativeLayoutShift,
        memoryUsage: (acc.memoryUsage || 0) + report.memoryUsage,
        renderCount: (acc.renderCount || 0) + report.renderCount,
        renderTime: (acc.renderTime || 0) + report.renderTime,
      }),
      {} as Partial<PerformanceMetrics>
    )

    const count = this.reports.length
    return {
      loadTime: (sum.loadTime ?? 0) / count,
      firstContentfulPaint: (sum.firstContentfulPaint ?? 0) / count,
      largestContentfulPaint: (sum.largestContentfulPaint ?? 0) / count,
      firstInputDelay: (sum.firstInputDelay ?? 0) / count,
      cumulativeLayoutShift: (sum.cumulativeLayoutShift ?? 0) / count,
      memoryUsage: (sum.memoryUsage ?? 0) / count,
      renderCount: (sum.renderCount ?? 0) / count,
      renderTime: (sum.renderTime ?? 0) / count,
    }
  }

  // Clear reports
  static clearReports() {
    this.reports = []
  }

  // Export reports
  static exportReports(): string {
    return JSON.stringify(this.reports, null, 2)
  }
}

// Performance optimization utilities
export const performanceUtils = {
  // Debounce function
  debounce<T extends (...args: unknown[]) => unknown>(func: T, wait: number): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout
    return (...args: Parameters<T>) => {
      clearTimeout(timeout)
      timeout = setTimeout(() => func(...args), wait)
    }
  },

  // Throttle function
  throttle<T extends (...args: unknown[]) => unknown>(func: T, limit: number): (...args: Parameters<T>) => void {
    let inThrottle: boolean
    return (...args: Parameters<T>) => {
      if (!inThrottle) {
        func(...args)
        inThrottle = true
        setTimeout(() => (inThrottle = false), limit)
      }
    }
  },

  // Measure function execution time
  measureTime<T>(fn: () => T, label: string): T {
    const start = performance.now()
    const result = fn()
    const end = performance.now()
    console.log(`${label}: ${(end - start).toFixed(2)}ms`)
    return result
  },

  // Async measure function execution time
  async measureTimeAsync<T>(fn: () => Promise<T>, label: string): Promise<T> {
    const start = performance.now()
    const result = await fn()
    const end = performance.now()
    console.log(`${label}: ${(end - start).toFixed(2)}ms`)
    return result
  },

  // Check if element is in viewport
  isInViewport(element: Element): boolean {
    const rect = element.getBoundingClientRect()
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    )
  },

  // Format bytes
  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  },

  // Format milliseconds
  formatMilliseconds(ms: number): string {
    if (ms < 1000) return `${ms.toFixed(0)}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  },
}

// Initialize performance monitoring
export function initializePerformanceMonitoring() {
  const observer = PerformanceObserver.getInstance()
  observer.startMonitoring()

  // Set up memory monitoring
  setInterval(() => {
    MemoryManager.checkMemoryUsage()
  }, 30000) // Check every 30 seconds

  // Set up performance reporting
  window.addEventListener('load', () => {
    setTimeout(() => {
      const metrics = observer.getMetrics()
      PerformanceReporter.addReport(metrics as PerformanceMetrics)
    }, 1000)
  })

  console.log('Performance monitoring initialized')
}

// All classes are already exported via their class declarations above
