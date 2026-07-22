import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { GOAL_LABELS } from '@/lib/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { lead, campaign } = await req.json()

  const prompt = `You are an expert LinkedIn outreach copywriter. Write a 4-message LinkedIn outreach sequence that feels genuinely personal and references specific details from the lead's profile. Do NOT sound like a template.

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
- Connection request: STRICT max 280 characters, warm personal hook referencing something specific about them, NO pitch, NO "I noticed", NO "I came across your profile"
- Message 1 (Day 3 after connecting): value-first, reference their specific work, no hard sell, 3-4 sentences max
- Message 2 (Day 7): brief follow-up, one soft CTA, 2-3 sentences max
- Breakup message (Day 14): light and human, no guilt-tripping, leaves door open, 1-2 sentences max

Respond ONLY with valid JSON, no markdown, no extra text:
{"connection":"...","msg1":"...","msg2":"...","breakup":"..."}`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = message.content.map((b: any) => b.text || '').join('').trim()
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')
    const parsed = JSON.parse(jsonMatch[0])

    return NextResponse.json({ success: true, messages: parsed })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}
