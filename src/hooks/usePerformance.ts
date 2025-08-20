import { useState, useEffect, useCallback, useMemo, useRef, useTransition } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { cache, CACHE_TTL } from '@/lib/cache'

// Performance monitoring hook
export function usePerformanceMonitor(componentName: string) {
  const renderCount = useRef(0)
  const lastRenderTime = useRef(performance.now())
  const [isTransitioning, startTransition] = useTransition()

  useEffect(() => {
    renderCount.current++
    const now = performance.now()
    const timeSinceLastRender = now - lastRenderTime.current
    lastRenderTime.current = now

    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[${componentName}] Render #${renderCount.current} (${timeSinceLastRender.toFixed(2)}ms)`
      )
    }
  })

  return {
    renderCount: renderCount.current,
    isTransitioning,
    startTransition,
  }
}

// Optimized data fetching with caching
export function useCachedData<T>(
  key: string,
  fetchFn: () => Promise<T>,
  options: {
    ttl?: number
    cacheType?: 'memory' | 'session' | 'persistent' | 'smart'
    enabled?: boolean
    onError?: (error: Error) => void
    onSuccess?: (data: T) => void
    refetchOnMount?: boolean
    refetchOnWindowFocus?: boolean
  } = {}
) {
  const {
    ttl = CACHE_TTL.MEDIUM,
    cacheType = 'smart',
    enabled = true,
    onError,
    onSuccess,
    refetchOnMount = true,
    refetchOnWindowFocus = false,
  } = options

  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [lastFetched, setLastFetched] = useState<number | null>(null)

  const cacheInstance = cache[cacheType]

  const fetchData = useCallback(
    async (force = false) => {
      if (!enabled) return

      // Check cache first (unless forced)
      if (!force) {
        const cachedData = cacheInstance.get<T>(key)
        if (cachedData !== null) {
          setData(cachedData)
          setError(null)
          return
        }
      }

      setLoading(true)
      setError(null)

      try {
        const result = await fetchFn()

        // Cache the result
        cacheInstance.set(key, result, ttl)

        setData(result)
        setLastFetched(Date.now())
        onSuccess?.(result)
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        setError(error)
        onError?.(error)
        console.error(`Failed to fetch data for key "${key}":`, error)
      } finally {
        setLoading(false)
      }
    },
    [key, fetchFn, ttl, cacheType, enabled, onSuccess, onError]
  )

  const refetch = useCallback(() => fetchData(true), [fetchData])

  const invalidate = useCallback(() => {
    cacheInstance.delete(key)
    setData(null)
    setLastFetched(null)
  }, [key, cacheInstance])

  // Initial fetch
  useEffect(() => {
    if (refetchOnMount) {
      fetchData()
    }
  }, [fetchData, refetchOnMount])

  // Refetch on window focus
  useEffect(() => {
    if (!refetchOnWindowFocus) return

    const handleFocus = () => {
      // Only refetch if data is stale (older than TTL)
      if (lastFetched && Date.now() - lastFetched > ttl) {
        fetchData()
      }
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [fetchData, refetchOnWindowFocus, lastFetched, ttl])

  return {
    data,
    loading,
    error,
    refetch,
    invalidate,
    lastFetched,
  }
}

// Optimized data fetching for Tauri commands
export function useTauriData<T>(
  command: string,
  params: Record<string, any> = {},
  options: {
    ttl?: number
    cacheType?: 'memory' | 'session' | 'persistent' | 'smart'
    enabled?: boolean
    onError?: (error: Error) => void
    onSuccess?: (data: T) => void
    refetchOnMount?: boolean
    refetchOnWindowFocus?: boolean
  } = {}
) {
  const cacheKey = useMemo(() => {
    const paramString = JSON.stringify(params)
    return `${command}:${paramString}`
  }, [command, params])

  const fetchFn = useCallback(async (): Promise<T> => {
    return invoke<T>(command, params)
  }, [command, params])

  return useCachedData(cacheKey, fetchFn, options)
}

// Optimized list data with pagination and filtering
export function useOptimizedList<T>(
  fetchFn: (params: { page: number; pageSize: number; filters?: any }) => Promise<{
    data: T[]
    total: number
    page: number
    pageSize: number
  }>,
  options: {
    initialPage?: number
    initialPageSize?: number
    initialFilters?: any
    ttl?: number
    cacheType?: 'memory' | 'session' | 'persistent' | 'smart'
  } = {}
) {
  const {
    initialPage = 1,
    initialPageSize = 50,
    initialFilters = {},
    ttl = CACHE_TTL.SHORT,
    cacheType = 'memory',
  } = options

  const [page, setPage] = useState(initialPage)
  const [pageSize, setPageSize] = useState(initialPageSize)
  const [filters, setFilters] = useState(initialFilters)
  const [data, setData] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const cacheInstance = cache[cacheType]

  const fetchData = useCallback(async () => {
    const cacheKey = `list:${JSON.stringify({ page, pageSize, filters })}`

    // Check cache first
    const cached = cacheInstance.get<{ data: T[]; total: number }>(cacheKey)
    if (cached) {
      setData(cached.data)
      setTotal(cached.total)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await fetchFn({ page, pageSize, filters })

      // Cache the result
      cacheInstance.set(cacheKey, { data: result.data, total: result.total }, ttl)

      setData(result.data)
      setTotal(result.total)
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      setError(error)
      console.error('Failed to fetch list data:', error)
    } finally {
      setLoading(false)
    }
  }, [fetchFn, page, pageSize, filters, cacheInstance, ttl])

  const updateFilters = useCallback((newFilters: any) => {
    setFilters(newFilters)
    setPage(1) // Reset to first page when filters change
  }, [])

  const goToPage = useCallback((newPage: number) => {
    setPage(newPage)
  }, [])

  const updatePageSize = useCallback((newPageSize: number) => {
    setPageSize(newPageSize)
    setPage(1) // Reset to first page when page size changes
  }, [])

  // Fetch data when dependencies change
  useEffect(() => {
    fetchData()
  }, [fetchData])

  return {
    data,
    total,
    page,
    pageSize,
    filters,
    loading,
    error,
    updateFilters,
    goToPage,
    updatePageSize,
    refetch: fetchData,
  }
}

// Optimized form state with debounced updates
export function useOptimizedForm<T extends Record<string, any>>(
  initialData: T,
  options: {
    debounceMs?: number
    validateOnChange?: boolean
    validateFn?: (data: T) => string[] | null
    onDataChange?: (data: T) => void
  } = {}
) {
  const { debounceMs = 300, validateOnChange = false, validateFn, onDataChange } = options

  const [data, setData] = useState<T>(initialData)
  const [errors, setErrors] = useState<string[]>([])
  const [isValidating, setIsValidating] = useState(false)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  const validate = useCallback(
    async (formData: T) => {
      if (!validateFn) return null

      setIsValidating(true)
      try {
        const validationErrors = await validateFn(formData)
        setErrors(validationErrors || [])
        return validationErrors
      } finally {
        setIsValidating(false)
      }
    },
    [validateFn]
  )

  const updateData = useCallback(
    (updates: Partial<T>) => {
      const newData = { ...data, ...updates }
      setData(newData)

      // Clear existing debounce
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }

      // Debounce the callback
      debounceRef.current = setTimeout(() => {
        onDataChange?.(newData)
        if (validateOnChange) {
          validate(newData)
        }
      }, debounceMs)
    },
    [data, onDataChange, validateOnChange, validate, debounceMs]
  )

  const reset = useCallback(
    (newData?: T) => {
      const resetData = newData || initialData
      setData(resetData)
      setErrors([])
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    },
    [initialData]
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  return {
    data,
    errors,
    isValidating,
    updateData,
    reset,
    validate: () => validate(data),
  }
}

// Optimized table state with caching
export function useOptimizedTable<T>(
  _data: T[],
  options: {
    storageKey?: string
    initialPageSize?: number
    enableCaching?: boolean
  } = {}
) {
  const { storageKey = 'table-state', initialPageSize = 50, enableCaching = true } = options

  const [sorting, setSorting] = useState<any[]>([])
  const [columnFilters, setColumnFilters] = useState<any[]>([])
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({})
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})
  const [globalFilter, setGlobalFilter] = useState('')
  const [pageSize, setPageSize] = useState(initialPageSize)

  // Load cached state on mount
  useEffect(() => {
    if (!enableCaching) return

    const cached = cache.session.get<{
      sorting: any[]
      columnFilters: any[]
      columnVisibility: Record<string, boolean>
      pageSize: number
    }>(`${storageKey}:state`)

    if (cached) {
      setSorting(cached.sorting)
      setColumnFilters(cached.columnFilters)
      setColumnVisibility(cached.columnVisibility)
      setPageSize(cached.pageSize)
    }
  }, [storageKey, enableCaching])

  // Cache state changes
  const cacheState = useCallback(() => {
    if (!enableCaching) return

    cache.session.set(
      `${storageKey}:state`,
      {
        sorting,
        columnFilters,
        columnVisibility,
        pageSize,
      },
      CACHE_TTL.LONG
    )
  }, [sorting, columnFilters, columnVisibility, pageSize, storageKey, enableCaching])

  useEffect(() => {
    cacheState()
  }, [cacheState])

  return {
    sorting,
    setSorting,
    columnFilters,
    setColumnFilters,
    columnVisibility,
    setColumnVisibility,
    rowSelection,
    setRowSelection,
    globalFilter,
    setGlobalFilter,
    pageSize,
    setPageSize,
  }
}

// Optimized image loading with caching
export function useOptimizedImage(
  src: string | null,
  options: {
    placeholder?: string
    fallback?: string
    cacheType?: 'memory' | 'session' | 'persistent'
  } = {}
) {
  const {
    placeholder = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjNmNGY2Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzY2NzM4NyIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkxvYWRpbmcuLi48L3RleHQ+PC9zdmc+',
    fallback = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjNmNGY2Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzY2NzM4NyIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkVycm9yPC90ZXh0Pjwvc3ZnPg==',
    cacheType = 'memory',
  } = options

  const [imageSrc, setImageSrc] = useState<string>(placeholder)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const cacheInstance = cache[cacheType]

  useEffect(() => {
    if (!src) {
      setImageSrc(placeholder)
      setError(false)
      return
    }

    // Check cache first
    const cached = cacheInstance.get<string>(`image:${src}`)
    if (cached) {
      setImageSrc(cached)
      setError(false)
      return
    }

    setLoading(true)
    setError(false)

    const img = new Image()

    img.onload = () => {
      setImageSrc(src)
      setLoading(false)
      setError(false)
      // Cache the successful image
      cacheInstance.set(`image:${src}`, src, CACHE_TTL.LONG)
    }

    img.onerror = () => {
      setImageSrc(fallback)
      setLoading(false)
      setError(true)
    }

    img.src = src

    return () => {
      img.onload = null
      img.onerror = null
    }
  }, [src, placeholder, fallback, cacheInstance])

  return {
    src: imageSrc,
    loading,
    error,
  }
}

// Optimized scroll position with caching
export function useOptimizedScroll(
  key: string,
  options: {
    debounceMs?: number
    cacheType?: 'session' | 'persistent'
  } = {}
) {
  const { debounceMs = 100, cacheType = 'session' } = options

  const [scrollPosition, setScrollPosition] = useState(0)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const cacheInstance = cache[cacheType]

  // Load cached position on mount
  useEffect(() => {
    const cached = cacheInstance.get<number>(`scroll:${key}`)
    if (cached !== null) {
      setScrollPosition(cached)
      window.scrollTo(0, cached)
    }
  }, [key, cacheInstance])

  // Save scroll position
  const saveScrollPosition = useCallback(
    (position: number) => {
      setScrollPosition(position)

      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }

      debounceRef.current = setTimeout(() => {
        cacheInstance.set(`scroll:${key}`, position, CACHE_TTL.LONG)
      }, debounceMs)
    },
    [key, cacheInstance, debounceMs]
  )

  // Scroll event handler
  useEffect(() => {
    const handleScroll = () => {
      const position = window.scrollY
      saveScrollPosition(position)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [saveScrollPosition])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  return {
    scrollPosition,
    saveScrollPosition,
  }
}

// Optimized window size with debouncing
export function useOptimizedWindowSize() {
  const [size, setSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  })

  useEffect(() => {
    let timeoutId: NodeJS.Timeout

    const handleResize = () => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        setSize({
          width: window.innerWidth,
          height: window.innerHeight,
        })
      }, 100)
    }

    window.addEventListener('resize', handleResize, { passive: true })
    return () => {
      window.removeEventListener('resize', handleResize)
      clearTimeout(timeoutId)
    }
  }, [])

  return size
}

// Optimized intersection observer
export function useOptimizedIntersectionObserver(
  options: {
    threshold?: number | number[]
    rootMargin?: string
    root?: Element | null
  } = {}
) {
  const [isIntersecting, setIsIntersecting] = useState(false)
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null)
  const elementRef = useRef<Element | null>(null)

  useEffect(() => {
    if (!elementRef.current) return

    const observer = new IntersectionObserver(([entry]) => {
      setIsIntersecting(entry.isIntersecting)
      setEntry(entry)
    }, options)

    observer.observe(elementRef.current)

    return () => {
      if (elementRef.current) {
        observer.unobserve(elementRef.current)
      }
    }
  }, [options])

  return {
    ref: elementRef,
    isIntersecting,
    entry,
  }
}
