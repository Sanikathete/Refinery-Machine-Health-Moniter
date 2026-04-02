import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import api from '../api/axios'

const MACHINE_OPTIONS = ['PUMP_1', 'PUMP_2', 'COMP_1', 'COMP_2', 'VALVE_1', 'VALVE_2']

const initialForm = {
  machine_id: MACHINE_OPTIONS[0],
  temperature: '85.4',
  pressure: '120.2',
  vibration: '0.75',
  flow_rate: '45.1',
  humidity: '60.3',
}

const FIELD_RULES = {
  temperature: { label: 'Temperature', min: 0 },
  pressure: { label: 'Pressure', min: 0 },
  vibration: { label: 'Vibration', min: 0 },
  flow_rate: { label: 'Flow Rate', min: 0 },
  humidity: { label: 'Humidity', min: 0 },
}

function normalizePredictionResponse(payload) {
  const predictionLabel = payload?.prediction?.prediction_label || payload?.prediction || 'HEALTHY'
  const confidenceValue = payload?.prediction?.confidence_score ?? payload?.confidence ?? 0
  const explanationText = payload?.gemini_explanation || payload?.explanation || 'No explanation available.'
  const warningText = payload?.gemini_warning || ''

  return {
    prediction: String(predictionLabel).toUpperCase(),
    confidence: Number(confidenceValue),
    explanation: explanationText,
    warning: warningText,
  }
}

export default function Predict() {
  const [formData, setFormData] = useState(initialForm)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const validateForm = () => {
    for (const [field, rule] of Object.entries(FIELD_RULES)) {
      const rawValue = formData[field]
      if (rawValue === '' || rawValue === null || rawValue === undefined) {
        return `${rule.label} is required.`
      }
      const numeric = Number(rawValue)
      if (!Number.isFinite(numeric)) {
        return `${rule.label} must be a valid number.`
      }
      if (numeric < rule.min) {
        return `${rule.label} must be greater than or equal to ${rule.min}.`
      }
    }
    return ''
  }

  useEffect(() => {
    if (!loading) return undefined
    const startedAt = Date.now()
    const timer = setInterval(() => {
      setElapsedSeconds((Date.now() - startedAt) / 1000)
    }, 200)

    return () => clearInterval(timer)
  }, [loading])

  const handleChange = (event) => {
    const { name, value } = event.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
    setResult(null)
    setError('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const requestStartedAt = Date.now()
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      setResult(null)
      return
    }
    setLoading(true)
    setError('')
    setResult(null)
    setElapsedSeconds(0)

    try {
      const payload = {
        machine_id: formData.machine_id,
        temperature: Number(formData.temperature),
        pressure: Number(formData.pressure),
        vibration: Number(formData.vibration),
        flow_rate: Number(formData.flow_rate),
        humidity: Number(formData.humidity),
      }
      const response = await api.post('/predict/', payload)
      setResult({
        ...normalizePredictionResponse(response.data),
        generatedAt: new Date().toLocaleString(),
        processingSeconds: (Date.now() - requestStartedAt) / 1000,
      })
    } catch (submitError) {
      setError(submitError.message || 'Prediction request failed.')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  const outcome = result?.prediction === 'FAILURE' ? 'failure' : 'healthy'

  return (
    <motion.section
      className="page"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <h2 className="section-title">Failure Prediction</h2>
      <p className="section-subtitle">
        Submit current sensor values to estimate equipment risk with an AI explanation.
      </p>

      <form onSubmit={handleSubmit} className="card" style={{ padding: '1rem' }}>
        <div className="form-grid">
          <label>
            Machine ID
            <select
              className="select"
              name="machine_id"
              value={formData.machine_id}
              onChange={handleChange}
              style={{ marginTop: '0.4rem' }}
            >
              {MACHINE_OPTIONS.map((machine) => (
                <option key={machine} value={machine}>
                  {machine}
                </option>
              ))}
            </select>
          </label>

          <label>
            Temperature
            <input
              className="input"
              type="number"
              step="0.01"
              min={FIELD_RULES.temperature.min}
              name="temperature"
              value={formData.temperature}
              onChange={handleChange}
              style={{ marginTop: '0.4rem' }}
            />
          </label>

          <label>
            Pressure
            <input
              className="input"
              type="number"
              step="0.01"
              min={FIELD_RULES.pressure.min}
              name="pressure"
              value={formData.pressure}
              onChange={handleChange}
              style={{ marginTop: '0.4rem' }}
            />
          </label>

          <label>
            Vibration
            <input
              className="input"
              type="number"
              step="0.01"
              min={FIELD_RULES.vibration.min}
              name="vibration"
              value={formData.vibration}
              onChange={handleChange}
              style={{ marginTop: '0.4rem' }}
            />
          </label>

          <label>
            Flow Rate
            <input
              className="input"
              type="number"
              step="0.01"
              min={FIELD_RULES.flow_rate.min}
              name="flow_rate"
              value={formData.flow_rate}
              onChange={handleChange}
              style={{ marginTop: '0.4rem' }}
            />
          </label>

          <label>
            Humidity
            <input
              className="input"
              type="number"
              step="0.01"
              min={FIELD_RULES.humidity.min}
              name="humidity"
              value={formData.humidity}
              onChange={handleChange}
              style={{ marginTop: '0.4rem' }}
            />
          </label>
        </div>

        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? `Predicting... ${elapsedSeconds.toFixed(1)}s` : 'Run Prediction'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setFormData(initialForm)
              setResult(null)
              setError('')
            }}
            disabled={loading}
          >
            Reset Inputs
          </button>
        </div>

        {error ? <p className="status-text status-error">{error}</p> : null}
      </form>

      {result ? (
        <section className="result-card card">
            <h3>Prediction Outcome</h3>
            <p className="card-meta">
              Generated at {result.generatedAt} | Processing time {result.processingSeconds.toFixed(2)}s
            </p>
            <div className="result-grid">
              <div>
                <p className="result-label">Status</p>
                <div className={`badge ${outcome === 'failure' ? 'badge-failure' : 'badge-healthy'}`}>
                  {result.prediction}
                </div>
              </div>
              <div>
                <p className="result-label">Confidence</p>
                <p className="result-value">{(Number(result.confidence || 0) * 100).toFixed(1)}%</p>
              </div>
            </div>

            <div className="explain-panel">
              <p className="result-label">Gemini Explanation</p>
              <p>{result.explanation || 'No explanation available.'}</p>
              {result.warning ? (
                <p className="status-text status-error" style={{ marginTop: '0.45rem' }}>
                  {result.warning}
                </p>
              ) : null}
            </div>
        </section>
      ) : null}
    </motion.section>
  )
}
