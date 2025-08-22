import React, { createContext, useContext, useEffect } from 'react'
import { useResponsive, useResponsiveScale, useResponsiveClasses, useResponsiveLayout } from '@/hooks/useResponsive'

interface ResponsiveContextType {
  isSmallScreen: boolean
  isMediumScreen: boolean
  isLargeScreen: boolean
  isUltraWide: boolean
  screenSize: 'small' | 'medium' | 'large'
  width: number
  height: number
  scaleFactor: number
  getResponsiveClass: (baseClass: string, size?: 'sm' | 'default' | 'lg' | 'xl') => string
  getTextClass: (size?: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl') => string
  getButtonClass: (size?: 'sm' | 'default' | 'lg') => string
  getInputClass: (size?: 'sm' | 'default' | 'lg') => string
  getTableClass: (variant?: 'default' | 'compact' | 'auto') => string
  getCardClass: (size?: 'sm' | 'default' | 'lg') => string
  getSpacingClass: (size?: 'sm' | 'default' | 'lg' | 'xl') => string
  getPaddingClass: (size?: 'sm' | 'default' | 'lg' | 'xl') => string
  getMarginClass: (size?: 'sm' | 'default' | 'lg' | 'xl') => string
  getSidebarWidth: () => string
  getGridColumns: () => string
  shouldShowSidebar: boolean
  useCompactLayout: boolean
}

const ResponsiveContext = createContext<ResponsiveContextType | undefined>(undefined)

export const useResponsiveContext = () => {
  const context = useContext(ResponsiveContext)
  if (!context) {
    throw new Error('useResponsiveContext must be used within a ResponsiveProvider')
  }
  return context
}

interface ResponsiveProviderProps {
  children: React.ReactNode
}

export const ResponsiveProvider: React.FC<ResponsiveProviderProps> = ({ children }) => {
  const responsive = useResponsive()
  const { scaleFactor } = useResponsiveScale()
  // Access class helpers (indirectly used via exposed methods)
  useResponsiveClasses()
  const { sidebarWidth, gridColumns, showSidebar, useCompactLayout } = useResponsiveLayout()

  // Apply responsive styles to document body
  useEffect(() => {
    const applyResponsiveStyles = () => {
      const body = document.body

      // Apply responsive font size
      body.style.fontSize = responsive.isSmallScreen
        ? 'clamp(12px, 0.8vw + 8px, 14px)'
        : responsive.isLargeScreen
          ? 'clamp(16px, 1.1vw + 12px, 20px)'
          : 'clamp(14px, 1vw + 10px, 18px)'

      // Apply responsive line height
      body.style.lineHeight = responsive.isSmallScreen ? '1.3' : '1.5'

      // Apply responsive spacing
      const root = document.documentElement
      root.style.setProperty('--responsive-scale', scaleFactor.toString())

      // Apply compact layout for small screens
      if (responsive.isSmallScreen) {
        body.classList.add('responsive-compact')
      } else {
        body.classList.remove('responsive-compact')
      }
    }

    applyResponsiveStyles()

    // Re-apply on resize
    const handleResize = () => {
      applyResponsiveStyles()
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [responsive.isSmallScreen, responsive.isLargeScreen, scaleFactor])

  const getResponsiveClass = (baseClass: string, size?: 'sm' | 'default' | 'lg' | 'xl') => {
    if (!size) {
      switch (responsive.screenSize) {
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
      switch (responsive.screenSize) {
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

  const getTableClass = (variant: 'default' | 'compact' | 'auto' = 'default') => {
    if (responsive.isSmallScreen && variant === 'default') {
      return 'table-fluid-compact'
    }
    if (variant === 'default') return 'table-fluid'
    if (variant === 'auto') return 'table-fluid-auto'
    if (variant === 'compact') return 'table-fluid-compact'
    return 'table-fluid'
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

  const getSidebarWidth = () => {
    return sidebarWidth
  }

  const getGridColumns = () => {
    return gridColumns
  }

  const contextValue: ResponsiveContextType = {
    isSmallScreen: responsive.isSmallScreen,
    isMediumScreen: responsive.isMediumScreen,
    isLargeScreen: responsive.isLargeScreen,
    isUltraWide: responsive.isUltraWide,
    screenSize: responsive.screenSize,
    width: responsive.width,
    height: responsive.height,
    scaleFactor,
    getResponsiveClass,
    getTextClass,
    getButtonClass,
    getInputClass,
    getTableClass,
    getCardClass,
    getSpacingClass,
    getPaddingClass,
    getMarginClass,
    getSidebarWidth,
    getGridColumns,
    shouldShowSidebar: showSidebar,
    useCompactLayout,
  }

  return <ResponsiveContext.Provider value={contextValue}>{children}</ResponsiveContext.Provider>
}
