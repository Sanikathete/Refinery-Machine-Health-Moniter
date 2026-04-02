import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import api from '../api/axios'

const MACHINE_OPTIONS = ['PUMP_1', 'PUMP_2', 'COMP_1', 'COMP_2', 'VALVE_1', 'VALVE_2']
const SENSOR_KEYS = ['temperature', 'pressure', 'vibration', 'flow_rate', 'humidity']
const SENSOR_STYLES = {
  temperature: { color: '#f3525a' },
  pressure: { color: '#152440' },
  vibration: { color: '#3f6db4' },
  flow_rate: { color: '#4b9f8f' },
  humidity: { color: '#e7a43b' },
}

function formatAxisTime(timestampMs, index) {
  if (!timestampMs) return `#${index}`
  const date = new Date(timestampMs)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  return isToday
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatFullTime(timestampMs, index) {
  if (!timestampMs) return `Reading #${index}`
  return new Date(timestampMs).toLocaleString()
}

function formatMetricLabel(metric) {
  return metric.replace('_', ' ')
}

function normalizeChartData(payload) {
  if (!Array.isArray(payload)) return []

  const parsed = payload.map((entry, index) => {
    const timestampMs = entry.timestamp ? new Date(entry.timestamp).getTime() : null
    return {
      timestampMs,
      temperature: Number(entry.temperature ?? 0),
      pressure: Number(entry.pressure ?? 0),
      vibration: Number(entry.vibration ?? 0),
      flow_rate: Number(entry.flow_rate ?? 0),
      humidity: Number(entry.humidity ?? 0),
      originalIndex: index + 1,
    }
  })

  parsed.sort((a, b) => {
    if (a.timestampMs == null && b.timestampMs == null) return a.originalIndex - b.originalIndex
    if (a.timestampMs == null) return 1
    if (b.timestampMs == null) return -1
    return a.timestampMs - b.timestampMs
  })

  return parsed.map((entry, index) => ({
    ...entry,
    index: index + 1,
    time: formatAxisTime(entry.timestampMs, index + 1),
    fullTime: formatFullTime(entry.timestampMs, index + 1),
  }))
}

function CounterValue({ value }) {
  const [counted, setCounted] = useState(0)

  useEffect(() => {
    const nextValue = Number.isFinite(value) ? value : 0
    const start = performance.now()
    const duration = 700

    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1)
      setCounted(nextValue * progress)
      if (progress < 1) {
        requestAnimationFrame(tick)
      }
    }

    requestAnimationFrame(tick)
  }, [value])

  return <>{counted.toFixed(2)}</>
}

export default function Dashboard() {
  const [machineId, setMachineId] = useState(MACHINE_OPTIONS[0])
  const [chartData, setChartData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchReadings = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await api.get('/readings/', {
          params: { machine_id: machineId },
        })
        setChartData(normalizeChartData(response.data))
      } catch (fetchError) {
        setError(fetchError.message || 'Unable to fetch machine readings.')
      } finally {
        setLoading(false)
      }
    }

    fetchReadings()
  }, [machineId])

  const latestReading = useMemo(() => chartData[chartData.length - 1], [chartData])

  return (
    <motion.section
      className="page"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <h2 className="section-title">Machine Dashboard</h2>
      <p className="section-subtitle">
        Analyze live machine telemetry and historical sensor trends by equipment unit.
      </p>

      <section className="dashboard-controls card">
        <label htmlFor="machine-select">Select Machine</label>
        <select
          id="machine-select"
          className="select"
          value={machineId}
          onChange={(event) => setMachineId(event.target.value)}
          style={{ marginTop: '0.5rem', maxWidth: '260px' }}
        >
          {MACHINE_OPTIONS.map((machine) => (
            <option key={machine} value={machine}>
              {machine}
            </option>
          ))}
        </select>
        {loading ? <p className="status-text status-loading">Loading sensor data...</p> : null}
        {error ? <p className="status-text status-error">{error}</p> : null}
      </section>

      <section className="chart-card card">
        <h3>Historical Trend Charts</h3>
        <div className="mini-charts-grid">
          {SENSOR_KEYS.map((metric) => (
            <article className="mini-chart-card" key={metric}>
              <h4>{formatMetricLabel(metric)}</h4>
              <div style={{ width: '100%', height: 170 }}>
                <ResponsiveContainer>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#d7dfeb" />
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} minTickGap={18} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip labelFormatter={(value, payload) => payload?.[0]?.payload?.fullTime || value} />
                    <Line
                      type="monotone"
                      dataKey={metric}
                      stroke={SENSOR_STYLES[metric].color}
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="metrics-grid">
        {SENSOR_KEYS.map((metric, index) => (
          <motion.article
            className="metric-card card"
            key={metric}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08 }}
          >
            <h4>{formatMetricLabel(metric)}</h4>
            <p>
              <CounterValue value={latestReading?.[metric] ?? 0} />
            </p>
          </motion.article>
        ))}
      </div>
    </motion.section>
  )
}
