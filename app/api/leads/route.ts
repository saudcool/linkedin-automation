import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'
import { GOAL_LABELS } from '@/lib/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function GET(req: NextRequest) {
  const db = getServiceClient()
  const campaignId = req.nextUrl.searchParams.get('campaign_id')
  let query = db.from('leads').select('*').order('created_at', { ascending: false })
  if (campaignId) query = query.eq('campaign_id', campaignId)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const db = getServiceClient()
  const { leads, campaign } = await req.json()

  const results = []
  for (const lead of leads) {
    // Generate messages with Claude for each lead
    try {
      const prompt = `You are an expert LinkedIn outreach copywriter. Write a 4-message LinkedIn outreach sequence that feels genuinely personal.

LEAD:
Name: ${lead.name}
Role: ${lead.role} at ${lead.company}
About: ${lead.about || 'Not provided'}
Extra context: ${lead.extra_context || 'None'}

SENDER:
Name: ${campaign.your_name}
Role: ${campaign.your_role}
Goal: ${GOAL_LABELS[campaign.goal] || campaign.goal}
Value prop: ${campaign.your_pitch}

Rules:
- Connection request: STRICT max 280 characters, warm personal hook, NO pitch, NO "I noticed"
- Message 1 (Day 3): value-first, no hard sell, 3-4 sentences
- Message 2 (Day 7): brief follow-up, soft CTA, 2-3 sentences
- Breakup (Day 14): light, no guilt, 1-2 sentences

Respond ONLY with valid JSON:
{"connection":"...","msg1":"...","msg2":"...","breakup":"..."}`

      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      })

      const raw = message.content.map((b: any) => b.text || '').join('')
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      const msgs = jsonMatch ? JSON.parse(jsonMatch[0]) : {}

      const { data, error } = await db.from('leads').insert({
        ...lead,
        campaign_id: campaign.id,
        connection_msg: msgs.connection || '',
        msg1: msgs.msg1 || '',
        msg2: msgs.msg2 || '',
        breakup_msg: msgs.breakup || '',
        status: 'pending',
      }).select().single()

      if (!error) results.push(data)
    } catch (e) {
      console.error('Failed to process lead:', lead.name, e)
    }
  }

  // Update leads count on campaign
  await db.from('campaigns')
    .update({ leads_count: leads.length })
    .eq('id', campaign.id)

  return NextResponse.json({ success: true, leads: results })
}

export async function PATCH(req: NextRequest) {
  const db = getServiceClient()
  const { id, ...updates } = await req.json()
  const { data, error } = await db.from('leads').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
