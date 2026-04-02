import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/'

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  timeout: Number(import.meta.env.VITE_API_TIMEOUT_MS || 30000),
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const serverData = error.response?.data
    const serverError =
      typeof serverData?.error === 'string'
        ? serverData.error
        : serverData?.error && typeof serverData.error === 'object'
          ? Object.entries(serverData.error)
              .map(([field, messages]) => {
                if (Array.isArray(messages)) return `${field}: ${messages.join(', ')}`
                return `${field}: ${String(messages)}`
              })
              .join(' | ')
          : ''
    const isTimeout = error.code === 'ECONNABORTED' || String(error.message || '').includes('timeout')
    const normalizedError = {
      message: isTimeout
        ? 'Request timed out. Please wait a few seconds and try again.'
        : error.response?.data?.detail ||
          error.response?.data?.message ||
          serverError ||
          error.message ||
          'Something went wrong.',
      status: error.response?.status || 500,
      data: error.response?.data || null,
    }
    return Promise.reject(normalizedError)
  },
)

export default api

