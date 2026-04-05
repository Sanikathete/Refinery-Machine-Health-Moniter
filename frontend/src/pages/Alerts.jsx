import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../api/axios'

function normalizeSeverity(predictionLabel) {
  const normalized = String(predictionLabel || '').toUpperCase()
  return normalized === 'FAILURE' ? 'CRITICAL' : 'WARNING'
}

function getMaintenanceStatusBadge(status) {
  const normalized = String(status || 'PENDING').toUpperCase()
  if (normalized === 'COMPLETED') return 'badge-completed'
  if (normalized === 'CANCELLED') return 'badge-cancelled'
  if (normalized === 'IGNORED') return 'badge-ignored'
  if (normalized === 'SCHEDULED') return 'badge-scheduled'
  return 'badge-pending'
}

export default function Alerts() {
  const [alerts, setAlerts] = useState([])
  const [exitingAlertIds, setExitingAlertIds] = useState([])
  const [schedules, setSchedules] = useState([])
  const [history, setHistory] = useState([])
  const [ignoredAlerts, setIgnoredAlerts] = useState([])
  const [machineSnapshots, setMachineSnapshots] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [ignoringId, setIgnoringId] = useState(null)
  const [completingScheduleId, setCompletingScheduleId] = useState(null)
  const [cancellingScheduleId, setCancellingScheduleId] = useState(null)
  const [schedulingAlertId, setSchedulingAlertId] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [scheduleFilter, setScheduleFilter] = useState('ALL')

  const fetchAlertsData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true)
    setLoading(!isManual)
    setError('')
    if (!isManual) setSuccess('')

    try {
      const [alertsResponse, schedulesResponse, ignoredResponse] = await Promise.all([
        api.get('/alerts/'),
        api.get('/schedules/', { params: { status: 'PENDING' } }),
        api.get('/alerts/ignored/'),
      ])
      const nextAlerts = Array.isArray(alertsResponse.data) ? alertsResponse.data : []
      const nextSchedules = Array.isArray(schedulesResponse.data) ? schedulesResponse.data : []
      const nextIgnoredAlerts = Array.isArray(ignoredResponse.data) ? ignoredResponse.data : []
      setAlerts(nextAlerts)
      setSchedules(nextSchedules)
      setIgnoredAlerts(nextIgnoredAlerts)

      const uniqueMachines = [...new Set(nextAlerts.map((alert) => alert.machine_id).filter(Boolean))]
      const readingRequests = uniqueMachines.map((machineId) =>
        api
          .get('/readings/', { params: { machine_id: machineId } })
          .then((response) => ({ machineId, reading: Array.isArray(response.data) ? response.data[0] : null }))
          .catch(() => ({ machineId, reading: null })),
      )
      const readingResults = await Promise.all(readingRequests)
      const snapshotMap = {}
      readingResults.forEach(({ machineId, reading }) => {
        if (reading) snapshotMap[machineId] = reading
      })
      setMachineSnapshots(snapshotMap)

      try {
        const historyResponse = await api.get('/alerts/history/')
        const historyData = Array.isArray(historyResponse.data) ? historyResponse.data : []
        setHistory(historyData)
      } catch {
        // Keep local history fallback only.
      }
    } catch (fetchError) {
      setError(fetchError.message || 'Unable to load alerts and schedules.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchAlertsData()
    const interval = setInterval(() => fetchAlertsData(true), 30000)
    return () => clearInterval(interval)
  }, [fetchAlertsData])

  const scheduleMaintenance = async (alert) => {
    if (!alert?.id) return

    const existingSchedule = schedules.find((item) => Number(item.alert) === Number(alert.id))
    if (existingSchedule) {
      setError('A maintenance schedule already exists for this alert.')
      return
    }

    setSchedulingAlertId(alert.id)
    setError('')
    setSuccess('')

    try {
      const assignedToInput = window.prompt('Assign this maintenance to (name/team):', '')
      if (assignedToInput === null) {
        setSchedulingAlertId(null)
        return
      }
      const assignedTo = assignedToInput.trim()
      if (!assignedTo) {
        setError('Please enter a valid assignee name to schedule maintenance.')
        setSchedulingAlertId(null)
        return
      }

      const scheduledFor = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      const scheduleResponse = await api.post('/schedules/', {
        machine_id: alert.machine_id,
        alert_id: alert.id,
        scheduled_for: scheduledFor,
        assigned_to: assignedTo,
        notes: 'Manually scheduled from active alerts.',
      })

      const createdSchedule = scheduleResponse.data
      setSchedules((prev) => [createdSchedule, ...prev])

      // Move alert from Active Alerts into Maintenance Scheduling by resolving it
      // once maintenance has been scheduled.
      try {
        await api.post(`/alerts/${alert.id}/resolve/`)
      } catch {
        // If resolve fails, keep UI movement for better UX and refresh will reconcile.
      }

      setExitingAlertIds((prev) => [...prev, alert.id])
      setTimeout(() => {
        setAlerts((prev) => prev.filter((item) => item.id !== alert.id))
        setExitingAlertIds((prev) => prev.filter((id) => id !== alert.id))
      }, 280)
      setSuccess('Maintenance scheduled and moved to Maintenance Scheduling.')
    } catch (scheduleError) {
      setError(scheduleError.message || 'Unable to schedule maintenance for this alert.')
    } finally {
      setSchedulingAlertId(null)
    }
  }

  const ignoreAlert = async (alert) => {
    if (!alert?.id) return
    setIgnoringId(alert.id)
    setError('')

    try {
      await api.post(`/alerts/${alert.id}/ignore/`)

      setExitingAlertIds((prev) => [...prev, alert.id])
      setTimeout(() => {
        setAlerts((prev) => prev.filter((item) => item.id !== alert.id))
        setExitingAlertIds((prev) => prev.filter((id) => id !== alert.id))
      }, 280)

      setIgnoredAlerts((prev) => [
        {
          id: `local-ignore-${alert.id}-${Date.now()}`,
          date_time: new Date().toISOString(),
          machine_id: alert.machine_id,
          alert_type: String(alert.prediction_label || 'UNKNOWN').toUpperCase(),
          severity: normalizeSeverity(alert.prediction_label),
          confidence_score: alert?.confidence_score ?? null,
        },
        ...prev,
      ])
    } catch (ignoreError) {
      setError(ignoreError.message || 'Unable to ignore alert.')
    } finally {
      setIgnoringId(null)
    }
  }

  const completeSchedule = async (schedule) => {
    if (!schedule?.id) return
    setCompletingScheduleId(schedule.id)
    setError('')

    try {
      await api.patch(`/schedules/${schedule.id}/complete/`)
      setSchedules((prev) => prev.filter((item) => item.id !== schedule.id))
      setHistory((prev) =>
        prev.map((row) =>
          row?.schedule_id === schedule.id
            ? {
                ...row,
                maintenance_status: 'Completed',
                status: 'COMPLETED',
              }
            : row,
        ),
      )
      await fetchAlertsData(true)
    } catch (completeError) {
      setError(completeError.message || 'Unable to complete maintenance schedule.')
    } finally {
      setCompletingScheduleId(null)
    }
  }

  const cancelSchedule = async (schedule) => {
    if (!schedule?.id) return
    const isCompleted = String(schedule.status || '').toUpperCase() === 'COMPLETED'
    if (isCompleted) return

    const confirmed = window.confirm(
      `Cancel maintenance for ${schedule.machine_id || 'this machine'} scheduled on ${
        schedule.scheduled_for ? new Date(schedule.scheduled_for).toLocaleString() : 'N/A'
      }?`,
    )
    if (!confirmed) return

    setCancellingScheduleId(schedule.id)
    setError('')
    try {
      await api.delete(`/schedules/${schedule.id}/cancel/`)
      setSchedules((prev) => prev.filter((item) => item.id !== schedule.id))
      setHistory((prev) =>
        prev.map((row) =>
          row?.schedule_id === schedule.id
            ? {
                ...row,
                maintenance_status: 'Cancelled',
                status: 'CANCELLED',
              }
            : row,
        ),
      )
    } catch (cancelError) {
      setError(cancelError.message || 'Unable to cancel maintenance schedule.')
    } finally {
      setCancellingScheduleId(null)
    }
  }

  const historyRows = useMemo(() => {
    return history
      .map((row) => ({
        ...row,
        severity: row.severity || normalizeSeverity(row.prediction_label || row.alert_type),
        machine_id: row.machine_id || row.machine,
        alert_type: row.alert_type || String(row.prediction_label || 'UNKNOWN').toUpperCase(),
        maintenance_date: row.maintenance_date || row.scheduled_for || null,
        maintenance_status: row.maintenance_status || row.status || 'Pending',
        created_at: row.created_at || row.date || new Date().toISOString(),
      }))
      .filter((row) => String(row.maintenance_status || '').toUpperCase() === 'COMPLETED')
  }, [history])

  const filteredSchedules = useMemo(() => {
    const normalizedFilter = String(scheduleFilter || 'ALL').toUpperCase()
    if (normalizedFilter === 'ALL') return schedules
    return schedules.filter((schedule) => String(schedule.status || 'PENDING').toUpperCase() === 'PENDING')
  }, [schedules, scheduleFilter])

  const scheduleCounts = useMemo(() => {
    const total = schedules.length
    const pending = schedules.filter(
      (schedule) => String(schedule.status || 'PENDING').toUpperCase() === 'PENDING',
    ).length
    return { total, pending }
  }, [schedules])

  return (
    <section className="app-page">
      <div className="template-header-card">
        <div>
          <div className="template-sublabel">MACHINE FAILURE AND WARNING NOTIFICATIONS</div>
          <h2 className="template-page-title">Active Alerts</h2>
        </div>
        <button type="button" className="btn-outline-navy" onClick={() => fetchAlertsData(true)}>
          {refreshing ? 'Refreshing...' : '? Refresh'}
        </button>
      </div>

      {loading ? <p className="status-text status-loading">Loading alerts...</p> : null}
      {error ? <p className="status-text status-error">{error}</p> : null}
      {success ? <p className="status-text status-success">{success}</p> : null}

      {!loading && alerts.length === 0 ? (
        <article className="alerts-empty-card">
          <i className="fas fa-shield-alt" />
          <h3>All Clear!</h3>
          <p>No active alerts right now. All machines are operating within normal parameters.</p>
          <small>Alerts will appear here automatically when a FAILURE prediction is triggered.</small>
        </article>
      ) : null}

      <div className="alerts-cards-grid">
        {alerts.map((alert) => {
          const severity = normalizeSeverity(alert.prediction_label)
          const reading = machineSnapshots[alert.machine_id] || {}
          const pills = [
            `Temperature: ${Number(reading.temperature ?? 0).toFixed(1)}°C`,
            `Pressure: ${Number(reading.pressure ?? 0).toFixed(1)} hPa`,
            `Vibration: ${Number(reading.vibration ?? 0).toFixed(2)} mm/s²`,
            `Flow: ${Number(reading.flow_rate ?? 0).toFixed(1)} L/min`,
            `Humidity: ${Number(reading.humidity ?? 0).toFixed(1)}%`,
          ]

          return (
            <article
              key={alert.id}
              className={`alert-card-template wow fadeInDown is-visible ${
                severity === 'CRITICAL' ? 'critical' : 'warning'
              } ${exitingAlertIds.includes(alert.id) ? 'fade-out' : ''}`}
            >
              <div className="alert-card-top">
                <h3>{alert.machine_id || 'Unknown Machine'}</h3>
                <span className={`alert-severity-badge ${severity === 'CRITICAL' ? 'critical' : 'warning'}`}>
                  {severity}
                </span>
              </div>
              <p className="alert-time-row">
                {alert.created_at ? new Date(alert.created_at).toLocaleString() : 'Timestamp unavailable'}
              </p>
              <div className="sensor-pill-row">
                {pills.map((pill) => (
                  <span key={`${alert.id}-${pill}`} className="sensor-pill">
                    {pill}
                  </span>
                ))}
              </div>

              <div className="alert-actions-row">
                <button
                  type="button"
                  className="btn-template-secondary alert-action-btn"
                  onClick={() => scheduleMaintenance(alert)}
                  disabled={
                    schedulingAlertId === alert.id ||
                    ignoringId === alert.id ||
                    schedules.some((item) => Number(item.alert) === Number(alert.id))
                  }
                >
                  {schedulingAlertId === alert.id
                    ? 'Scheduling...'
                    : schedules.some((item) => Number(item.alert) === Number(alert.id))
                      ? 'Already Scheduled'
                      : 'Schedule Maintenance'}
                </button>
                <button
                  type="button"
                  className="btn-outline-danger alert-action-btn"
                  onClick={() => ignoreAlert(alert)}
                  disabled={ignoringId === alert.id || schedulingAlertId === alert.id}
                >
                  {ignoringId === alert.id ? 'Ignoring...' : 'Ignore Alert'}
                </button>
              </div>
            </article>
          )
        })}
      </div>

      <hr className="section-divider" />
      <section>
        <div className="maintenance-header-row">
          <h3 className="template-accent-title">Maintenance Scheduling</h3>
          <div className="maintenance-filter-group">
            <button
              type="button"
              className={`maintenance-filter-btn ${scheduleFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setScheduleFilter('ALL')}
            >
              All ({scheduleCounts.total})
            </button>
            <button
              type="button"
              className={`maintenance-filter-btn ${scheduleFilter === 'PENDING' ? 'active' : ''}`}
              onClick={() => setScheduleFilter('PENDING')}
            >
              Pending ({scheduleCounts.pending})
            </button>
          </div>
        </div>

        {schedules.length === 0 ? (
          <article className="maintenance-empty-card">
            <i className="far fa-calendar-alt" />
            <p>No maintenance schedules found.</p>
            <small>Use Schedule Maintenance on an active alert to add rows here.</small>
          </article>
        ) : filteredSchedules.length === 0 ? (
          <article className="maintenance-empty-card">
            <i className="far fa-calendar-check" />
            <p>No schedules match the selected filter.</p>
            <small>Try switching to another filter to view available schedules.</small>
          </article>
        ) : (
          <div className="table-card-wrap">
            <table className="template-table">
              <thead>
                <tr>
                  <th>Machine</th>
                  <th>Scheduled Date</th>
                  <th>Assigned To</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredSchedules.map((schedule) => (
                  <tr key={schedule.id}>
                    <td>{schedule.machine_id}</td>
                    <td>{schedule.scheduled_for ? new Date(schedule.scheduled_for).toLocaleString() : 'N/A'}</td>
                    <td>{schedule.assigned_to || 'Unassigned'}</td>
                    <td>
                      <span className={`status-pill ${getMaintenanceStatusBadge(schedule.status)}`}>
                        {String(schedule.status || 'PENDING').toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <div className="maintenance-action-row">
                        <button
                          type="button"
                          className="btn-outline-success maintenance-action-btn"
                          onClick={() => completeSchedule(schedule)}
                          disabled={
                          completingScheduleId === schedule.id ||
                          cancellingScheduleId === schedule.id ||
                          ['COMPLETED', 'CANCELLED'].includes(String(schedule.status || '').toUpperCase())
                        }
                      >
                        {completingScheduleId === schedule.id
                          ? 'Completing...'
                          : String(schedule.status || '').toUpperCase() === 'COMPLETED'
                            ? 'Completed'
                            : String(schedule.status || '').toUpperCase() === 'CANCELLED'
                              ? 'Cancelled'
                            : 'Maintenance Complete'}
                      </button>
                      <button
                          type="button"
                          className="btn-outline-danger maintenance-action-btn"
                          onClick={() => cancelSchedule(schedule)}
                          disabled={
                          cancellingScheduleId === schedule.id ||
                          completingScheduleId === schedule.id ||
                          ['COMPLETED', 'CANCELLED'].includes(String(schedule.status || '').toUpperCase())
                        }
                      >
                        {cancellingScheduleId === schedule.id
                          ? 'Cancelling...'
                          : String(schedule.status || '').toUpperCase() === 'CANCELLED'
                            ? 'Cancelled'
                            : 'Cancel Maintenance'}
                      </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={{ marginTop: '32px' }}>
        <h3 className="template-accent-title">Alert History</h3>
        <div className="table-card-wrap">
          <table className="template-table history-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Machine</th>
                <th>Alert Type</th>
                <th>Severity</th>
                <th>Maintenance Date</th>
                <th>Maintenance Status</th>
              </tr>
            </thead>
            <tbody>
              {historyRows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center' }}>
                    No resolved alerts yet.
                  </td>
                </tr>
              ) : (
                historyRows.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.created_at).toLocaleString()}</td>
                    <td>{row.machine_id || 'N/A'}</td>
                    <td>{row.alert_type}</td>
                    <td>
                      <span className={`alert-severity-badge ${row.severity === 'CRITICAL' ? 'critical' : 'warning'}`}>
                        {row.severity}
                      </span>
                    </td>
                    <td>{row.maintenance_date ? new Date(row.maintenance_date).toLocaleString() : 'N/A'}</td>
                    <td>
                      <span className={`status-pill ${getMaintenanceStatusBadge(row.maintenance_status)}`}>
                        {row.maintenance_status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginTop: '32px' }}>
        <h3 className="template-accent-title">Ignored Alerts</h3>
        <div className="table-card-wrap">
          <table className="template-table history-table">
            <thead>
              <tr>
                <th>Machine ID</th>
                <th>Date & Time</th>
                <th>Alert Type</th>
                <th>Severity</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {ignoredAlerts.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center' }}>
                    No ignored alerts yet.
                  </td>
                </tr>
              ) : (
                ignoredAlerts.map((row) => (
                  <tr key={row.id}>
                    <td>{row.machine_id || 'N/A'}</td>
                    <td>{row.date_time ? new Date(row.date_time).toLocaleString() : 'N/A'}</td>
                    <td>{row.alert_type || 'UNKNOWN'}</td>
                    <td>
                      <span
                        className={`alert-severity-badge ${
                          String(row.severity || '').toUpperCase() === 'CRITICAL' ? 'critical' : 'warning'
                        }`}
                      >
                        {String(row.severity || 'WARNING').toUpperCase()}
                      </span>
                    </td>
                    <td>
                      {row.confidence_score === null || row.confidence_score === undefined
                        ? 'N/A'
                        : `${Number(row.confidence_score).toFixed(1)}%`}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}

