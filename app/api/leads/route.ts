import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'

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
  const { lead, campaign, messages } = await req.json()

  const { data, error } = await db.from('leads').insert({
    ...lead,
    campaign_id: campaign.id,
    connection_msg: messages.connection || '',
    msg1: messages.msg1 || '',
    msg2: messages.msg2 || '',
    breakup_msg: messages.breakup || '',
    status: 'pending',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await db.from('campaigns')
    .update({ leads_count: db.rpc('increment', { x: 1 }) })
    .eq('id', campaign.id)

  return NextResponse.json({ success: true, lead: data })
}

export async function PATCH(req: NextRequest) {
  const db = getServiceClient()
  const { id, ...updates } = await req.json()
  const { data, error } = await db.from('leads').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
