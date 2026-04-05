export const AUTH_TOKEN_KEY = 'neurorefine_auth_token'

export function isAuthenticated() {
  if (typeof window === 'undefined') return false
  return Boolean(window.localStorage.getItem(AUTH_TOKEN_KEY))
}

export function setAuthToken(token) {
  if (typeof window === 'undefined') return
  const fallbackToken = `nr-session-${Date.now()}`
  window.localStorage.setItem(AUTH_TOKEN_KEY, token || fallbackToken)
}

export function clearAuthToken() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(AUTH_TOKEN_KEY)
}

