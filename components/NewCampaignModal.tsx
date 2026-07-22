'use client'
import { useState } from 'react'
import { Campaign, GOAL_OPTIONS } from '@/lib/types'

interface Props {
  onClose: () => void
  onCreated: (campaign: Campaign) => void
}

export default function NewCampaignModal({ onClose, onCreated }: Props) {
  const [form, setForm] = useState({
    name: '',
    goal: 'sales',
    target_persona: '',
    your_name: '',
    your_role: '',
    your_pitch: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(k: string, v: string) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  async function submit() {
    if (!form.name || !form.target_persona || !form.your_name || !form.your_role || !form.your_pitch) {
      setError('Fill in all fields to continue.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      onCreated(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 20,
    }}>
      <div style={{
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        borderRadius: 16, width: '100%', maxWidth: 520,
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>New campaign</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Set up your outreach campaign</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 18, padding: 4 }}>✕</button>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Section label="Campaign name">
            <input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. CTOs at SaaS startups — July"
            />
          </Section>

          <Section label="Goal">
            <select value={form.goal} onChange={e => set('goal', e.target.value)}>
              {GOAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Section>

          <Section label="Target persona" hint="Describe who you want to reach. The Playwright bot will search for these people on LinkedIn.">
            <textarea
              value={form.target_persona}
              onChange={e => set('target_persona', e.target.value)}
              placeholder="e.g. CTOs and VP Engineering at B2B SaaS companies, 10–200 employees, based in the US"
              style={{ minHeight: 80 }}
            />
          </Section>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Your details</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Section label="Your name">
                  <input value={form.your_name} onChange={e => set('your_name', e.target.value)} placeholder="Alex Kim" />
                </Section>
                <Section label="Your role">
                  <input value={form.your_role} onChange={e => set('your_role', e.target.value)} placeholder="Founder at Acme" />
                </Section>
              </div>
              <Section label="Value prop" hint="1–2 sentences on what you do and why it's relevant to them.">
                <textarea
                  value={form.your_pitch}
                  onChange={e => set('your_pitch', e.target.value)}
                  placeholder="We help engineering teams cut deployment time by 60% with automated CI/CD pipelines..."
                  style={{ minHeight: 70 }}
                />
              </Section>
            </div>
          </div>

          {error && (
            <div style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--red)' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={onClose}
              style={{ flex: 1, padding: '10px', background: 'none', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-2)', fontSize: 14 }}
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={saving}
              style={{
                flex: 2, padding: '10px', background: 'var(--accent)',
                border: 'none', borderRadius: 8, color: '#fff',
                fontSize: 14, fontWeight: 500, opacity: saving ? 0.6 : 1
              }}
            >
              {saving ? 'Creating...' : 'Create campaign →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 13, color: 'var(--text-2)', display: 'block', marginBottom: 6, fontWeight: 500 }}>{label}</label>
      {hint && <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6, lineHeight: 1.5 }}>{hint}</div>}
      {children}
    </div>
  )
}
