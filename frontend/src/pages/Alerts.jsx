import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import api from '../api/axios'

function normalizeSeverity(predictionLabel) {
  const normalized = String(predictionLabel || '').toUpperCase()
  return normalized === 'FAILURE' ? 'CRITICAL' : 'WARNING'
}

export default function Alerts() {
  const [alerts, setAlerts] = useState([])
  const [schedules, setSchedules] = useState([])
  const [scheduleDrafts, setScheduleDrafts] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resolvingId, setResolvingId] = useState(null)
  const [schedulingId, setSchedulingId] = useState(null)
  const [completingScheduleId, setCompletingScheduleId] = useState(null)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError('')

      try {
        const [alertsResponse, schedulesResponse] = await Promise.all([
          api.get('/alerts/'),
          api.get('/schedules/', { params: { status: 'PENDING' } }),
        ])
        const alertsData = Array.isArray(alertsResponse.data) ? alertsResponse.data : []
        const schedulesData = Array.isArray(schedulesResponse.data) ? schedulesResponse.data : []
        setAlerts(alertsData)
        setSchedules(schedulesData)

        const defaultDrafts = {}
        alertsData.forEach((alert) => {
          const scheduledTime = new Date(Date.now() + 60 * 60 * 1000)
          defaultDrafts[alert.id] = {
            scheduled_for: scheduledTime.toISOString().slice(0, 16),
            notes: '',
            assigned_to: '',
          }
        })
        setScheduleDrafts(defaultDrafts)
      } catch (fetchError) {
        setError(fetchError.message || 'Unable to load alerts and schedules.')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const resolveAlert = async (id) => {
    setResolvingId(id)
    try {
      await api.post(`/alerts/${id}/resolve/`)
      setAlerts((prev) => prev.filter((alert) => alert.id !== id))
    } catch (resolveError) {
      setError(resolveError.message || 'Unable to resolve alert.')
    } finally {
      setResolvingId(null)
    }
  }

  const updateScheduleDraft = (alertId, field, value) => {
    setScheduleDrafts((prev) => ({
      ...prev,
      [alertId]: {
        ...(prev[alertId] || {}),
        [field]: value,
      },
    }))
  }

  const createSchedule = async (alert) => {
    const draft = scheduleDrafts[alert.id]
    if (!draft?.scheduled_for) {
      setError('Please select a scheduled date and time before creating a maintenance task.')
      return
    }

    setSchedulingId(alert.id)
    setError('')
    try {
      const response = await api.post('/schedules/', {
        machine_id: alert.machine_id,
        alert_id: alert.id,
        scheduled_for: new Date(draft.scheduled_for).toISOString(),
        notes: draft.notes || '',
        assigned_to: draft.assigned_to || '',
      })
      setSchedules((prev) => [response.data, ...prev])
      setAlerts((prev) => prev.filter((item) => item.id !== alert.id))
    } catch (scheduleError) {
      setError(scheduleError.message || 'Unable to create maintenance schedule.')
    } finally {
      setSchedulingId(null)
    }
  }

  const completeSchedule = async (scheduleId) => {
    setCompletingScheduleId(scheduleId)
    setError('')
    try {
      await api.patch(`/schedules/${scheduleId}/complete/`)
      setSchedules((prev) => prev.filter((item) => item.id !== scheduleId))
    } catch (completeError) {
      setError(completeError.message || 'Unable to complete schedule.')
    } finally {
      setCompletingScheduleId(null)
    }
  }

  return (
    <motion.section
      className="page"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <h2 className="section-title">Alerts Center</h2>
      <p className="section-subtitle">Review and resolve active machine risk notifications.</p>

      {loading ? <p className="status-text status-loading">Loading alerts...</p> : null}
      {error ? <p className="status-text status-error">{error}</p> : null}

      <motion.div
        className="alerts-grid"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.1 } },
        }}
        initial="hidden"
        animate="show"
      >
        {alerts.map((alert) => {
          const severity = normalizeSeverity(alert.prediction_label)
          return (
            <motion.article
              key={alert.id}
              className="alert-card card"
              variants={{
                hidden: { opacity: 0, x: -20 },
                show: { opacity: 1, x: 0, transition: { duration: 0.35 } },
              }}
            >
              <div className="alert-head">
                <h3>{alert.machine_id || 'Unknown Machine'}</h3>
                <span className={`badge ${severity === 'CRITICAL' ? 'badge-critical' : 'badge-warning'}`}>
                  {severity}
                </span>
              </div>

              <p className="card-meta">
                {alert.created_at ? new Date(alert.created_at).toLocaleString() : 'Timestamp unavailable'}
              </p>
              <p style={{ marginTop: '0.6rem' }}>
                Prediction: {String(alert.prediction_label || 'UNKNOWN').toUpperCase()} with{' '}
                {(Number(alert.confidence_score || 0) * 100).toFixed(1)}% confidence.
              </p>

              <div style={{ marginTop: '0.8rem' }}>
                <button
                  className="btn btn-primary"
                  onClick={() => resolveAlert(alert.id)}
                  disabled={resolvingId === alert.id || schedulingId === alert.id}
                >
                  {resolvingId === alert.id ? 'Resolving...' : 'Resolve'}
                </button>
              </div>

              <div className="schedule-form">
                <h4>Schedule Maintenance</h4>
                <label>
                  Scheduled For
                  <input
                    type="datetime-local"
                    className="input"
                    value={scheduleDrafts[alert.id]?.scheduled_for || ''}
                    onChange={(event) => updateScheduleDraft(alert.id, 'scheduled_for', event.target.value)}
                  />
                </label>
                <label>
                  Assigned To
                  <input
                    type="text"
                    className="input"
                    placeholder="Technician name"
                    value={scheduleDrafts[alert.id]?.assigned_to || ''}
                    onChange={(event) => updateScheduleDraft(alert.id, 'assigned_to', event.target.value)}
                  />
                </label>
                <label>
                  Notes
                  <textarea
                    className="textarea"
                    rows={2}
                    placeholder="Maintenance notes"
                    value={scheduleDrafts[alert.id]?.notes || ''}
                    onChange={(event) => updateScheduleDraft(alert.id, 'notes', event.target.value)}
                  />
                </label>
                <button
                  className="btn btn-secondary"
                  onClick={() => createSchedule(alert)}
                  disabled={schedulingId === alert.id || resolvingId === alert.id}
                >
                  {schedulingId === alert.id ? 'Scheduling...' : 'Create Schedule'}
                </button>
              </div>
            </motion.article>
          )
        })}
      </motion.div>

      {!loading && alerts.length === 0 ? (
        <p className="status-text">No active alerts right now. Great job keeping machines stable.</p>
      ) : null}

      <section className="schedule-section">
        <div className="schedule-header">
          <h3>Maintenance Scheduling</h3>
        </div>
        <div className="schedule-grid">
          {schedules.map((schedule) => (
            <article className="schedule-card card" key={schedule.id}>
              <div className="alert-head">
                <h4>{schedule.machine_id}</h4>
                <span className={`badge ${schedule.priority === 'CRITICAL' ? 'badge-critical' : 'badge-warning'}`}>
                  {schedule.priority}
                </span>
              </div>
              <p className="card-meta">
                Scheduled: {schedule.scheduled_for ? new Date(schedule.scheduled_for).toLocaleString() : 'N/A'}
              </p>
              <p className="card-meta">Assigned To: {schedule.assigned_to || 'Unassigned'}</p>
              <p style={{ marginTop: '0.6rem' }}>{schedule.notes || 'No schedule notes.'}</p>
              <div style={{ marginTop: '0.8rem' }}>
                <button
                  className="btn btn-primary"
                  disabled={completingScheduleId === schedule.id}
                  onClick={() => completeSchedule(schedule.id)}
                >
                  {completingScheduleId === schedule.id ? 'Completing...' : 'Mark Completed'}
                </button>
              </div>
            </article>
          ))}
        </div>
        {schedules.length === 0 ? (
          <p className="status-text">No pending maintenance schedules. Create one from an alert card.</p>
        ) : null}
      </section>
    </motion.section>
  )
}
