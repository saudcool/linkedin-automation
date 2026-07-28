'use client'
import { useState, useRef } from 'react'
import { Campaign, Lead } from '@/lib/types'

interface Props {
  campaign: Campaign
  onClose: () => void
  onAdded: (leads: Lead[]) => void
}

interface LeadInput {
  name: string
  role: string
  company: string
  linkedin_url: string
  about: string
  extra_context: string
}

const EMPTY_LEAD: LeadInput = { name: '', role: '', company: '', linkedin_url: '', about: '', extra_context: '' }

const FIELDS = [
  { key: 'name', label: 'Full name', required: true },
  { key: 'role', label: 'Role / Title', required: false },
  { key: 'company', label: 'Company', required: false },
  { key: 'linkedin_url', label: 'LinkedIn URL', required: false },
  { key: 'about', label: 'About / Summary', required: false },
  { key: 'extra_context', label: 'Extra context', required: false },
]

export default function AddLeadsModal({ campaign, onClose, onAdded }: Props) {
  const [mode, setMode] = useState<'manual' | 'csv'>('manual')
  const [manualLeads, setManualLeads] = useState<LeadInput[]>([{ ...EMPTY_LEAD }])

  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [csvStep, setCsvStep] = useState<'upload' | 'map' | 'preview'>('upload')
  const [csvFileName, setCsvFileName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')

  function updateLead(i: number, k: keyof LeadInput, v: string) {
    setManualLeads(prev => prev.map((l, idx) => idx === i ? { ...l, [k]: v } : l))
  }
  function addRow() { setManualLeads(prev => [...prev, { ...EMPTY_LEAD }]) }
  function removeRow(i: number) { setManualLeads(prev => prev.filter((_, idx) => idx !== i)) }

  function parseRawCsv(text: string): { headers: string[]; rows: string[][] } {
    const lines = text.trim().split('\n').filter(l => l.trim())
    if (lines.length < 2) return { headers: [], rows: [] }
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
    const rows = lines.slice(1).map(line => {
      const vals: string[] = []
      let current = ''
      let inQuotes = false
      for (const char of line) {
        if (char === '"') { inQuotes = !inQuotes }
        else if (char === ',' && !inQuotes) { vals.push(current.trim()); current = '' }
        else { current += char }
      }
      vals.push(current.trim())
      return vals
    })
    return { headers, rows }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvFileName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const { headers, rows } = parseRawCsv(text)
      if (headers.length === 0) {
        setError('Could not parse CSV. Make sure it has a header row.')
        return
      }
      setCsvHeaders(headers)
      setCsvRows(rows)
      const autoMap: Record<string, string> = {}
      FIELDS.forEach(f => {
        const match = headers.find(h => {
          const hl = h.toLowerCase()
          if (f.key === 'name') return hl.includes('name')
          if (f.key === 'role') return hl.includes('role') || hl.includes('title') || hl.includes('position')
          if (f.key === 'company') return hl.includes('company') || hl.includes('organization') || hl.includes('org')
          if (f.key === 'linkedin_url') return hl.includes('linkedin') || hl.includes('url') || hl.includes('profile')
          if (f.key === 'about') return hl.includes('about') || hl.includes('summary') || hl.includes('bio')
          if (f.key === 'extra_context') return hl.includes('extra') || hl.includes('notes') || hl.includes('context')
          return false
        })
        if (match) autoMap[f.key] = match
      })
      setMapping(autoMap)
      setCsvStep('map')
      setError('')
    }
    reader.readAsText(file)
  }

  function getMappedLeads(): LeadInput[] {
    return csvRows.map(row => {
      const get = (key: string) => {
        const header = mapping[key]
        if (!header) return ''
        const idx = csvHeaders.indexOf(header)
        return idx >= 0 ? (row[idx] || '').trim() : ''
      }
      return {
        name: get('name'),
        role: get('role'),
        company: get('company'),
        linkedin_url: get('linkedin_url'),
        about: get('about'),
        extra_context: get('extra_context'),
      }
    }).filter(l => l.name)
  }

  async function submit() {
    let leads: LeadInput[] = []
    if (mode === 'manual') {
      leads = manualLeads.filter(l => l.name.trim())
    } else {
      leads = getMappedLeads()
    }
    if (leads.length === 0) {
      setError('No valid leads found. Make sure the Name column is mapped and has data.')
      return
    }
    setSaving(true)
    setError('')
    setProgress(`Writing personalized messages for ${leads.length} lead${leads.length > 1 ? 's' : ''} with Claude...`)
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads, campaign }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      onAdded(data.leads)
    } catch (e: any) {
      setError(e.message)
      setProgress('')
    } finally {
      setSaving(false)
    }
  }

  const mappedLeads = mode === 'csv' && csvStep !== 'upload' ? getMappedLeads() : []

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 660, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Add leads</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Claude writes personalized messages for every lead automatically</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 18, padding: 4, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ padding: '12px 24px 0', display: 'flex', gap: 8 }}>
          {(['manual', 'csv'] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setError('') }} style={{
              padding: '6px 16px', borderRadius: 7, fontSize: 13, cursor: 'pointer',
              background: mode === m ? 'var(--accent-dim)' : 'transparent',
              border: mode === m ? '1px solid var(--accent)' : '1px solid var(--border)',
              color: mode === m ? 'var(--accent-light)' : 'var(--text-2)',
              fontWeight: mode === m ? 500 : 400,
            }}>
              {m === 'manual' ? '✏️ Manual entry' : '📄 Upload CSV'}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {mode === 'manual' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {manualLeads.map((lead, i) => (
                <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)' }}>Lead #{i + 1}</span>
                    {manualLeads.length > 1 && <button onClick={() => removeRow(i)} style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 13, cursor: 'pointer' }}>Remove</button>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Field label="Full name *"><input value={lead.name} onChange={e => updateLead(i, 'name', e.target.value)} placeholder="Sarah Chen" /></Field>
                    <Field label="LinkedIn URL"><input value={lead.linkedin_url} onChange={e => updateLead(i, 'linkedin_url', e.target.value)} placeholder="linkedin.com/in/sarahchen" /></Field>
                    <Field label="Role / Title"><input value={lead.role} onChange={e => updateLead(i, 'role', e.target.value)} placeholder="VP of Engineering" /></Field>
                    <Field label="Company"><input value={lead.company} onChange={e => updateLead(i, 'company', e.target.value)} placeholder="Stripe" /></Field>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <Field label="About / LinkedIn summary"><textarea value={lead.about} onChange={e => updateLead(i, 'about', e.target.value)} placeholder="Paste their LinkedIn About section..." style={{ minHeight: 60 }} /></Field>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <Field label="Extra context (optional)"><input value={lead.extra_context} onChange={e => updateLead(i, 'extra_context', e.target.value)} placeholder="Recent post, shared interest..." /></Field>
                  </div>
                </div>
              ))}
              <button onClick={addRow} style={{ padding: '10px', background: 'none', border: '1px dashed var(--border)', borderRadius: 10, color: 'var(--text-3)', fontSize: 13, width: '100%', cursor: 'pointer' }}>+ Add another lead</button>
            </div>
          )}

          {mode === 'csv' && csvStep === 'upload' && (
            <div>
              <div onClick={() => fileRef.current?.click()} style={{ border: '2px dashed var(--border)', borderRadius: 12, padding: '48px 24px', textAlign: 'center', cursor: 'pointer' }}
                onMouseOver={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onMouseOut={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
                <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>Click to upload your CSV file</div>
                <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Any CSV with a header row — you'll map columns in the next step</div>
              </div>
              <input ref={fileRef} type="file" accept=".csv" onChange={handleFileUpload} style={{ display: 'none' }} />
              <div style={{ marginTop: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 8 }}>EXAMPLE — column names don't matter, you'll map them next</div>
                <code style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.8, display: 'block' }}>
                  name,title,company,linkedin,bio<br />
                  Sarah Chen,VP Engineering,Stripe,linkedin.com/in/sarah,"Loves scaling teams..."<br />
                  John Smith,CTO,Acme,linkedin.com/in/john,"Building fintech..."
                </code>
              </div>
            </div>
          )}

          {mode === 'csv' && csvStep === 'map' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: 'var(--text-2)' }}>📄 <strong style={{ color: 'var(--text)' }}>{csvFileName}</strong> — {csvRows.length} rows</div>
                <button onClick={() => { setCsvStep('upload'); setCsvFileName(''); setCsvHeaders([]); setCsvRows([]) }}
                  style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 10px', fontSize: 12, color: 'var(--text-3)', cursor: 'pointer' }}>
                  Change file
                </button>
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Map your CSV columns to lead fields</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {FIELDS.map(field => (
                  <div key={field.key} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center', gap: 12 }}>
                    <div>
                      <span style={{ fontSize: 13, color: 'var(--text)' }}>{field.label}</span>
                      {field.required && <span style={{ color: 'var(--accent-light)', marginLeft: 4, fontSize: 11 }}>required</span>}
                    </div>
                    <select value={mapping[field.key] || ''} onChange={e => setMapping(prev => ({ ...prev, [field.key]: e.target.value }))} style={{ fontSize: 13 }}>
                      <option value="">— skip —</option>
                      {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <button onClick={() => { if (!mapping['name']) { setError('Map the Name column to continue.'); return } setError(''); setCsvStep('preview') }}
                style={{ marginTop: 16, width: '100%', padding: '10px', background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                Preview leads →
              </button>
            </div>
          )}

          {mode === 'csv' && csvStep === 'preview' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ fontSize: 13, color: 'var(--text-2)' }}><strong style={{ color: 'var(--green)' }}>{mappedLeads.length} leads</strong> ready to import</div>
                <button onClick={() => setCsvStep('map')} style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 10px', fontSize: 12, color: 'var(--text-3)', cursor: 'pointer' }}>← Edit mapping</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
                {mappedLeads.slice(0, 20).map((lead, i) => (
                  <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--accent-dim)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--accent-light)', flexShrink: 0 }}>
                      {lead.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{lead.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                        {[lead.role, lead.company].filter(Boolean).join(' at ')}
                        {lead.linkedin_url && <span style={{ marginLeft: 8, color: 'var(--accent-light)' }}>🔗</span>}
                      </div>
                    </div>
                  </div>
                ))}
                {mappedLeads.length > 20 && <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-3)', padding: 8 }}>+ {mappedLeads.length - 20} more leads</div>}
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)' }}>
          {progress && (
            <div style={{ fontSize: 13, color: 'var(--accent-light)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              {progress}
            </div>
          )}
          {error && <div style={{ fontSize: 13, color: 'var(--red)', marginBottom: 10 }}>{error}</div>}
          {!(mode === 'csv' && (csvStep === 'upload' || csvStep === 'map')) && (
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={onClose} style={{ flex: 1, padding: '10px', background: 'none', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-2)', fontSize: 14, cursor: 'pointer' }}>Cancel</button>
              <button onClick={submit} disabled={saving} style={{ flex: 2, padding: '10px', background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 500, opacity: saving ? 0.6 : 1, cursor: 'pointer' }}>
                {saving ? 'Generating messages...' : `⚡ Import ${mode === 'csv' ? mappedLeads.length + ' leads' : 'leads'} & generate messages`}
              </button>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); }}`}</style>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 12, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}
