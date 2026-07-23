'use client'
import { useState, useEffect } from 'react'
import { Campaign } from '@/lib/types'
import CampaignDetail from '@/components/CampaignDetail'
import NewCampaignModal from '@/components/NewCampaignModal'

export default function Home() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [selected, setSelected] = useState<Campaign | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [loading, setLoading] = useState(true)

  async function loadCampaigns() {
    try {
      const res = await fetch('/api/campaigns')
      const data = await res.json()
      if (Array.isArray(data)) setCampaigns(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadCampaigns() }, [])

  function onCampaignCreated(c: Campaign) {
    setCampaigns(prev => [c, ...prev])
    setSelected(c)
    setShowNew(false)
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <aside style={{
        width: 260,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, color: '#fff'
            }}>L</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>LinkedIn Auto</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Outreach Engine</div>
            </div>
          </div>
        </div>

        {/* New Campaign Button */}
        <div style={{ padding: '12px 12px 8px' }}>
          <button
            onClick={() => setShowNew(true)}
            style={{
              width: '100%', padding: '9px 14px',
              background: 'var(--accent)', border: 'none',
              borderRadius: 8, color: '#fff', fontSize: 13,
              fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8,
              transition: 'opacity 0.15s',
            }}
            onMouseOver={e => (e.currentTarget.style.opacity = '0.85')}
            onMouseOut={e => (e.currentTarget.style.opacity = '1')}
          >
            <span style={{ fontSize: 16 }}>+</span> New Campaign
          </button>
        </div>

        {/* Campaign list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '8px 8px 6px' }}>
            Campaigns
          </div>
          {loading ? (
            <div style={{ padding: '20px 8px', color: 'var(--text-3)', fontSize: 13 }}>Loading...</div>
          ) : campaigns.length === 0 ? (
            <div style={{ padding: '20px 8px', color: 'var(--text-3)', fontSize: 13 }}>No campaigns yet</div>
          ) : (
            campaigns.map(c => (
              <button
                key={c.id}
                onClick={() => setSelected(c)}
                style={{
                  width: '100%', padding: '9px 10px', borderRadius: 7,
                  background: selected?.id === c.id ? 'var(--accent-dim)' : 'transparent',
                  border: selected?.id === c.id ? '1px solid var(--accent)' : '1px solid transparent',
                  color: selected?.id === c.id ? 'var(--accent-light)' : 'var(--text-2)',
                  textAlign: 'left', fontSize: 13, marginBottom: 2,
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ fontWeight: 500, marginBottom: 2, color: selected?.id === c.id ? 'var(--accent-light)' : 'var(--text)' }}>
                  {c.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                  {c.leads_count} leads · {c.reply_count} replies
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-3)' }}>
          Built with Claude API + Playwright
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {selected ? (
          <CampaignDetail
            campaign={selected}
            onUpdate={(updated) => {
              setCampaigns(prev => prev.map(c => c.id === updated.id ? updated : c))
              setSelected(updated)
            }}
          />
        ) : (
          <EmptyState onNew={() => setShowNew(true)} />
        )}
      </main>

      {showNew && (
        <NewCampaignModal
          onClose={() => setShowNew(false)}
          onCreated={onCampaignCreated}
        />
      )}
    </div>
  )
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 40 }}>
      <div style={{
        width: 64, height: 64, borderRadius: 16,
        background: 'var(--accent-dim)', border: '1px solid var(--accent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28
      }}>⚡</div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
          No campaign selected
        </div>
        <div style={{ color: 'var(--text-2)', maxWidth: 340, lineHeight: 1.7 }}>
          Create a campaign, add leads, and the automation engine will write personalized messages and send them on LinkedIn — while you do nothing.
        </div>
      </div>
      <button
        onClick={onNew}
        style={{
          padding: '10px 24px', background: 'var(--accent)',
          border: 'none', borderRadius: 8, color: '#fff',
          fontSize: 14, fontWeight: 500
        }}
      >
        Create your first campaign →
      </button>
    </div>
  )
}
