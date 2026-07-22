'use client'
import { useState } from 'react'
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

export default function AddLeadsModal({ campaign, onClose, onAdded }: Props) {
  const [mode, setMode] = useState<'manual' | 'csv'>('manual')
  const [manualLeads, setManualLeads] = useState<LeadInput[]>([{ ...EMPTY_LEAD }])
  const [csvText, setCsvText] = useState('')
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')

  function updateLead(i: number, k: keyof LeadInput, v: string) {
    setManualLeads(prev => prev.map((l, idx) => idx === i ? { ...l, [k]: v } : l))
  }

  function addRow() {
    setManualLeads(prev => [...prev, { ...EMPTY_LEAD }])
  }

  function removeRow(i: number) {
    setManualLeads(prev => prev.filter((_, idx) => idx !== i))
  }

  function parseCsv(text: string): LeadInput[] {
    const lines = text.trim().split('\n')
    if (lines.length < 2) return []
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
    return lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      const obj: any = {}
      headers.forEach((h, i) => { obj[h] = vals[i] || '' })
      return {
        name: obj.name || obj['full name'] || '',
        role: obj.role || obj.title || obj.position || '',
        company: obj.company || obj.organization || '',
        linkedin_url: obj.linkedin_url || obj.linkedin || obj.url || '',
        about: obj.about || obj.summary || '',
        extra_context: obj.extra_context || obj.notes || '',
      }
    }).filter(l => l.name)
  }

  async function submit() {
    let leads: LeadInput[] = []
    if (mode === 'manual') {
      leads = manualLeads.filter(l => l.name.trim())
    } else {
      leads = parseCsv(csvText)
    }

    if (leads.length === 0) {
      setError('Add at least one lead with a name.')
      return
    }

    setSaving(true)
    setError('')
    setProgress(`Generating personalized messages for ${leads.length} lead${leads.length > 1 ? 's' : ''}...`)

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads, campaign }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setProgress('')
      onAdded(data.leads)
    } catch (e: any) {
      setError(e.message)
      setProgress('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 20,
    }}>
      <div style={{
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        borderRadius: 16, width: '100%', maxWidth: 640,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Add leads</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Claude will write personalized messages for each lead automatically
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 18, padding: 4 }}>✕</button>
        </div>

        {/* Mode toggle */}
        <div style={{ padding: '12px 24px 0', display: 'flex', gap: 8 }}>
          {(['manual', 'csv'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: '6px 16px', borderRadius: 7, fontSize: 13,
              background: mode === m ? 'var(--accent-dim)' : 'transparent',
              border: mode === m ? '1px solid var(--accent)' : '1px solid var(--border)',
              color: mode === m ? 'var(--accent-light)' : 'var(--text-2)',
              fontWeight: mode === m ? 500 : 400,
            }}>
              {m === 'manual' ? '✏️ Manual entry' : '📄 Paste CSV'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {mode === 'manual' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {manualLeads.map((lead, i) => (
                <div key={i} style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 10, padding: 14,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)' }}>Lead #{i + 1}</span>
                    {manualLeads.length > 1 && (
                      <button onClick={() => removeRow(i)} style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 13 }}>Remove</button>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Field label="Full name *">
                      <input value={lead.name} onChange={e => updateLead(i, 'name', e.target.value)} placeholder="Sarah Chen" />
                    </Field>
                    <Field label="LinkedIn URL">
                      <input value={lead.linkedin_url} onChange={e => updateLead(i, 'linkedin_url', e.target.value)} placeholder="linkedin.com/in/sarahchen" />
                    </Field>
                    <Field label="Role / Title">
                      <input value={lead.role} onChange={e => updateLead(i, 'role', e.target.value)} placeholder="VP of Engineering" />
                    </Field>
                    <Field label="Company">
                      <input value={lead.company} onChange={e => updateLead(i, 'company', e.target.value)} placeholder="Stripe" />
                    </Field>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <Field label="About / LinkedIn summary">
                      <textarea
                        value={lead.about}
                        onChange={e => updateLead(i, 'about', e.target.value)}
                        placeholder="Paste their LinkedIn About section here..."
                        style={{ minHeight: 60 }}
                      />
                    </Field>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <Field label="Extra context (optional)">
                      <input value={lead.extra_context} onChange={e => updateLead(i, 'extra_context', e.target.value)} placeholder="Recent post, shared connection, mutual interest..." />
                    </Field>
                  </div>
                </div>
              ))}
              <button
                onClick={addRow}
                style={{
                  padding: '10px', background: 'none',
                  border: '1px dashed var(--border)', borderRadius: 10,
                  color: 'var(--text-3)', fontSize: 13, width: '100%'
                }}
              >
                + Add another lead
              </button>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 8 }}>
                Paste CSV with headers: <code style={{ background: 'var(--surface)', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>name, role, company, linkedin_url, about, extra_context</code>
              </div>
              <textarea
                value={csvText}
                onChange={e => setCsvText(e.target.value)}
                placeholder={`name,role,company,linkedin_url,about\nSarah Chen,VP Engineering,Stripe,linkedin.com/in/sarahchen,"Builder of great teams..."`}
                style={{ minHeight: 200, fontFamily: 'monospace', fontSize: 12 }}
              />
              {csvText && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-3)' }}>
                  {parseCsv(csvText).length} valid lead{parseCsv(csvText).length !== 1 ? 's' : ''} detected
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)' }}>
          {progress && (
            <div style={{ fontSize: 13, color: 'var(--accent-light)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              {progress}
            </div>
          )}
          {error && (
            <div style={{ fontSize: 13, color: 'var(--red)', marginBottom: 10 }}>{error}</div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ flex: 1, padding: '10px', background: 'none', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-2)', fontSize: 14 }}>
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={saving}
              style={{ flex: 2, padding: '10px', background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 500, opacity: saving ? 0.6 : 1 }}
            >
              {saving ? 'Generating messages...' : '⚡ Generate & save leads'}
            </button>
          </div>
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
