import { motion } from 'framer-motion'

const features = [
  {
    title: 'Real-time Monitoring',
    description: 'Track live refinery equipment telemetry to detect anomalies instantly.',
    icon: 'bi bi-activity',
  },
  {
    title: 'Failure Prediction',
    description: 'Use machine-learning outputs to estimate risk before downtime occurs.',
    icon: 'bi bi-graph-up-arrow',
  },
  {
    title: 'Instant Alerts',
    description: 'Prioritize critical issues with severity-tagged alert notifications.',
    icon: 'bi bi-bell-fill',
  },
  {
    title: 'AI Reports',
    description: 'Generate concise machine health summaries for maintenance planning.',
    icon: 'bi bi-file-earmark-richtext-fill',
  },
]

export default function Home() {
  return (
    <motion.section
      className="page"
      initial={{ opacity: 0, y: 26 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <motion.div
        className="hero"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.55 }}
      >
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
        >
          Predict. Prevent. Perform.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.2 }}
        >
          Monitor refinery machine health with real-time signals, proactive failure prediction,
          and AI-powered operational insights designed for reliability teams.
        </motion.p>
      </motion.div>

      <motion.div
        className="feature-grid"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.1 } },
        }}
        initial="hidden"
        animate="show"
      >
        {features.map((feature) => (
          <motion.article
            key={feature.title}
            className="feature-card card"
            variants={{
              hidden: { opacity: 0, y: 20 },
              show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
            }}
          >
            <span className="feature-icon">
              <i className={feature.icon} />
            </span>
            <h3>{feature.title}</h3>
            <p>{feature.description}</p>
          </motion.article>
        ))}
      </motion.div>
    </motion.section>
  )
}
