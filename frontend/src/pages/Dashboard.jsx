import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import api from '../api/axios'

const DEFAULT_MACHINES = ['PUMP_1', 'PUMP_2', 'COMP_1', 'COMP_2', 'VALVE_1', 'VALVE_2']

const SENSOR_CONFIG = [
  {
    key: 'temperature',
    label: 'Temperature',
    unit: '°C',
    icon: 'fas fa-thermometer-half',
    healthyColor: '#e53e3e',
    lineColor: '#e53e3e',
    warning: (value) => value > 91,
    warningLabel: '> 91°C',
    chartDomain: [0, 140],
    validRange: [0, 200],
  },
  {
    key: 'pressure',
    label: 'Pressure',
    unit: 'hPa',
    icon: 'fas fa-tachometer-alt',
    healthyColor: '#3182ce',
    lineColor: '#2d3748',
    warning: (value) => value > 225,
    warningLabel: '> 225',
    chartDomain: [0, 260],
    validRange: [0, 300],
  },
  {
    key: 'vibration',
    label: 'Vibration',
    unit: 'mm/s²',
    icon: 'fas fa-wave-square',
    healthyColor: '#805ad5',
    lineColor: '#805ad5',
    warning: (value) => value > 0.5,
    warningLabel: '> 0.50 mm/s²',
    chartDomain: [0, 12],
    validRange: [0, 20],
  },
  {
    key: 'flow_rate',
    label: 'Flow Rate',
    unit: 'L/min',
    icon: 'fas fa-tint',
    healthyColor: '#38a169',
    lineColor: '#38a169',
    warning: (value) => value < 116,
    warningLabel: '< 116 L/min',
    chartDomain: [0, 220],
    validRange: [0, 300],
  },
  {
    key: 'humidity',
    label: 'Humidity',
    unit: '%',
    icon: 'fas fa-cloud',
    healthyColor: '#d69e2e',
    lineColor: '#d69e2e',
    warning: (value) => value > 48,
    warningLabel: '> 48%',
    chartDomain: [0, 100],
    validRange: [0, 100],
  },
]

const SENSOR_RULES = SENSOR_CONFIG.reduce((acc, sensor) => {
  acc[sensor.key] = { validRange: sensor.validRange }
  return acc
}, {})

function formatAxisTime(timestampMs, index) {
  if (!timestampMs) return `#${index}`
  const date = new Date(timestampMs)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

function formatFullTime(timestampMs, index) {
  if (!timestampMs) return `Reading #${index}`
  return new Date(timestampMs).toLocaleString()
}

function normalizeChartData(payload) {
  if (!Array.isArray(payload)) return []

  const parsed = payload.map((entry, index) => {
    const timestampMs = entry.timestamp ? new Date(entry.timestamp).getTime() : null
    const normalized = {
      timestampMs,
      originalIndex: index + 1,
    }

    Object.keys(SENSOR_RULES).forEach((key) => {
      const rawValue = Number(entry[key])
      const [min, max] = SENSOR_RULES[key].validRange
      normalized[`${key}_raw`] = Number.isFinite(rawValue) ? rawValue : 0
      normalized[key] = Number.isFinite(rawValue) && rawValue >= min && rawValue <= max ? rawValue : null
    })

    return {
      ...normalized,
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
    const duration = 800

    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1)
      setCounted(nextValue * progress)
      if (progress < 1) requestAnimationFrame(tick)
    }

    requestAnimationFrame(tick)
    return undefined
  }, [value])

  return <>{counted.toFixed(2)}</>
}

export default function Dashboard() {
  const [machines, setMachines] = useState(DEFAULT_MACHINES)
  const [machineId, setMachineId] = useState(DEFAULT_MACHINES[0])
  const [chartData, setChartData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [newMachineId, setNewMachineId] = useState('')
  const [addingMachine, setAddingMachine] = useState(false)
  const [removingMachine, setRemovingMachine] = useState(false)
  const fetchSequenceRef = useRef(0)

  const refreshMachineList = async () => {
    try {
      const response = await api.get('/readings/')
      const machineSet = new Set(DEFAULT_MACHINES)
      ;(Array.isArray(response.data) ? response.data : []).forEach((item) => {
        if (item.machine_id) machineSet.add(item.machine_id)
      })
      const nextMachines = [...machineSet]
      setMachines(nextMachines)
      if (!nextMachines.includes(machineId)) {
        setMachineId(nextMachines[0])
      }
    } catch {
      setMachines((prev) => (prev.length ? prev : DEFAULT_MACHINES))
    }
  }

  useEffect(() => {
    refreshMachineList()
  }, [])

  useEffect(() => {
    if (!machineId) return undefined

    const fetchReadings = async () => {
      const sequence = (fetchSequenceRef.current += 1)
      setLoading(true)
      setError('')
      setChartData([])
      try {
        const response = await api.get('/readings/', { params: { machine_id: machineId } })
        if (sequence !== fetchSequenceRef.current) return
        setChartData(normalizeChartData(response.data))
      } catch (fetchError) {
        if (sequence !== fetchSequenceRef.current) return
        setChartData([])
        setError(fetchError.message || 'Unable to fetch machine readings.')
      } finally {
        if (sequence !== fetchSequenceRef.current) return
        setLoading(false)
      }
    }

    fetchReadings()
    return undefined
  }, [machineId])

  const latestReading = useMemo(() => chartData[chartData.length - 1], [chartData])

  const handleAddMachine = async (event) => {
    event.preventDefault()
    if (!newMachineId.trim()) return

    setAddingMachine(true)
    setError('')
    try {
      await api.post('/machines/', { machine_id: newMachineId.trim() })
      await refreshMachineList()
      setMachineId(newMachineId.trim())
      setNewMachineId('')
      setShowAddModal(false)
    } catch {
      const value = newMachineId.trim()
      setMachines((prev) => (prev.includes(value) ? prev : [value, ...prev]))
      setMachineId(value)
      setNewMachineId('')
      setShowAddModal(false)
    } finally {
      setAddingMachine(false)
    }
  }

  const handleRemoveMachine = async () => {
    if (!machineId) return
    const confirmed = window.confirm(`Are you sure you want to remove ${machineId}?`)
    if (!confirmed) return

    setRemovingMachine(true)
    setError('')
    try {
      await api.delete(`/machines/${machineId}/`)
    } catch {
      // Fall back to local list removal when the endpoint is unavailable.
    } finally {
      setMachines((prev) => {
        const filtered = prev.filter((machine) => machine !== machineId)
        const safe = filtered.length ? filtered : DEFAULT_MACHINES
        setMachineId(safe[0])
        return safe
      })
      setRemovingMachine(false)
    }
  }

  return (
    <section className="app-page dashboard-page">
      <div className="template-header-card">
        <div>
          <div className="template-sublabel">LIVE SENSOR TELEMETRY</div>
          <h2 className="template-page-title">Machine Dashboard</h2>
        </div>
        <div className="dashboard-controls-row">
          <select
            className="template-input template-select"
            value={machineId}
            onChange={(event) => setMachineId(event.target.value)}
          >
            {machines.map((machine) => (
              <option key={machine} value={machine}>
                {machine}
              </option>
            ))}
          </select>
          <button type="button" className="btn-template-primary" onClick={() => setShowAddModal(true)}>
            + Add Machine
          </button>
          <button
            type="button"
            className="btn-outline-danger"
            onClick={handleRemoveMachine}
            disabled={removingMachine}
          >
            {removingMachine ? 'Removing...' : 'Remove Machine'}
          </button>
        </div>
      </div>

      {showAddModal ? (
        <form className="inline-modal-card" onSubmit={handleAddMachine}>
          <h3>Add Machine</h3>
          <input
            className="template-input"
            type="text"
            placeholder="Enter Machine ID"
            value={newMachineId}
            onChange={(event) => setNewMachineId(event.target.value)}
          />
          <div className="inline-modal-actions">
            <button type="submit" className="btn-template-primary" disabled={addingMachine}>
              {addingMachine ? 'Adding...' : 'Submit'}
            </button>
            <button type="button" className="btn-template-secondary" onClick={() => setShowAddModal(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {loading ? <p className="status-text status-loading">Loading sensor data...</p> : null}
      {error ? <p className="status-text status-error">{error}</p> : null}

      <div className="sensor-metrics-row">
        {SENSOR_CONFIG.map((sensor) => {
          const value = Number(latestReading?.[`${sensor.key}_raw`] ?? latestReading?.[sensor.key] ?? 0)
          const isWarning = sensor.warning(value)
          const activeColor = isWarning ? '#e53e3e' : sensor.healthyColor

          return (
            <article key={sensor.key} className="sensor-metric-card">
              <div className="sensor-metric-inner">
                <div className="metric-icon-circle" style={{ backgroundColor: activeColor }}>
                  <i className={sensor.icon} />
                </div>
                <div>
                  <div className="metric-value" style={{ color: isWarning ? '#e53e3e' : '#1a2236' }}>
                    <CounterValue value={value} /> {sensor.unit}
                  </div>
                  <div className="metric-label">{sensor.label}</div>
                  <div className="metric-threshold">Warning: {sensor.warningLabel}</div>
                </div>
              </div>
            </article>
          )
        })}
      </div>

      <section className="charts-section">
        <h3 className="template-accent-title">Historical Trend Charts</h3>
        <p className="template-subcopy">Sensor readings over time for selected machine</p>

        <div className="trend-chart-grid">
          {SENSOR_CONFIG.map((sensor, index) => (
            <article className="trend-chart-card" key={sensor.key}>
              <h4>
                <span className="sensor-dot" style={{ backgroundColor: sensor.healthyColor }} />
                {sensor.label}
              </h4>
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#718096' }} minTickGap={18} />
                    <YAxis domain={sensor.chartDomain} tick={{ fontSize: 11, fill: '#718096' }} />
                    <Tooltip
                      labelFormatter={(value, payload) => payload?.[0]?.payload?.fullTime || value}
                      formatter={(value) => [value == null ? 'N/A' : value, sensor.label]}
                    />
                    <Line
                      type="monotone"
                      dataKey={sensor.key}
                      stroke={sensor.lineColor}
                      strokeWidth={2.5}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  )
}


