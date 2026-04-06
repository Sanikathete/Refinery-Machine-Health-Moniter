import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { clearAuthToken } from '../utils/auth'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/predict', label: 'Predict' },
  { to: '/alerts', label: 'Alerts' },
  { to: '/reports', label: 'Reports' },
]

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false)
  const navigate = useNavigate()

  const handleLogout = () => {
    clearAuthToken()
    setIsOpen(false)
    navigate('/')
  }

  return (
    <header className="auth-header">
      <div className="auth-header-inner">
        <NavLink to="/dashboard" className="brand-logo" onClick={() => setIsOpen(false)}>
          <span style={{ color: '#ffffff' }}>Neuro</span>
          <span style={{ color: '#f4a014' }}>Refine</span>
        </NavLink>

        <button
          type="button"
          className="nav-toggle"
          aria-label="Toggle navigation menu"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((prev) => !prev)}
        >
          <span />
          <span />
          <span />
        </button>

        <nav className={`auth-nav ${isOpen ? 'open' : ''}`}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `auth-nav-link ${isActive ? 'active' : ''}`}
              onClick={() => setIsOpen(false)}
            >
              {item.label}
            </NavLink>
          ))}
          <button type="button" className="auth-nav-link logout-link" onClick={handleLogout}>
            Logout
          </button>
        </nav>
      </div>
    </header>
  )
}

