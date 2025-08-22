// Remove unused import

// Cache configuration
export interface CacheConfig {
  ttl?: number // Time to live in milliseconds
  maxSize?: number // Maximum number of items
  namespace?: string // Namespace for localStorage/sessionStorage
}

export interface CacheItem<T> {
  data: T
  timestamp: number
  ttl: number
}

export interface CacheStats {
  hits: number
  misses: number
  size: number
  maxSize: number
  hitRate: number
}

// Memory Cache Implementation
class MemoryCache<T = unknown> {
  private cache = new Map<string, CacheItem<T>>()
  private stats = { hits: 0, misses: 0, size: 0, maxSize: 1000 }
  private config: Required<CacheConfig>

  constructor(config: CacheConfig = {}) {
    this.config = {
      ttl: config.ttl ?? 5 * 60 * 1000, // 5 minutes default
      maxSize: config.maxSize ?? 1000,
      namespace: config.namespace ?? 'app-cache',
    }
    this.stats.maxSize = this.config.maxSize
  }

  set(key: string, data: T, ttl?: number): void {
    const item: CacheItem<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl ?? this.config.ttl,
    }

    // Check if we need to evict items
    if (this.cache.size >= this.config.maxSize) {
      this.evictOldest()
    }

    this.cache.set(key, item)
    this.stats.size = this.cache.size
  }

  get(key: string): T | null {
    const item = this.cache.get(key)

    if (!item) {
      this.stats.misses++
      return null
    }

    // Check if item has expired
    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key)
      this.stats.misses++
      this.stats.size = this.cache.size
      return null
    }

    this.stats.hits++
    return item.data
  }

  has(key: string): boolean {
    return this.get(key) !== null
  }

  delete(key: string): boolean {
    const deleted = this.cache.delete(key)
    if (deleted) {
      this.stats.size = this.cache.size
    }
    return deleted
  }

  clear(): void {
    this.cache.clear()
    this.stats.size = 0
  }

  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses
    return {
      ...this.stats,
      hitRate: total > 0 ? this.stats.hits / total : 0,
    }
  }

  private evictOldest(): void {
    let oldestKey: string | null = null
    let oldestTime = Date.now()

    for (const [key, item] of this.cache.entries()) {
      if (item.timestamp < oldestTime) {
        oldestTime = item.timestamp
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey)
    }
  }
}

// Storage Cache Implementation (localStorage/sessionStorage)
class StorageCache<T = unknown> {
  private storage: Storage
  private config: Required<CacheConfig>

  constructor(storage: 'localStorage' | 'sessionStorage', config: CacheConfig = {}) {
    this.storage = storage === 'localStorage' ? window.localStorage : window.sessionStorage
    this.config = {
      ttl: config.ttl ?? 30 * 60 * 1000, // 30 minutes default
      maxSize: config.maxSize ?? 100,
      namespace: config.namespace ?? 'app-cache',
    }
  }

  private getKey(key: string): string {
    return `${this.config.namespace}:${key}`
  }

  set(key: string, data: T, ttl?: number): void {
    try {
      const item: CacheItem<T> = {
        data,
        timestamp: Date.now(),
        ttl: ttl ?? this.config.ttl,
      }

      const storageKey = this.getKey(key)
      this.storage.setItem(storageKey, JSON.stringify(item))
    } catch (error) {
      console.warn('Storage cache set failed:', error)
      // If storage is full, try to clear some old items
      this.cleanup()
    }
  }

  get(key: string): T | null {
    try {
      const storageKey = this.getKey(key)
      const itemStr = this.storage.getItem(storageKey)

      if (!itemStr) return null

      const item: CacheItem<T> = JSON.parse(itemStr)

      // Check if item has expired
      if (Date.now() - item.timestamp > item.ttl) {
        this.storage.removeItem(storageKey)
        return null
      }

      return item.data
    } catch (error) {
      console.warn('Storage cache get failed:', error)
      return null
    }
  }

  has(key: string): boolean {
    return this.get(key) !== null
  }

  delete(key: string): boolean {
    try {
      const storageKey = this.getKey(key)
      this.storage.removeItem(storageKey)
      return true
    } catch (error) {
      console.warn('Storage cache delete failed:', error)
      return false
    }
  }

  clear(): void {
    try {
      const keys = Object.keys(this.storage)
      keys.forEach((key) => {
        if (key.startsWith(this.config.namespace + ':')) {
          this.storage.removeItem(key)
        }
      })
    } catch (error) {
      console.warn('Storage cache clear failed:', error)
    }
  }

  private cleanup(): void {
    try {
      const keys = Object.keys(this.storage)
      const cacheKeys = keys.filter((key) => key.startsWith(this.config.namespace + ':'))

      if (cacheKeys.length > this.config.maxSize) {
        // Remove oldest items
        const items = cacheKeys
          .map((key) => ({
            key,
            timestamp: this.getTimestamp(key),
          }))
          .sort((a, b) => a.timestamp - b.timestamp)

        const toRemove = items.slice(0, cacheKeys.length - this.config.maxSize)
        toRemove.forEach((item) => this.storage.removeItem(item.key))
      }
    } catch (error) {
      console.warn('Storage cache cleanup failed:', error)
    }
  }

  private getTimestamp(key: string): number {
    try {
      const itemStr = this.storage.getItem(key)
      if (itemStr) {
        const item = JSON.parse(itemStr)
        return item.timestamp || 0
      }
    } catch (error) {
      console.warn('Failed to get timestamp:', error)
    }
    return 0
  }
}

// Cache Manager - Main interface for all caching operations
export class CacheManager {
  private memoryCache: MemoryCache
  private localStorageCache: StorageCache
  private sessionStorageCache: StorageCache

  constructor(config: CacheConfig = {}) {
    this.memoryCache = new MemoryCache(config)
    this.localStorageCache = new StorageCache('localStorage', config)
    this.sessionStorageCache = new StorageCache('sessionStorage', config)
  }

  // Memory cache operations (fastest, but lost on page reload)
  memory = {
    set: <T>(key: string, data: T, ttl?: number) => this.memoryCache.set(key, data, ttl),
    get: <T>(key: string): T | null => this.memoryCache.get(key),
    has: (key: string) => this.memoryCache.has(key),
    delete: (key: string) => this.memoryCache.delete(key),
    clear: () => this.memoryCache.clear(),
    getStats: () => this.memoryCache.getStats(),
  }

  // Session storage cache operations (persists during session)
  session = {
    set: <T>(key: string, data: T, ttl?: number) => this.sessionStorageCache.set(key, data, ttl),
    get: <T>(key: string): T | null => this.sessionStorageCache.get(key),
    has: (key: string) => this.sessionStorageCache.has(key),
    delete: (key: string) => this.sessionStorageCache.delete(key),
    clear: () => this.sessionStorageCache.clear(),
  }

  // Local storage cache operations (persists across sessions)
  persistent = {
    set: <T>(key: string, data: T, ttl?: number) => this.localStorageCache.set(key, data, ttl),
    get: <T>(key: string): T | null => this.localStorageCache.get(key),
    has: (key: string) => this.localStorageCache.has(key),
    delete: (key: string) => this.localStorageCache.delete(key),
    clear: () => this.localStorageCache.clear(),
  }

  // Smart cache that tries memory first, then session, then persistent
  smart = {
    set: <T>(key: string, data: T, ttl?: number) => {
      this.memoryCache.set(key, data, ttl)
      this.sessionStorageCache.set(key, data, ttl)
    },
    get: <T>(key: string): T | null => {
      // Try memory first
      let data = this.memoryCache.get(key) as T
      if (data !== null) return data

      // Try session storage
      data = this.sessionStorageCache.get(key) as T
      if (data !== null) {
        // Restore to memory cache
        this.memoryCache.set(key, data, CACHE_TTL.MEMORY)
        return data
      }

      // Try persistent storage
      data = this.localStorageCache.get(key) as T
      if (data !== null) {
        // Restore to memory and session cache
        this.memoryCache.set(key, data, CACHE_TTL.MEMORY)
        this.sessionStorageCache.set(key, data, CACHE_TTL.SESSION)
        return data
      }

      return null
    },
    has: (key: string) => {
      return this.memoryCache.has(key) || this.sessionStorageCache.has(key) || this.localStorageCache.has(key)
    },
    delete: (key: string) => {
      this.memoryCache.delete(key)
      this.sessionStorageCache.delete(key)
      this.localStorageCache.delete(key)
    },
    clear: () => {
      this.memoryCache.clear()
      this.sessionStorageCache.clear()
      this.localStorageCache.clear()
    },
  }

  // Clear all caches
  clearAll(): void {
    this.memoryCache.clear()
    this.sessionStorageCache.clear()
    this.localStorageCache.clear()
  }

  // Get cache statistics
  getStats() {
    return {
      memory: this.memoryCache.getStats(),
      session: { size: this.getSessionSize() },
      persistent: { size: this.getPersistentSize() },
    }
  }

  private getSessionSize(): number {
    try {
      const keys = Object.keys(sessionStorage)
      return keys.filter((key) => key.startsWith('app-cache:')).length
    } catch {
      return 0
    }
  }

  private getPersistentSize(): number {
    try {
      const keys = Object.keys(localStorage)
      return keys.filter((key) => key.startsWith('app-cache:')).length
    } catch {
      return 0
    }
  }
}

// Global cache instance
export const cache = new CacheManager()

// Utility functions for common caching patterns
export const cacheUtils = {
  // Cache with automatic key generation
  withKey: <T>(prefix: string, params: Record<string, unknown>, data: T, ttl?: number) => {
    const key = `${prefix}:${JSON.stringify(params)}`
    cache.memory.set(key, data, ttl)
    return key
  },

  // Cache with automatic invalidation
  withInvalidation: <T>(key: string, data: T, invalidateKeys: string[], ttl?: number) => {
    cache.memory.set(key, data, ttl)
    // Store invalidation info
    cache.memory.set(`${key}:invalidation`, invalidateKeys, ttl)
  },

  // Invalidate related caches
  invalidateRelated: (key: string) => {
    const invalidationKeys = cache.memory.get<string[]>(`${key}:invalidation`)
    if (invalidationKeys) {
      invalidationKeys.forEach((k) => cache.memory.delete(k))
      cache.memory.delete(`${key}:invalidation`)
    }
  },

  // Debounced cache set
  debouncedSet: <T>(key: string, data: T, ttl?: number, delay: number = 1000) => {
    setTimeout(() => {
      cache.memory.set(key, data, ttl)
    }, delay)
  },
}

// Cache keys constants
export const CACHE_KEYS = {
  // Data fetching
  SUPPLIERS: 'suppliers',
  SHIPMENTS: 'shipments',
  ITEMS: 'items',
  EXPENSES: 'expenses',
  BOES: 'boes',
  EXPENSE_TYPES: 'expense_types',
  SERVICE_PROVIDERS: 'service_providers',

  // UI state
  TABLE_STATE: 'table_state',
  FILTERS: 'filters',
  SORTING: 'sorting',
  PAGINATION: 'pagination',

  // User preferences
  SETTINGS: 'settings',
  THEME: 'theme',
  LAYOUT: 'layout',

  // Computed data
  DASHBOARD_STATS: 'dashboard_stats',
  REPORTS: 'reports',
  CALCULATIONS: 'calculations',
} as const

// Cache TTL constants
export const CACHE_TTL = {
  SHORT: 30 * 1000, // 30 seconds
  MEDIUM: 5 * 60 * 1000, // 5 minutes
  LONG: 30 * 60 * 1000, // 30 minutes
  VERY_LONG: 24 * 60 * 60 * 1000, // 24 hours
  PERSISTENT: 7 * 24 * 60 * 60 * 1000, // 7 days
  MEMORY: 5 * 60 * 1000, // 5 minutes for memory cache
  SESSION: 30 * 60 * 1000, // 30 minutes for session cache
} as const
