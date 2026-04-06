import { useEffect, useMemo, useState } from 'react'
import api from '../api/axios'

const MACHINE_OPTIONS = ['PUMP_1', 'PUMP_2', 'COMP_1', 'COMP_2', 'VALVE_1', 'VALVE_2']
const PREDICTION_HISTORY_KEY = 'neurorefine_prediction_history_v1'

function cleanMarkdownText(text) {
  if (!text) return ''
  return text
    .replace(/\r/g, '')
    .replace(/^---$/gm, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '- ')
    .replace(
      /Note:\s*This fallback report was generated because Gemini was unavailable\.?/gi,
      '',
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function buildPreview(text) {
  const cleaned = cleanMarkdownText(text).replace(/\s+/g, ' ').trim()
  if (!cleaned) return 'No summary available.'
  return cleaned.length <= 120 ? cleaned : `${cleaned.slice(0, 120)}...`
}

export default function Reports() {
  const [reports, setReports] = useState([])
  const [expandedReportId, setExpandedReportId] = useState(null)
  const [generateMachine, setGenerateMachine] = useState('')
  const [availableMachines, setAvailableMachines] = useState([])
  const [machineStatusMap, setMachineStatusMap] = useState({})
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [deletingReportId, setDeletingReportId] = useState(null)
  const [error, setError] = useState('')

  const fetchReports = async () => {
    setLoading(true)
    setError('')
    try {
      let predictedMachines = []
      try {
        const raw = window.localStorage.getItem(PREDICTION_HISTORY_KEY)
        const parsed = raw ? JSON.parse(raw) : []
        if (Array.isArray(parsed)) {
          const recentHistory = parsed.slice(-10)
          predictedMachines = [
            ...new Set(
              recentHistory
                .map((item) => item?.machine_id)
                .filter((machineId) => MACHINE_OPTIONS.includes(machineId)),
            ),
          ]
        }
      } catch {
        predictedMachines = []
      }

      setAvailableMachines(predictedMachines)
      if (!predictedMachines.includes(generateMachine)) {
        setGenerateMachine(predictedMachines[0] || '')
      }

      const response = await api.get('/reports/')
      const allReports = Array.isArray(response.data) ? response.data : []
      const nextReports = allReports.filter((report) => predictedMachines.includes(report?.machine_id))
      setReports(nextReports)

      const uniqueMachines = [...new Set(nextReports.map((report) => report.machine_id).filter(Boolean))]
      const statusRequests = uniqueMachines.map((machineId) =>
        api
          .get('/readings/', { params: { machine_id: machineId } })
          .then((readingResponse) => {
            const latest = Array.isArray(readingResponse.data) ? readingResponse.data[0] : null
            if (!latest) return { machineId, status: 'UNKNOWN' }
            return { machineId, status: latest.failure ? 'FAILURE' : 'HEALTHY' }
          })
          .catch(() => ({ machineId, status: 'UNKNOWN' })),
      )
      const statusData = await Promise.all(statusRequests)
      const statusMap = {}
      statusData.forEach(({ machineId, status }) => {
        statusMap[machineId] = status
      })
      setMachineStatusMap(statusMap)
    } catch (fetchError) {
      setError(fetchError.message || 'Unable to fetch reports.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchReports()
  }, [])

  const handleGenerate = async () => {
    if (!generateMachine) {
      setError('Run at least one prediction first, then generate reports for those machines.')
      return
    }

    setGenerating(true)
    setError('')
    try {
      await api.post('/reports/generate/', { machine_id: generateMachine })
      await fetchReports()
    } catch (generateError) {
      setError(generateError.message || 'Failed to generate report.')
    } finally {
      setGenerating(false)
    }
  }

  const handleRemoveReport = async (report) => {
    if (!report?.id) return
    const confirmed = window.confirm(
      `Remove this report for ${report.machine_id || 'Unknown Machine'} created at ${
        report.created_at ? new Date(report.created_at).toLocaleString() : 'N/A'
      }?`,
    )
    if (!confirmed) return

    setDeletingReportId(report.id)
    setError('')
    try {
      await api.delete(`/reports/${report.id}/`)
      setReports((prev) => prev.filter((item) => item.id !== report.id))
      if (expandedReportId === report.id) {
        setExpandedReportId(null)
      }
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to remove report.')
    } finally {
      setDeletingReportId(null)
    }
  }

  const sortedReports = useMemo(
    () =>
      [...reports].sort((a, b) => {
        const aTime = new Date(a.created_at || 0).getTime()
        const bTime = new Date(b.created_at || 0).getTime()
        return bTime - aTime
      }),
    [reports],
  )

  return (
    <section className="app-page">
      <div className="template-header-card">
        <div>
          <div className="template-sublabel">GEMINI-POWERED MACHINE HEALTH SUMMARIES</div>
          <h2 className="template-page-title">AI-Generated Reports</h2>
        </div>

        <div className="reports-header-controls">
          <select
            className="template-input template-select"
            value={generateMachine}
            onChange={(event) => setGenerateMachine(event.target.value)}
            disabled={availableMachines.length === 0}
          >
            {availableMachines.map((machine) => (
              <option value={machine} key={machine}>
                {machine}
              </option>
            ))}
          </select>
          <button
            className="btn-template-primary"
            onClick={handleGenerate}
            disabled={generating || availableMachines.length === 0}
          >
            {generating ? (
              <span className="btn-loading-wrap">
                <i className="fas fa-spinner fa-spin" /> Generating...
              </span>
            ) : (
              'Generate Report'
            )}
          </button>
        </div>
      </div>

      {loading ? <p className="status-text status-loading">Loading reports...</p> : null}
      {error ? <p className="status-text status-error">{error}</p> : null}

      <div className="reports-grid-template">
        {sortedReports.map((report) => {
          const status = machineStatusMap[report.machine_id] || 'UNKNOWN'
          const isExpanded = expandedReportId === report.id
          const borderClass = status === 'FAILURE' ? 'report-failure' : status === 'HEALTHY' ? 'report-healthy' : 'report-unknown'

          return (
            <article key={report.id} className={`report-card-template wow fadeInDown is-visible ${borderClass}`}>
              <div className="report-card-top">
                <div>
                  <h3>{report.machine_id || 'Unknown Machine'}</h3>
                  <span className={`status-pill ${status === 'FAILURE' ? 'badge-failure' : status === 'HEALTHY' ? 'badge-healthy' : 'badge-pending'}`}>
                    {status}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="card-meta">
                    {report.created_at ? new Date(report.created_at).toLocaleString() : 'Date unavailable'}
                  </span>
                  <button
                    type="button"
                    className="btn-outline-danger"
                    onClick={() => handleRemoveReport(report)}
                    disabled={deletingReportId === report.id}
                  >
                    {deletingReportId === report.id ? 'Removing...' : 'Remove'}
                  </button>
                </div>
              </div>

              <p className="report-preview-text">{buildPreview(report.gemini_explanation)}</p>

              <button
                type="button"
                className="expand-btn"
                onClick={() => setExpandedReportId(isExpanded ? null : report.id)}
              >
                Expand
                <i className={`fas fa-chevron-down ${isExpanded ? 'rotated' : ''}`} />
              </button>

              <div className={`report-expand-panel ${isExpanded ? 'expanded' : ''}`}>
                <div className="report-full-text-box">
                  {cleanMarkdownText(
                    report.gemini_explanation || report.root_cause || 'No detailed report available.',
                  )}
                </div>
              </div>
            </article>
          )
        })}
      </div>

      {!loading && sortedReports.length === 0 ? (
        <p className="status-text">
          {availableMachines.length === 0
            ? 'No local prediction history found. Run a prediction first to unlock reports.'
            : 'No reports for your predicted machines yet. Create one using the controls above.'}
        </p>
      ) : null}
    </section>
  )
}

