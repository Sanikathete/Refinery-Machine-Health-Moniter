import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { setAuthToken } from '../utils/auth'

const SECTOR_OPTIONS = [
  'Technology',
  'Finance',
  'Healthcare',
  'Retail',
  'Manufacturing',
  'Education',
  'Real Estate',
  'Media & Entertainment',
  'Consulting',
  'Energy',
  'Other',
]

function getPasswordStrength(password) {
  if (!password) return { label: 'Weak', width: '0%', color: '#cbd5e0' }
  let score = 0
  if (password.length >= 6) score += 1
  if (/[A-Z]/.test(password)) score += 1
  if (/[0-9]/.test(password)) score += 1
  if (/[^A-Za-z0-9]/.test(password)) score += 1

  if (score <= 1) return { label: 'Weak', width: '33%', color: '#e53e3e' }
  if (score <= 3) return { label: 'Medium', width: '66%', color: '#d69e2e' }
  return { label: 'Strong', width: '100%', color: '#38a169' }
}

export default function Auth() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [loginForm, setLoginForm] = useState({ companyName: '', password: '' })
  const [signupForm, setSignupForm] = useState({
    companyName: '',
    sector: '',
    password: '',
    confirmPassword: '',
  })
  const [forgotForm, setForgotForm] = useState({
    companyName: '',
    newPassword: '',
    confirmPassword: '',
  })

  const signupStrength = useMemo(() => getPasswordStrength(signupForm.password), [signupForm.password])

  const handleLogin = async (event) => {
    event.preventDefault()
    if (!loginForm.companyName || !loginForm.password) {
      setError('Please fill in all fields')
      setSuccess('')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const response = await api.post('/auth/login/', {
        company_name: loginForm.companyName,
        password: loginForm.password,
      })

      const token =
        response.data?.token ||
        response.data?.access ||
        response.data?.access_token ||
        response.data?.key ||
        response.data?.session_token ||
        loginForm.companyName
      setAuthToken(token)

      const intendedRoute = window.localStorage.getItem('neurorefine_intended_route')
      if (intendedRoute) {
        window.localStorage.removeItem('neurorefine_intended_route')
      }
      navigate(intendedRoute || '/dashboard')
    } catch (requestError) {
      setError(requestError.message || 'Unable to login right now.')
    } finally {
      setLoading(false)
    }
  }

  const handleSignup = async (event) => {
    event.preventDefault()
    if (
      !signupForm.companyName ||
      !signupForm.sector ||
      !signupForm.password ||
      !signupForm.confirmPassword
    ) {
      setError('Please fill in all fields')
      setSuccess('')
      return
    }
    if (signupForm.password.length < 6) {
      setError('Password must be at least 6 characters.')
      setSuccess('')
      return
    }
    if (signupForm.password !== signupForm.confirmPassword) {
      setError('Passwords do not match.')
      setSuccess('')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      await api.post('/auth/signup/', {
        company_name: signupForm.companyName,
        sector: signupForm.sector,
        password: signupForm.password,
      })
      setSuccess('Sign up successful. Please login with your credentials.')
      setMode('login')
      setLoginForm({ companyName: signupForm.companyName, password: '' })
    } catch (requestError) {
      setError(requestError.message || 'Unable to sign up right now.')
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async (event) => {
    event.preventDefault()
    if (!forgotForm.companyName || !forgotForm.newPassword || !forgotForm.confirmPassword) {
      setError('Please fill in all fields')
      setSuccess('')
      return
    }
    if (forgotForm.newPassword !== forgotForm.confirmPassword) {
      setError('Passwords do not match.')
      setSuccess('')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      await api.post('/forgot-password/', {
        company_name: forgotForm.companyName,
        new_password: forgotForm.newPassword,
      })
      setSuccess('Password reset successful. You can now login with the new password.')
      setMode('login')
      setLoginForm({ companyName: forgotForm.companyName, password: '' })
    } catch (requestError) {
      setError(requestError.message || 'Unable to reset password right now.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="auth-page-bg">
      <div className="auth-card">
        <h1 className="auth-brand">
          <span style={{ color: '#1a2236' }}>Neuro</span>
          <span style={{ color: '#f4a014' }}>Refine</span>
        </h1>

        {mode !== 'forgot' ? (
          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => {
                setMode('login')
                setError('')
                setSuccess('')
              }}
            >
              Login
            </button>
            <button
              type="button"
              className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
              onClick={() => {
                setMode('signup')
                setError('')
                setSuccess('')
              }}
            >
              Sign Up
            </button>
          </div>
        ) : null}

        {mode === 'login' ? (
          <form className="auth-form" onSubmit={handleLogin}>
            <label className="template-label" htmlFor="login-company-name">
              Company Name
            </label>
            <input
              id="login-company-name"
              type="text"
              className="template-input"
              placeholder="Enter company name"
              value={loginForm.companyName}
              onChange={(event) => setLoginForm((prev) => ({ ...prev, companyName: event.target.value }))}
            />

            <label className="template-label" htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              className="template-input"
              placeholder="Enter password"
              value={loginForm.password}
              onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))}
            />

            <button type="submit" className="btn-template-primary full-width" disabled={loading}>
              {loading ? 'Logging in...' : 'Login'}
            </button>

            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setMode('forgot')
                setError('')
                setSuccess('')
              }}
            >
              Forgot password?
            </button>
          </form>
        ) : null}

        {mode === 'signup' ? (
          <form className="auth-form" onSubmit={handleSignup}>
            <label className="template-label" htmlFor="signup-company-name">
              Company Name
            </label>
            <input
              id="signup-company-name"
              type="text"
              className="template-input"
              placeholder="Enter company name"
              value={signupForm.companyName}
              onChange={(event) => setSignupForm((prev) => ({ ...prev, companyName: event.target.value }))}
            />

            <label className="template-label" htmlFor="signup-sector">
              Sector
            </label>
            <select
              id="signup-sector"
              className="template-input template-select"
              value={signupForm.sector}
              onChange={(event) => setSignupForm((prev) => ({ ...prev, sector: event.target.value }))}
            >
              <option value="" disabled>
                Select a sector
              </option>
              {SECTOR_OPTIONS.map((sector) => (
                <option value={sector} key={sector}>
                  {sector}
                </option>
              ))}
            </select>

            <label className="template-label" htmlFor="signup-password">
              Password
            </label>
            <input
              id="signup-password"
              type="password"
              className="template-input"
              placeholder="Create password"
              value={signupForm.password}
              onChange={(event) => setSignupForm((prev) => ({ ...prev, password: event.target.value }))}
            />

            <div className="password-strength-track" aria-hidden>
              <span
                className="password-strength-fill"
                style={{ width: signupStrength.width, background: signupStrength.color }}
              />
            </div>
            <p className="password-strength-text">Strength: {signupStrength.label}</p>

            <label className="template-label" htmlFor="signup-confirm-password">
              Confirm Password
            </label>
            <input
              id="signup-confirm-password"
              type="password"
              className="template-input"
              placeholder="Confirm password"
              value={signupForm.confirmPassword}
              onChange={(event) => setSignupForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
            />

            <button type="submit" className="btn-template-primary full-width" disabled={loading}>
              {loading ? 'Creating account...' : 'Sign Up'}
            </button>
          </form>
        ) : null}

        {mode === 'forgot' ? (
          <form className="auth-form" onSubmit={handleForgotPassword}>
            <label className="template-label" htmlFor="forgot-company-name">
              Company Name
            </label>
            <input
              id="forgot-company-name"
              type="text"
              className="template-input"
              placeholder="Enter company name"
              value={forgotForm.companyName}
              onChange={(event) => setForgotForm((prev) => ({ ...prev, companyName: event.target.value }))}
            />

            <label className="template-label" htmlFor="forgot-new-password">
              New Password
            </label>
            <input
              id="forgot-new-password"
              type="password"
              className="template-input"
              placeholder="Enter new password"
              value={forgotForm.newPassword}
              onChange={(event) => setForgotForm((prev) => ({ ...prev, newPassword: event.target.value }))}
            />

            <label className="template-label" htmlFor="forgot-confirm-password">
              Confirm Password
            </label>
            <input
              id="forgot-confirm-password"
              type="password"
              className="template-input"
              placeholder="Confirm new password"
              value={forgotForm.confirmPassword}
              onChange={(event) => setForgotForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
            />

            <button type="submit" className="btn-template-primary full-width" disabled={loading}>
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>
            <button
              type="button"
              className="btn-template-secondary full-width"
              onClick={() => {
                setMode('login')
                setError('')
                setSuccess('')
              }}
            >
              Back to Login
            </button>
          </form>
        ) : null}

        {error ? <p className="status-text status-error">{error}</p> : null}
        {success ? <p className="status-text status-success">{success}</p> : null}
      </div>
    </section>
  )
}

