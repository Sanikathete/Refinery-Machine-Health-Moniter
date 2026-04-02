import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'

const NAV_ITEMS = [
  { to: '/', label: 'Home' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/predict', label: 'Predict' },
  { to: '/alerts', label: 'Alerts' },
  { to: '/reports', label: 'Reports' },
]

function Navbar() {
  return (
    <header className="top-nav-wrap">
      <nav className="top-nav card">
        <div className="brand-wrap">
          <span className="brand-icon">
            <i className="bi bi-fuel-pump-fill" />
          </span>
          <div className="brand-text">
            <strong>Refinery Monitor</strong>
            <small>Machine Health</small>
          </div>
        </div>

        <ul className="nav-list">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.to === '/'} className="nav-link">
                {({ isActive }) => (
                  <span className={`link-label ${isActive ? 'active' : ''}`}>
                    {item.label}
                    {isActive ? (
                      <motion.span
                        className="active-indicator"
                        layoutId="active-link-indicator"
                        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      />
                    ) : null}
                  </span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  )
}

export default Navbar
