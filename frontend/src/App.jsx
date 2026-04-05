import { AnimatePresence, motion } from 'framer-motion'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import Predict from './pages/Predict'
import Alerts from './pages/Alerts'
import Reports from './pages/Reports'
import Auth from './pages/Auth'
import { isAuthenticated } from './utils/auth'

const AUTHENTICATED_PATHS = ['/dashboard', '/predict', '/alerts', '/reports']

function ProtectedRoute({ children }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />
  }
  return children
}

function RouteTransition() {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
      >
        <Routes location={location}>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Auth />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/predict"
            element={
              <ProtectedRoute>
                <Predict />
              </ProtectedRoute>
            }
          />
          <Route
            path="/alerts"
            element={
              <ProtectedRoute>
                <Alerts />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <Reports />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  )
}

function App() {
  const location = useLocation()
  const isAuthedPage = AUTHENTICATED_PATHS.includes(location.pathname)
  const showFooter = location.pathname === '/' || location.pathname === '/login'

  return (
    <div className="app-shell">
      {isAuthedPage ? <Navbar /> : null}
      <main className={`content-shell ${isAuthedPage ? 'content-shell-authed' : 'content-shell-public'}`}>
        <RouteTransition />
      </main>
      {showFooter ? <Footer /> : null}
    </div>
  )
}

export default App

