import { useEffect, useMemo, useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import api from '../api/axios'

const MACHINE_OPTIONS = ['PUMP_1', 'PUMP_2', 'COMP_1', 'COMP_2', 'VALVE_1', 'VALVE_2']
const PREDICTION_HISTORY_KEY = 'neurorefine_prediction_history_v1'

const initialForm = {
  machine_id: MACHINE_OPTIONS[0],
  temperature: '',
  pressure: '',
  vibration: '',
  flow_rate: '',
  humidity: '',
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

function getConfidencePercent(confidence) {
  const base = Number(confidence || 0)
  return base <= 1 ? base * 100 : base
}

export default function Predict() {
  const [formData, setFormData] = useState(initialForm)
  const [result, setResult] = useState(null)
  const [history, setHistory] = useState(() => {
    try {
      const raw = window.localStorage.getItem(PREDICTION_HISTORY_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.slice(0, 10) : []
    } catch {
      return []
    }
  })
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

  useEffect(() => {
    try {
      window.localStorage.setItem(PREDICTION_HISTORY_KEY, JSON.stringify(history.slice(-10)))
    } catch {
      // Ignore storage errors and keep in-memory history.
    }
  }, [history])

  const handleChange = (event) => {
    const { name, value } = event.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    setError('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    setError('')
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
      const normalized = normalizePredictionResponse(response.data)
      const confidencePercent = getConfidencePercent(normalized.confidence)
      const timestamp = new Date()
      const historyEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: timestamp.toLocaleDateString(),
        result: normalized.prediction,
        confidence: confidencePercent,
        machine_id: payload.machine_id,
      }

      setResult({
        ...normalized,
        confidencePercent,
        generatedAt: timestamp.toLocaleString(),
      })
      setHistory((prev) => [...prev, historyEntry].slice(-10))
    } catch (submitError) {
      setError(submitError.message || 'Prediction request failed.')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  const outcomeMixData = useMemo(() => {
    const healthyCount = history.filter((entry) => entry.result !== 'FAILURE').length
    const failureCount = history.filter((entry) => entry.result === 'FAILURE').length
    return [
      { name: 'Healthy', value: healthyCount, color: '#38a169' },
      { name: 'Failure', value: failureCount, color: '#e53e3e' },
    ]
  }, [history])
  const totalRuns = history.length

  const outcome = result?.prediction === 'FAILURE' ? 'failure' : 'healthy'

  return (
    <section className="app-page">
      <div className="template-header-card">
        <div>
          <div className="template-sublabel">RUN AI-POWERED RISK ASSESSMENT ON LIVE OR MANUAL SENSOR INPUTS</div>
          <h2 className="template-page-title">Failure Prediction Engine</h2>
        </div>
      </div>

      <form className="predict-form-card" onSubmit={handleSubmit}>
        <div className="template-sublabel">ENTER SENSOR READINGS</div>
        <div className="predict-form-grid">
          <label>
            <span className="template-label">Machine ID</span>
            <select
              className="template-input template-select"
              name="machine_id"
              value={formData.machine_id}
              onChange={handleChange}
            >
              <option value="" disabled>
                Select machine
              </option>
              {MACHINE_OPTIONS.map((machine) => (
                <option key={machine} value={machine}>
                  {machine}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="template-label">Temperature</span>
            <input
              className="template-input"
              type="number"
              step="0.01"
              min={FIELD_RULES.temperature.min}
              name="temperature"
              value={formData.temperature}
              onChange={handleChange}
              placeholder="e.g. 75.0 (Threshold: > 91 C)"
            />
          </label>

          <label>
            <span className="template-label">Pressure</span>
            <input
              className="template-input"
              type="number"
              step="0.01"
              min={FIELD_RULES.pressure.min}
              name="pressure"
              value={formData.pressure}
              onChange={handleChange}
              placeholder="e.g. 120.0 (Threshold: > 225)"
            />
          </label>

          <label>
            <span className="template-label">Vibration</span>
            <input
              className="template-input"
              type="number"
              step="0.01"
              min={FIELD_RULES.vibration.min}
              name="vibration"
              value={formData.vibration}
              onChange={handleChange}
              placeholder="e.g. 0.5 (Threshold: > 0.50 mm/s2)"
            />
          </label>

          <label>
            <span className="template-label">Flow Rate</span>
            <input
              className="template-input"
              type="number"
              step="0.01"
              min={FIELD_RULES.flow_rate.min}
              name="flow_rate"
              value={formData.flow_rate}
              onChange={handleChange}
              placeholder="e.g. 120.0 (Threshold: < 116 L/min)"
            />
          </label>

          <label>
            <span className="template-label">Humidity</span>
            <input
              className="template-input"
              type="number"
              step="0.01"
              min={FIELD_RULES.humidity.min}
              name="humidity"
              value={formData.humidity}
              onChange={handleChange}
              placeholder="e.g. 45.0 (Threshold: > 48 %)"
            />
          </label>
        </div>

        <div className="template-button-row">
          <button type="submit" className="btn-template-primary" disabled={loading}>
            {loading ? (
              <span className="btn-loading-wrap">
                <i className="fas fa-spinner fa-spin" /> Analysing... {elapsedSeconds.toFixed(1)}s
              </span>
            ) : (
              'Run Prediction'
            )}
          </button>
          <button
            type="button"
            className="btn-template-secondary"
            disabled={loading}
            onClick={() => {
              setFormData(initialForm)
              setResult(null)
              setError('')
            }}
          >
            Reset Inputs
          </button>
        </div>

        {error ? <p className="status-text status-error">{error}</p> : null}
      </form>

      {result ? (
        <section
          className={`prediction-result-card ${outcome === 'failure' ? 'result-failure' : 'result-healthy'} fadeInUp is-visible`}
          style={{ animationDuration: '0.4s' }}
        >
          <div className="prediction-result-top">
            <div>
              <p className="result-kicker">PREDICTION RESULT</p>
              <div className={`result-badge ${outcome === 'failure' ? 'failure' : 'healthy'}`}>
                {outcome === 'failure' ? (
                  <>
                    <i className="fas fa-exclamation-triangle" /> FAILURE
                  </>
                ) : (
                  <>
                    <i className="fas fa-check" /> HEALTHY
                  </>
                )}
              </div>
            </div>
            <div className="confidence-block">
              <p>Confidence</p>
              <strong>{result.confidencePercent.toFixed(1)}%</strong>
              <div className="confidence-progress-track">
                <span
                  className="confidence-progress-fill"
                  style={{
                    width: `${Math.max(0, Math.min(100, result.confidencePercent))}%`,
                    backgroundColor: outcome === 'failure' ? '#e53e3e' : '#38a169',
                  }}
                />
              </div>
            </div>
          </div>

          <hr />

          <div>
            <p className="result-kicker">
              <i className="fas fa-brain" /> AI ANALYSIS
            </p>
            <div className="ai-analysis-box">{result.explanation}</div>
            {result.warning ? <p className="status-text status-error">{result.warning}</p> : null}
            <p className="result-generated-at">Generated at {result.generatedAt}</p>
          </div>
        </section>
      ) : (
        <section className="predict-empty-state">
          <i className="fas fa-microchip" />
          <p>Fill in the sensor readings above and click Run Prediction to see the AI assessment.</p>
        </section>
      )}

      <section className="prediction-history-card outcome-full-card">
        <h3>Outcome Mix</h3>
        {totalRuns < 1 ? (
          <p className="history-placeholder">Run predictions to see healthy vs failure distribution.</p>
        ) : (
          <div className="outcome-mix-wrap">
            <div className="outcome-mix-chart">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={outcomeMixData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={84}
                    outerRadius={148}
                    paddingAngle={4}
                    stroke="#ffffff"
                    strokeWidth={2}
                  >
                    {outcomeMixData.map((segment) => (
                      <Cell key={segment.name} fill={segment.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name) => [`${value} runs`, name]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="outcome-mix-center">
                <strong>{totalRuns}</strong>
                <span>Total Runs</span>
              </div>
            </div>
            <div className="outcome-mix-legend">
              {outcomeMixData.map((segment) => (
                <div key={segment.name} className="outcome-mix-item">
                  <span className="outcome-mix-dot" style={{ backgroundColor: segment.color }} />
                  <span>{segment.name}</span>
                  <strong>{segment.value}</strong>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="prediction-history-card">
        <h3>Last 10 Predictions</h3>
        {history.length === 0 ? (
          <p className="history-placeholder">No predictions yet. Run prediction to populate this table.</p>
        ) : (
          <div className="table-card-wrap">
            <table className="template-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Machine</th>
                  <th>Result</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {[...history].reverse().map((item) => (
                  <tr key={item.id || `${item.date}-${item.timestamp}-${item.machine_id}`}>
                    <td>{item.date || '-'}</td>
                    <td>{item.timestamp || '-'}</td>
                    <td>{item.machine_id || '-'}</td>
                    <td>
                      <span className={`status-pill ${item.result === 'FAILURE' ? 'badge-failure' : 'badge-healthy'}`}>
                        {String(item.result || 'HEALTHY').toUpperCase()}
                      </span>
                    </td>
                    <td>{Number(item.confidence || 0).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  )
}
