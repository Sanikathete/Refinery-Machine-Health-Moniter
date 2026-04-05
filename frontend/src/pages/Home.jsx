import { useEffect, useMemo, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import SectionTitle from '../components/SectionTitle'
import useIntersectionObserver from '../hooks/useIntersectionObserver'
import { isAuthenticated } from '../utils/auth'

const FEATURE_CARDS = [
  {
    icon: 'fas fa-tachometer-alt',
    title: 'Real-time Monitoring',
    description: 'Track live sensor telemetry across all machines instantly.',
    route: '/dashboard',
  },
  {
    icon: 'fas fa-brain',
    title: 'Failure Prediction',
    description: 'ML models estimate failure risk before costly downtime hits.',
    route: '/predict',
  },
  {
    icon: 'fas fa-bell',
    title: 'Instant Alerts',
    description: 'Critical issues get severity-tagged notifications the moment they trigger.',
    route: '/alerts',
  },
  {
    icon: 'fas fa-file-alt',
    title: 'AI Reports',
    description: 'Gemini AI generates structured machine health summaries on demand.',
    route: '/reports',
  },
]

const STATS = [
  { value: 50, suffix: '%', label: 'Reduction in Unplanned Downtime' },
  { value: 3, suffix: '×', label: 'Longer Equipment Lifespan' },
  { value: 260, prefix: '$', suffix: 'K/hr', label: 'Average Cost of Unplanned Downtime' },
]

function useCountUp(shouldStart) {
  const [values, setValues] = useState(STATS.map(() => 0))

  useEffect(() => {
    if (!shouldStart) return undefined
    const start = performance.now()
    const duration = 1000

    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1)
      setValues(STATS.map((stat) => stat.value * progress))
      if (progress < 1) {
        requestAnimationFrame(tick)
      }
    }

    requestAnimationFrame(tick)
    return undefined
  }, [shouldStart])

  return values
}

export default function Home() {
  const navigate = useNavigate()

  const featureObserver = useIntersectionObserver({ threshold: 0.15, triggerOnce: true })
  const ctaObserver = useIntersectionObserver({ threshold: 0.2, triggerOnce: true })
  const aboutObserver = useIntersectionObserver({ threshold: 0.2, triggerOnce: true })

  const countValues = useCountUp(aboutObserver.isIntersecting)

  const onProtectedNavigate = (targetRoute) => {
    if (isAuthenticated()) {
      navigate(targetRoute)
      return
    }
    window.localStorage.setItem('neurorefine_intended_route', targetRoute)
    navigate('/login')
  }

  const heroActions = useMemo(
    () => [
      {
        label: 'Go to Dashboard',
        type: 'primary',
        route: '/dashboard',
      },
      {
        label: 'Run Prediction',
        type: 'secondary',
        route: '/predict',
      },
    ],
    [],
  )

  return (
    <div className="home-page">
      <section className="home-hero" id="home">
        <header className="home-nav">
          <div className="home-nav-inner">
            <NavLink to="/" className="home-nav-brand">
              <span style={{ color: '#ffffff' }}>Neuro</span>
              <span style={{ color: '#f4a014' }}>Refine</span>
            </NavLink>
            <nav className="home-nav-links">
              <a href="#home">Home</a>
              <a href="#features">Features</a>
              <a href="#about">About</a>
              <NavLink to="/login">Login</NavLink>
            </nav>
          </div>
        </header>

        <div className="hero-content-wrap">
          <div className="hero-content">
            <div className="hero-tag hero-load hero-delay-0">MACHINE HEALTH MONITORING PLATFORM</div>
            <h1 className="hero-heading hero-load hero-delay-1">Predict. Prevent. Perform.</h1>
            <p className="hero-subtitle hero-load hero-delay-2">
              NeuroRefine uses real-time sensor telemetry and AI-powered prediction to keep your
              industrial machines running - before failure strikes.
            </p>
            <div className="hero-actions hero-load hero-delay-3">
              {heroActions.map((action) => (
                <button
                  type="button"
                  key={action.label}
                  className={action.type === 'primary' ? 'btn-template-primary' : 'btn-template-secondary'}
                  onClick={() => onProtectedNavigate(action.route)}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="home-section section-white" ref={featureObserver.ref}>
        <SectionTitle sublabel="WHAT WE OFFER" title="Intelligent Monitoring at Every Level" />
        <div className="feature-cards-grid">
          {FEATURE_CARDS.map((card, index) => (
            <button
              key={card.title}
              type="button"
              data-wow-delay={`${index * 0.15}s`}
              className={`feature-inner-box wow fadeInUp ${featureObserver.isIntersecting ? 'is-visible' : ''}`}
              style={{ animationDelay: `${index * 0.15}s` }}
              onClick={() => onProtectedNavigate(card.route)}
            >
              <span className="feature-icon-circle">
                <i className={card.icon} />
              </span>
              <h3>{card.title}</h3>
              <p>{card.description}</p>
            </button>
          ))}
        </div>
      </section>

      <section
        className={`home-cta-banner wow fadeInUp ${ctaObserver.isIntersecting ? 'is-visible' : ''}`}
        ref={ctaObserver.ref}
      >
        <h3>Ready to protect your machines?</h3>
        <p>Join NeuroRefine and get ahead of every failure before it happens.</p>
        <button type="button" className="btn-template-primary cta-large" onClick={() => navigate('/login')}>
          Get Started - Login Now
        </button>
      </section>

      <section id="about" className="home-section section-light" ref={aboutObserver.ref}>
        <SectionTitle sublabel="WHY IT MATTERS" title="What is Machine Health Monitoring?" />
        <div className="about-grid">
          <div className={`about-text wow fadeInLeft ${aboutObserver.isIntersecting ? 'is-visible' : ''}`}>
            <p>
              Machine Health Monitoring (MHM) is the continuous process of collecting and analysing
              sensor data - temperature, pressure, vibration, flow rate, humidity - from
              industrial equipment to assess its operational condition in real time.
            </p>
            <p>
              When anomalies appear in sensor readings, it is often the early signature of an
              impending failure. NeuroRefine detects these patterns using a trained Random Forest
              ML model and surfaces them before a breakdown can occur.
            </p>
            <p>
              Unplanned downtime costs manufacturers an average of $260,000 per hour. Predictive
              maintenance reduces this by up to 50%, extending equipment lifespan and dramatically
              cutting maintenance costs.
            </p>
          </div>

          <div className={`about-stats wow fadeInRight ${aboutObserver.isIntersecting ? 'is-visible' : ''}`}>
            {STATS.map((stat, index) => (
              <div key={stat.label} className="stat-box" style={{ animationDelay: `${index * 0.1}s` }}>
                <div className="stat-number">
                  {stat.prefix || ''}
                  {stat.suffix === 'K/hr' ? Math.round(countValues[index]) : Math.round(countValues[index] * 10) / 10}
                  {stat.suffix || ''}
                </div>
                <div className="stat-label">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

