'use client'
import { useState, useEffect } from 'react'
import { Campaign, Lead, STATUS_LABELS, STATUS_COLORS } from '@/lib/types'
import AddLeadsModal from '@/components/AddLeadsModal'
import LeadDetail from '@/components/LeadDetail'

interface Props {
  campaign: Campaign
  onUpdate: (c: Campaign) => void
}

export default function CampaignDetail({ campaign, onUpdate }: Props) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddLeads, setShowAddLeads] = useState(false)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [tab, setTab] = useState<'leads' | 'stats'>('leads')

  async function loadLeads() {
    setLoading(true)
    try {
      const res = await fetch(`/api/leads?campaign_id=${campaign.id}`)
      const data = await res.json()
      if (Array.isArray(data)) setLeads(data)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadLeads() }, [campaign.id])

  async function toggleStatus() {
    const newStatus = campaign.status === 'active' ? 'paused' : 'active'
    const res = await fetch('/api/campaigns', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: campaign.id, status: newStatus }),
    })
    const updated = await res.json()
    onUpdate(updated)
  }

  function onLeadsAdded(newLeads: Lead[]) {
    setLeads(prev => [...newLeads, ...prev])
    setShowAddLeads(false)
    onUpdate({ ...campaign, leads_count: campaign.leads_count + newLeads.length })
  }

  const stats = {
    total: leads.length,
    pending: leads.filter(l => l.status === 'pending').length,
    inProgress: leads.filter(l => ['connection_sent', 'connected', 'msg1_sent', 'msg2_sent'].includes(l.status)).length,
    replied: leads.filter(l => l.status === 'replied').length,
    converted: leads.filter(l => l.status === 'converted').length,
    replyRate: leads.length > 0 ? Math.round((leads.filter(l => ['replied', 'converted'].includes(l.status)).length / leads.length) * 100) : 0,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px 28px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>{campaign.name}</div>
            <div style={{ color: 'var(--text-3)', fontSize: 13 }}>
              {campaign.target_persona}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => setShowAddLeads(true)}
              style={{
                padding: '8px 16px', background: 'var(--accent-dim)',
                border: '1px solid var(--accent)', borderRadius: 8,
                color: 'var(--accent-light)', fontSize: 13, fontWeight: 500
              }}
            >
              + Add leads
            </button>
            <button
              onClick={toggleStatus}
              style={{
                padding: '8px 16px',
                background: campaign.status === 'active' ? 'var(--yellow-dim)' : 'var(--green-dim)',
                border: `1px solid ${campaign.status === 'active' ? 'var(--yellow)' : 'var(--green)'}`,
                borderRadius: 8,
                color: campaign.status === 'active' ? 'var(--yellow)' : 'var(--green)',
                fontSize: 13, fontWeight: 500
              }}
            >
              {campaign.status === 'active' ? '⏸ Pause' : '▶ Resume'}
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 24 }}>
          {[
            { label: 'Total leads', value: stats.total },
            { label: 'In progress', value: stats.inProgress },
            { label: 'Replied', value: stats.replied },
            { label: 'Converted', value: stats.converted },
            { label: 'Reply rate', value: stats.replyRate + '%' },
          ].map(s => (
            <div key={s.label}>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{s.label}</div>
            </div>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
            <StatusPill status={campaign.status} />
          </div>
        </div>
      </div>

      {/* Lead list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 28px' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Loading leads...</div>
        ) : leads.length === 0 ? (
          <EmptyLeads onAdd={() => setShowAddLeads(true)} />
        ) : (
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
              {leads.length} lead{leads.length !== 1 ? 's' : ''} · Click a lead to view messages
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {leads.map(lead => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  onClick={() => setSelectedLead(lead)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {showAddLeads && (
        <AddLeadsModal
          campaign={campaign}
          onClose={() => setShowAddLeads(false)}
          onAdded={onLeadsAdded}
        />
      )}

      {selectedLead && (
        <LeadDetail
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onUpdate={(updated) => {
            setLeads(prev => prev.map(l => l.id === updated.id ? updated : l))
            setSelectedLead(updated)
          }}
        />
      )}
    </div>
  )
}

function LeadRow({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', padding: '12px 16px',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, display: 'flex', alignItems: 'center',
        gap: 14, textAlign: 'left', transition: 'border-color 0.15s',
        cursor: 'pointer',
      }}
      onMouseOver={e => (e.currentTarget.style.borderColor = 'var(--border-light)')}
      onMouseOut={e => (e.currentTarget.style.borderColor = 'var(--border)')}
    >
      {/* Avatar */}
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        background: 'var(--accent-dim)', border: '1px solid var(--accent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, fontWeight: 600, color: 'var(--accent-light)',
        flexShrink: 0,
      }}>
        {lead.name.charAt(0).toUpperCase()}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 14, color: 'var(--text)', marginBottom: 2 }}>{lead.name}</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {lead.role}{lead.company ? ` at ${lead.company}` : ''}
        </div>
      </div>

      {/* Status */}
      <StatusPill status={lead.status} />

      {/* Arrow */}
      <span style={{ color: 'var(--text-3)', fontSize: 14 }}>›</span>
    </button>
  )
}

function StatusPill({ status }: { status: string }) {
  const color = STATUS_COLORS[status as keyof typeof STATUS_COLORS] || '#5a5a72'
  const label = STATUS_LABELS[status as keyof typeof STATUS_LABELS] || status
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 20,
      background: color + '22', border: `1px solid ${color}44`,
      color, fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap'
    }}>
      {label}
    </span>
  )
}

function EmptyLeads({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{ padding: '60px 0', textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>👥</div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No leads yet</div>
      <div style={{ color: 'var(--text-3)', marginBottom: 20, maxWidth: 300, margin: '0 auto 20px' }}>
        Add leads manually or paste a LinkedIn search URL and the bot will find profiles automatically.
      </div>
      <button
        onClick={onAdd}
        style={{
          padding: '10px 24px', background: 'var(--accent)',
          border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 500
        }}
      >
        + Add leads
      </button>
    </div>
  )
}
