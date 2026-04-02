import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import api from '../api/axios'

const MACHINE_OPTIONS = ['PUMP_1', 'PUMP_2', 'COMP_1', 'COMP_2', 'VALVE_1', 'VALVE_2']

function cleanMarkdownText(text) {
  if (!text) return ''
  return text
    .replace(/\r/g, '')
    .replace(/^---$/gm, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function summarizeReportText(text) {
  if (!text) return 'No summary available.'
  const cleaned = cleanMarkdownText(text)
  const filtered = cleaned
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(
      (line) =>
        !/^date:/i.test(line) &&
        !/^report id:/i.test(line) &&
        !/^machine tag:/i.test(line) &&
        !/^location:/i.test(line) &&
        !/^maintenance report:/i.test(line),
    )
    .join(' ')
  const compact = filtered.replace(/\s+/g, ' ').trim()
  if (compact.length <= 170) return compact
  return `${compact.slice(0, 170)}...`
}

function getReportLines(text) {
  return cleanMarkdownText(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function classifyReportLine(line) {
  if (/^•\s+/.test(line)) return 'bullet'
  if (/^\d+\.\s+/.test(line)) return 'section'
  if (/^[A-Za-z][A-Za-z ]+:\s*$/.test(line)) return 'section'
  if (
    /^(date:|report id:|machine tag:|location:|maintenance report:|priority level:|machine status summary:|root cause analysis:|recommended actions:)/i.test(
      line,
    )
  ) {
    return 'section'
  }
  return 'text'
}

export default function Reports() {
  const [reports, setReports] = useState([])
  const [expandedReportId, setExpandedReportId] = useState(null)
  const [generateMachine, setGenerateMachine] = useState(MACHINE_OPTIONS[0])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  const fetchReports = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api.get('/reports/')
      setReports(Array.isArray(response.data) ? response.data : [])
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

  return (
    <motion.section
      className="page"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <div className="toolbar">
        <div>
          <h2 className="section-title">AI Reports</h2>
          <p className="section-subtitle">Inspect generated maintenance insights by machine.</p>
        </div>

        <div className="card" style={{ padding: '0.75rem' }}>
          <label htmlFor="report-machine" style={{ fontSize: '0.9rem', fontWeight: '600' }}>
            Generate for machine
          </label>
          <div style={{ display: 'flex', gap: '0.55rem', marginTop: '0.45rem' }}>
            <select
              id="report-machine"
              className="select"
              value={generateMachine}
              onChange={(event) => setGenerateMachine(event.target.value)}
            >
              {MACHINE_OPTIONS.map((machine) => (
                <option value={machine} key={machine}>
                  {machine}
                </option>
              ))}
            </select>
            <button className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
              {generating ? 'Generating...' : 'Generate Report'}
            </button>
          </div>
        </div>
      </div>

      {loading ? <p className="status-text status-loading">Loading reports...</p> : null}
      {error ? <p className="status-text status-error">{error}</p> : null}

      <div className="reports-grid">
        {reports.map((report) => {
          const isExpanded = expandedReportId === report.id
          return (
            <article className="report-card card" key={report.id}>
              <div className="report-head">
                <div>
                  <h3>{report.machine_id || 'Unknown Machine'}</h3>
                  <p className="card-meta">
                    {report.created_at ? new Date(report.created_at).toLocaleString() : 'Date unavailable'}
                  </p>
                </div>
                <button
                  className="btn btn-secondary"
                  onClick={() => setExpandedReportId(isExpanded ? null : report.id)}
                >
                  {isExpanded ? 'Hide' : 'Expand'}
                </button>
              </div>

              <p>{summarizeReportText(report.gemini_explanation)}</p>

              <AnimatePresence>
                {isExpanded ? (
                  <motion.div
                    className="report-full"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    {getReportLines(report.gemini_explanation || report.root_cause || 'No detailed report available.').map(
                      (line, index) => (
                        <p key={`${report.id}-${index}`} className={`report-line report-line-${classifyReportLine(line)}`}>
                          {line}
                        </p>
                      ),
                    )}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </article>
          )
        })}
      </div>

      {!loading && reports.length === 0 ? (
        <p className="status-text">No reports generated yet. Create one using the panel above.</p>
      ) : null}
    </motion.section>
  )
}
