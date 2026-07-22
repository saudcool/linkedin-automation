'use client'
import { useState } from 'react'
import { Lead, STATUS_LABELS, LeadStatus } from '@/lib/types'

interface Props {
  lead: Lead
  onClose: () => void
  onUpdate: (lead: Lead) => void
}

export default function LeadDetail({ lead, onClose, onUpdate }: Props) {
  const [copied, setCopied] = useState<string | null>(null)

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 1500)
    })
  }

  async function updateStatus(status: LeadStatus) {
    const res = await fetch('/api/leads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: lead.id, status }),
    })
    const updated = await res.json()
    onUpdate(updated)
  }

  const messages = [
    { key: 'connection', label: 'Connection request', day: 'Day 0', text: lead.connection_msg, charLimit: 280 },
    { key: 'msg1', label: 'First message', day: 'Day 3', text: lead.msg1, charLimit: null },
    { key: 'msg2', label: 'Follow-up', day: 'Day 7', text: lead.msg2, charLimit: null },
    { key: 'breakup', label: 'Breakup message', day: 'Day 14', text: lead.breakup_msg, charLimit: null },
  ]

  const statusFlow: LeadStatus[] = ['pending', 'connection_sent', 'connected', 'msg1_sent', 'msg2_sent', 'breakup_sent', 'replied', 'converted', 'ignored']

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', justifyContent: 'flex-end', zIndex: 100,
    }}>
      <div style={{
        width: '100%', maxWidth: 480,
        background: 'var(--surface-2)', borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', height: '100%',
        animation: 'slideIn 0.2s ease',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{
                width: 42, height: 42, borderRadius: '50%',
                background: 'var(--accent-dim)', border: '1px solid var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 700, color: 'var(--accent-light)',
              }}>
                {lead.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{lead.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  {lead.role}{lead.company ? ` · ${lead.company}` : ''}
                </div>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 18, padding: 4 }}>✕</button>
          </div>

          {/* LinkedIn link */}
          {lead.linkedin_url && (
            <a
              href={lead.linkedin_url.startsWith('http') ? lead.linkedin_url : `https://${lead.linkedin_url}`}
              target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 12, color: 'var(--accent-light)', textDecoration: 'none' }}
            >
              🔗 View LinkedIn profile →
            </a>
          )}
        </div>

        {/* Status control */}
        <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Update status</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {statusFlow.map(s => (
              <button
                key={s}
                onClick={() => updateStatus(s)}
                style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 11,
                  background: lead.status === s ? 'var(--accent)' : 'var(--surface-2)',
                  border: `1px solid ${lead.status === s ? 'var(--accent)' : 'var(--border)'}`,
                  color: lead.status === s ? '#fff' : 'var(--text-2)',
                  fontWeight: lead.status === s ? 600 : 400,
                }}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
            Outreach sequence
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map(msg => (
              <div key={msg.key} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 10, overflow: 'hidden',
              }}>
                <div style={{
                  padding: '8px 14px', borderBottom: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)' }}>{msg.label}</span>
                    <span style={{
                      fontSize: 10, padding: '2px 7px', borderRadius: 20,
                      background: 'var(--accent-dim)', color: 'var(--accent-light)',
                      border: '1px solid var(--accent)22'
                    }}>{msg.day}</span>
                    {msg.charLimit && (
                      <span style={{
                        fontSize: 10, color: (msg.text?.length || 0) > msg.charLimit ? 'var(--red)' : 'var(--text-3)'
                      }}>
                        {msg.text?.length || 0}/{msg.charLimit}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => copy(msg.text || '', msg.key)}
                    style={{
                      padding: '3px 10px', background: 'none',
                      border: '1px solid var(--border)', borderRadius: 6,
                      color: copied === msg.key ? 'var(--green)' : 'var(--text-3)',
                      fontSize: 11,
                    }}
                  >
                    {copied === msg.key ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
                <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                  {msg.text || <span style={{ color: 'var(--text-3)' }}>No message generated</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Reply section */}
          {lead.reply_text && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                ↩ They replied
              </div>
              <div style={{
                background: 'var(--green-dim)', border: '1px solid var(--green)',
                borderRadius: 10, padding: '12px 14px', fontSize: 13, color: 'var(--text)',
                lineHeight: 1.65,
              }}>
                {lead.reply_text}
              </div>
              {lead.reply_sentiment && (
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-3)' }}>
                  AI classified as: <strong style={{ color: 'var(--text-2)' }}>{lead.reply_sentiment}</strong>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <style>{`
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
    </div>
  )
}
