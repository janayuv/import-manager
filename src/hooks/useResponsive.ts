import { useState, useEffect } from 'react'

// Viewport breakpoints matching our CSS media queries
export const BREAKPOINTS = {
  xs: 475,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
  '3xl': 1920,
  '4xl': 2560,
} as const

export type Breakpoint = keyof typeof BREAKPOINTS

// Screen size categories for different device types
export const SCREEN_SIZES = {
  small: 1366, // Small laptop
  medium: 1920, // Standard monitor
  large: 2560, // Large monitor
} as const

export type ScreenSize = keyof typeof SCREEN_SIZES

interface ResponsiveState {
  width: number
  height: number
  breakpoint: Breakpoint
  screenSize: ScreenSize
  isSmallScreen: boolean
  isMediumScreen: boolean
  isLargeScreen: boolean
  isUltraWide: boolean
}

export const useResponsive = (): ResponsiveState => {
  const [state, setState] = useState<ResponsiveState>({
    width: window.innerWidth,
    height: window.innerHeight,
    breakpoint: 'lg',
    screenSize: 'medium',
    isSmallScreen: false,
    isMediumScreen: false,
    isLargeScreen: false,
    isUltraWide: false,
  })

  useEffect(() => {
    const updateResponsiveState = () => {
      const width = window.innerWidth
      const height = window.innerHeight

      // Determine breakpoint
      let breakpoint: Breakpoint = 'lg'
      if (width >= BREAKPOINTS['4xl']) breakpoint = '4xl'
      else if (width >= BREAKPOINTS['3xl']) breakpoint = '3xl'
      else if (width >= BREAKPOINTS['2xl']) breakpoint = '2xl'
      else if (width >= BREAKPOINTS.xl) breakpoint = 'xl'
      else if (width >= BREAKPOINTS.lg) breakpoint = 'lg'
      else if (width >= BREAKPOINTS.md) breakpoint = 'md'
      else if (width >= BREAKPOINTS.sm) breakpoint = 'sm'
      else if (width >= BREAKPOINTS.xs) breakpoint = 'xs'

      // Determine screen size category
      let screenSize: ScreenSize = 'medium'
      if (width >= SCREEN_SIZES.large) screenSize = 'large'
      else if (width >= SCREEN_SIZES.medium) screenSize = 'medium'
      else screenSize = 'small'

      setState({
        width,
        height,
        breakpoint,
        screenSize,
        isSmallScreen: width <= SCREEN_SIZES.small,
        isMediumScreen: width > SCREEN_SIZES.small && width <= SCREEN_SIZES.medium,
        isLargeScreen: width > SCREEN_SIZES.medium && width <= SCREEN_SIZES.large,
        isUltraWide: width > SCREEN_SIZES.large,
      })
    }

    // Initial call
    updateResponsiveState()

    // Add event listener
    window.addEventListener('resize', updateResponsiveState)

    // Cleanup
    return () => window.removeEventListener('resize', updateResponsiveState)
  }, [])

  return state
}

// Hook for responsive scaling values
export const useResponsiveScale = () => {
  const { screenSize } = useResponsive()

  const getScaleFactor = () => {
    switch (screenSize) {
      case 'small':
        return 0.9 // 10% smaller
      case 'medium':
        return 1.0 // Base size
      case 'large':
        return 1.1 // 10% larger
      default:
        return 1.0
    }
  }

  const getFontSize = (baseSize: number) => {
    const scaleFactor = getScaleFactor()
    return Math.round(baseSize * scaleFactor)
  }

  const getSpacing = (baseSpacing: number) => {
    const scaleFactor = getScaleFactor()
    return Math.round(baseSpacing * scaleFactor)
  }

  const getButtonSize = () => {
    switch (screenSize) {
      case 'small':
        return 'sm'
      case 'medium':
        return 'default'
      case 'large':
        return 'lg'
      default:
        return 'default'
    }
  }

  const getInputSize = () => {
    switch (screenSize) {
      case 'small':
        return 'sm'
      case 'medium':
        return 'default'
      case 'large':
        return 'lg'
      default:
        return 'default'
    }
  }

  const getTextSize = () => {
    switch (screenSize) {
      case 'small':
        return 'sm'
      case 'medium':
        return 'base'
      case 'large':
        return 'lg'
      default:
        return 'base'
    }
  }

  return {
    scaleFactor: getScaleFactor(),
    fontSize: getFontSize,
    spacing: getSpacing,
    buttonSize: getButtonSize(),
    inputSize: getInputSize(),
    textSize: getTextSize(),
    screenSize,
  }
}

// Hook for responsive class names
export const useResponsiveClasses = () => {
  const { screenSize } = useResponsive()

  const getResponsiveClass = (baseClass: string, size?: 'sm' | 'default' | 'lg' | 'xl') => {
    if (!size) {
      switch (screenSize) {
        case 'small':
          return `${baseClass}-sm`
        case 'medium':
          return baseClass
        case 'large':
          return `${baseClass}-lg`
        default:
          return baseClass
      }
    }
    return size === 'default' ? baseClass : `${baseClass}-${size}`
  }

  const getTextClass = (size?: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl') => {
    if (!size) {
      switch (screenSize) {
        case 'small':
          return 'text-fluid-sm'
        case 'medium':
          return 'text-fluid-base'
        case 'large':
          return 'text-fluid-lg'
        default:
          return 'text-fluid-base'
      }
    }
    return `text-fluid-${size}`
  }

  const getButtonClass = (size?: 'sm' | 'default' | 'lg') => {
    return getResponsiveClass('btn-fluid', size)
  }

  const getInputClass = (size?: 'sm' | 'default' | 'lg') => {
    return getResponsiveClass('input-fluid', size)
  }

  const getCardClass = (size?: 'sm' | 'default' | 'lg') => {
    return getResponsiveClass('card-fluid', size)
  }

  const getSpacingClass = (size?: 'sm' | 'default' | 'lg' | 'xl') => {
    return getResponsiveClass('space-fluid', size)
  }

  const getPaddingClass = (size?: 'sm' | 'default' | 'lg' | 'xl') => {
    return getResponsiveClass('p-fluid', size)
  }

  const getMarginClass = (size?: 'sm' | 'default' | 'lg' | 'xl') => {
    return getResponsiveClass('m-fluid', size)
  }

  return {
    textClass: getTextClass,
    buttonClass: getButtonClass,
    inputClass: getInputClass,
    cardClass: getCardClass,
    spacingClass: getSpacingClass,
    paddingClass: getPaddingClass,
    marginClass: getMarginClass,
    screenSize,
  }
}

// Hook for responsive layout decisions
export const useResponsiveLayout = () => {
  const { width, screenSize } = useResponsive()

  const getSidebarWidth = () => {
    switch (screenSize) {
      case 'small':
        return 'w-fluid-sidebar-sm'
      case 'medium':
        return 'w-fluid-sidebar'
      case 'large':
        return 'w-fluid-sidebar-lg'
      default:
        return 'w-fluid-sidebar'
    }
  }

  const getGridColumns = () => {
    switch (screenSize) {
      case 'small':
        return 'grid-cols-1 md:grid-cols-2'
      case 'medium':
        return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
      case 'large':
        return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
      default:
        return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
    }
  }

  const getTableLayout = () => {
    switch (screenSize) {
      case 'small':
        return 'overflow-x-auto'
      case 'medium':
        return ''
      case 'large':
        return ''
      default:
        return ''
    }
  }

  const shouldShowSidebar = () => {
    return width >= BREAKPOINTS.lg
  }

  const shouldUseCompactLayout = () => {
    return screenSize === 'small'
  }

  return {
    sidebarWidth: getSidebarWidth(),
    gridColumns: getGridColumns(),
    tableLayout: getTableLayout(),
    showSidebar: shouldShowSidebar(),
    useCompactLayout: shouldUseCompactLayout(),
    screenSize,
  }
}
