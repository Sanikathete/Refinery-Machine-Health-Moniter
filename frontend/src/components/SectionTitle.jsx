export default function SectionTitle({ sublabel, title }) {
  return (
    <div style={{ marginBottom: 40, textAlign: 'center' }}>
      <div
        style={{
          color: '#f4a014',
          textTransform: 'uppercase',
          fontSize: 13,
          letterSpacing: 3,
          marginBottom: 8,
          fontWeight: 700,
        }}
      >
        {sublabel}
      </div>
      <h2 style={{ color: '#1a2236', fontWeight: 800, fontSize: 36, margin: 0 }}>{title}</h2>
    </div>
  )
}

