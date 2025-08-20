import bcrypt from 'bcryptjs'

// Environment variables for authentication (Vite uses import.meta.env)
// Safe fallback for when running outside of Vite environment
const getEnvVar = (key: string, defaultValue: string = ''): string => {
  try {
    // Explicitly check for specific environment variables to avoid injection
    if (key === 'VITE_ADMIN_USERNAME') {
      return import.meta.env.VITE_ADMIN_USERNAME || defaultValue
    }
    if (key === 'VITE_ADMIN_PASSWORD_HASH') {
      return import.meta.env.VITE_ADMIN_PASSWORD_HASH || defaultValue
    }
    return defaultValue
  } catch {
    return defaultValue
  }
}

const ADMIN_USERNAME = getEnvVar('VITE_ADMIN_USERNAME', 'Jana')
const ADMIN_PASSWORD_HASH = getEnvVar('VITE_ADMIN_PASSWORD_HASH', '')

// Default password hash for 'inzi@123$%' (should be replaced with environment variable)
// This is a bcrypt hash of 'inzi@123$%' with 12 salt rounds
const DEFAULT_PASSWORD_HASH = '$2b$12$GiJ5u10SABuUkJh9yI4x7unxEXasQ.j9KXMcZG/NoZWQGGJ6OPLLq'

export interface AuthCredentials {
  username: string
  password: string
}

export interface AuthResult {
  success: boolean
  message: string
  user?: User
}

export interface User {
  id: string
  username: string
  name: string
  email: string
  role: string
  avatar?: string
}

/**
 * Secure authentication function
 * @param credentials - Username and password
 * @returns Authentication result
 */
export async function authenticateUser(credentials: AuthCredentials): Promise<AuthResult> {
  try {
    const { username, password } = credentials

    // Validate input
    if (!username || !password) {
      return {
        success: false,
        message: 'Username and password are required',
      }
    }

    // Check username
    if (username !== ADMIN_USERNAME) {
      return {
        success: false,
        message: 'Invalid username or password',
      }
    }

    // Verify password hash
    const passwordHash = ADMIN_PASSWORD_HASH || DEFAULT_PASSWORD_HASH
    const isValidPassword = await bcrypt.compare(password, passwordHash)

    if (!isValidPassword) {
      return {
        success: false,
        message: 'Invalid username or password',
      }
    }

    // Create user object
    const user: User = {
      id: 'admin-001',
      username: username,
      name: 'Administrator',
      email: 'admin@importmanager.com',
      role: 'admin',
      avatar: '/avatars/admin.jpg',
    }

    return {
      success: true,
      message: 'Authentication successful',
      user,
    }
  } catch (error) {
    console.error('Authentication error:', error)
    return {
      success: false,
      message: 'Authentication failed',
    }
  }
}

/**
 * Hash a password for storage
 * @param password - Plain text password
 * @returns Hashed password
 */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12
  return await bcrypt.hash(password, saltRounds)
}

/**
 * Check if user is authenticated
 * @returns boolean
 */
export function isAuthenticated(): boolean {
  return localStorage.getItem('isAuthenticated') === 'true'
}

/**
 * Get current user information
 * @returns User object or null if not authenticated
 */
export function getCurrentUser(): User | null {
  try {
    const userStr = localStorage.getItem('currentUser')
    if (!userStr) return null
    return JSON.parse(userStr) as User
  } catch (error) {
    console.error('Error parsing user data:', error)
    return null
  }
}

/**
 * Set authentication status and user information
 * @param authenticated - Authentication status
 * @param user - User information (optional)
 */
export function setAuthenticated(authenticated: boolean, user?: User): void {
  if (authenticated && user) {
    localStorage.setItem('isAuthenticated', 'true')
    localStorage.setItem('currentUser', JSON.stringify(user))
    // Also set legacy user data for backward compatibility
    localStorage.setItem('user_name', user.name)
    localStorage.setItem('user_email', user.email)
  } else {
    localStorage.removeItem('isAuthenticated')
    localStorage.removeItem('currentUser')
    localStorage.removeItem('user_name')
    localStorage.removeItem('user_email')
  }
}

/**
 * Logout user
 */
export function logout(): void {
  localStorage.removeItem('isAuthenticated')
  localStorage.removeItem('currentUser')
  localStorage.removeItem('user_name')
  localStorage.removeItem('user_email')
  window.location.href = '/login'
}

/**
 * Get current user ID for audit logging
 * @returns User ID or 'system' as fallback
 */
export function getCurrentUserId(): string {
  const user = getCurrentUser()
  return user?.id || 'system'
}

/**
 * Get current user name for audit logging
 * @returns User name or 'system' as fallback
 */
export function getCurrentUserName(): string {
  const user = getCurrentUser()
  return user?.name || 'system'
}
