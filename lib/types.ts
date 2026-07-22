export type CampaignStatus = 'active' | 'paused' | 'completed'
export type LeadStatus =
  | 'pending'
  | 'connection_sent'
  | 'connected'
  | 'msg1_sent'
  | 'msg2_sent'
  | 'breakup_sent'
  | 'replied'
  | 'converted'
  | 'ignored'

export type ReplySentiment = 'interested' | 'not_interested' | 'question' | 'out_of_office'

export interface Campaign {
  id: string
  name: string
  goal: string
  target_persona: string
  your_name: string
  your_role: string
  your_pitch: string
  status: CampaignStatus
  created_at: string
  leads_count: number
  sent_count: number
  reply_count: number
}

export interface Lead {
  id: string
  campaign_id: string
  name: string
  role: string
  company: string
  linkedin_url: string
  about: string
  extra_context: string
  status: LeadStatus
  connection_msg: string
  msg1: string
  msg2: string
  breakup_msg: string
  reply_text: string
  reply_sentiment: ReplySentiment
  created_at: string
  connection_sent_at: string
  connected_at: string
  msg1_sent_at: string
  msg2_sent_at: string
  breakup_sent_at: string
  replied_at: string
}

export interface ActivityLog {
  id: string
  campaign_id: string
  lead_id: string
  action: string
  details: string
  created_at: string
}

export const GOAL_OPTIONS = [
  { value: 'sales', label: 'Sales / Book a demo' },
  { value: 'hiring', label: 'Hiring / Recruiting' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'networking', label: 'Networking' },
  { value: 'investor', label: 'Investor outreach' },
]

export const GOAL_LABELS: Record<string, string> = {
  sales: 'book a sales call or demo',
  hiring: 'recruit them for a role',
  partnership: 'explore a business partnership',
  networking: 'network and build a relationship',
  investor: 'pitch them as a potential investor',
}

export const STATUS_LABELS: Record<LeadStatus, string> = {
  pending: 'Pending',
  connection_sent: 'Connection Sent',
  connected: 'Connected',
  msg1_sent: 'Message 1 Sent',
  msg2_sent: 'Message 2 Sent',
  breakup_sent: 'Breakup Sent',
  replied: 'Replied',
  converted: 'Converted',
  ignored: 'Ignored',
}

export const STATUS_COLORS: Record<LeadStatus, string> = {
  pending: '#5a5a72',
  connection_sent: '#6366f1',
  connected: '#818cf8',
  msg1_sent: '#f59e0b',
  msg2_sent: '#f59e0b',
  breakup_sent: '#9090a8',
  replied: '#10b981',
  converted: '#10b981',
  ignored: '#ef4444',
}
