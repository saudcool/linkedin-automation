/**
 * LinkedIn Automation Bot
 * Run with: node playwright-bot/bot.js
 *
 * This bot:
 * 1. Reads pending leads from Supabase
 * 2. Logs into LinkedIn via Playwright (real browser, mimics human)
 * 3. Sends connection requests with personalized notes
 * 4. Follows up with messages on Day 3, 7, 14
 * 5. Updates lead status in Supabase after each action
 *
 * Safety limits (LinkedIn flags aggressive automation):
 * - Max 20 connection requests per day
 * - Max 30 messages per day
 * - Random delays between every action (2–8 seconds)
 * - Random delay between leads (30–90 seconds)
 * - Stops if LinkedIn shows a captcha or restriction warning
 */

require('dotenv').config({ path: '../.env.local' })
const { chromium } = require('playwright')
const { createClient } = require('@supabase/supabase-js')

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ─── Config ────────────────────────────────────────────────────────────────
const LINKEDIN_EMAIL = process.env.LINKEDIN_EMAIL
const LINKEDIN_PASSWORD = process.env.LINKEDIN_PASSWORD
const MAX_CONNECTIONS_PER_DAY = 20
const MAX_MESSAGES_PER_DAY = 30
const HEADLESS = process.env.HEADLESS === 'true' // set to true on VPS

// ─── Helpers ───────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }
async function humanDelay() { await sleep(rand(2000, 8000)) }
async function leadDelay() { await sleep(rand(30000, 90000)) }

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`) }

async function updateLead(id, updates) {
  await db.from('leads').update(updates).eq('id', id)
}

async function logActivity(campaignId, leadId, action, details = '') {
  await db.from('activity_log').insert({ campaign_id: campaignId, lead_id: leadId, action, details })
}

// ─── LinkedIn Actions ───────────────────────────────────────────────────────
async function login(page) {
  log('Logging in to LinkedIn...')
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' })
  await humanDelay()

  await page.fill('#username', LINKEDIN_EMAIL)
  await humanDelay()
  await page.fill('#password', LINKEDIN_PASSWORD)
  await humanDelay()
  await page.click('[data-litms-control-urn="login-submit"]')
  await page.waitForURL('**/feed**', { timeout: 15000 }).catch(() => {})

  // Check for security challenge
  if (page.url().includes('checkpoint') || page.url().includes('challenge')) {
    log('⚠️  LinkedIn security challenge detected. Please solve it manually in the browser window, then the bot will continue.')
    await page.waitForURL('**/feed**', { timeout: 120000 })
  }

  log('✅ Logged in successfully')
  await humanDelay()
}

async function sendConnectionRequest(page, lead) {
  if (!lead.linkedin_url) {
    log(`⚠️  No LinkedIn URL for ${lead.name}, skipping`)
    return false
  }

  const url = lead.linkedin_url.startsWith('http') ? lead.linkedin_url : `https://${lead.linkedin_url}`
  log(`Visiting profile: ${lead.name} — ${url}`)

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await humanDelay()

  // Check for captcha
  if (await page.$('.captcha-container') || await page.$('[data-test="robot-challenge"]')) {
    log('🛑 Captcha detected! Stopping bot. Solve it manually and restart.')
    process.exit(1)
  }

  // Find connect button
  const connectBtn = await page.$('button[aria-label*="Connect"]') ||
    await page.$('button:has-text("Connect")')

  if (!connectBtn) {
    // Check if already connected
    const msgBtn = await page.$('button[aria-label*="Message"]')
    if (msgBtn) {
      log(`Already connected with ${lead.name}`)
      await updateLead(lead.id, { status: 'connected', connected_at: new Date().toISOString() })
      return 'already_connected'
    }
    log(`Could not find Connect button for ${lead.name}`)
    return false
  }

  await connectBtn.click()
  await humanDelay()

  // Add a note
  const addNoteBtn = await page.$('button[aria-label="Add a note"]') ||
    await page.$('button:has-text("Add a note")')

  if (addNoteBtn && lead.connection_msg) {
    await addNoteBtn.click()
    await humanDelay()
    const textarea = await page.$('textarea[name="message"]') || await page.$('#custom-message')
    if (textarea) {
      // Type character by character for human-like behavior
      await textarea.click()
      for (const char of lead.connection_msg.slice(0, 280)) {
        await textarea.type(char, { delay: rand(30, 90) })
      }
      await humanDelay()
    }
  }

  // Send
  const sendBtn = await page.$('button[aria-label="Send now"]') ||
    await page.$('button:has-text("Send")')
  if (sendBtn) {
    await sendBtn.click()
    await humanDelay()
    log(`✅ Connection request sent to ${lead.name}`)
    await updateLead(lead.id, { status: 'connection_sent', connection_sent_at: new Date().toISOString() })
    await logActivity(lead.campaign_id, lead.id, 'connection_sent', `Sent connection request to ${lead.name}`)
    return true
  }

  return false
}

async function sendMessage(page, lead, messageText, newStatus, timestampField) {
  if (!lead.linkedin_url) return false

  const url = lead.linkedin_url.startsWith('http') ? lead.linkedin_url : `https://${lead.linkedin_url}`
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await humanDelay()

  const msgBtn = await page.$('button[aria-label*="Message"]') ||
    await page.$('button:has-text("Message")')

  if (!msgBtn) {
    log(`No message button found for ${lead.name} — may not be connected yet`)
    return false
  }

  await msgBtn.click()
  await humanDelay()

  const msgBox = await page.$('.msg-form__contenteditable') ||
    await page.$('[contenteditable="true"]') ||
    await page.$('div[role="textbox"]')

  if (!msgBox) {
    log(`Could not find message input for ${lead.name}`)
    return false
  }

  await msgBox.click()
  for (const char of messageText) {
    await msgBox.type(char, { delay: rand(25, 80) })
  }
  await humanDelay()

  const sendBtn = await page.$('button[aria-label="Send"]') ||
    await page.$('button.msg-form__send-button')
  if (sendBtn) {
    await sendBtn.click()
    await humanDelay()
    log(`✅ Message sent to ${lead.name} (${newStatus})`)
    await updateLead(lead.id, { status: newStatus, [timestampField]: new Date().toISOString() })
    await logActivity(lead.campaign_id, lead.id, newStatus, `Sent message to ${lead.name}`)
    return true
  }

  return false
}

// ─── Main bot loop ─────────────────────────────────────────────────────────
async function run() {
  if (!LINKEDIN_EMAIL || !LINKEDIN_PASSWORD) {
    log('❌ Set LINKEDIN_EMAIL and LINKEDIN_PASSWORD in .env.local')
    process.exit(1)
  }

  log('🤖 Starting LinkedIn automation bot...')

  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  })

  const page = await context.newPage()

  try {
    await login(page)

    let connectionsSentToday = 0
    let messagesSentToday = 0
    const now = new Date()

    // 1. Send connection requests to pending leads
    log('\n📤 Phase 1: Sending connection requests...')
    const { data: pendingLeads } = await db
      .from('leads')
      .select('*, campaigns!inner(status)')
      .eq('status', 'pending')
      .eq('campaigns.status', 'active')
      .limit(MAX_CONNECTIONS_PER_DAY)

    for (const lead of (pendingLeads || [])) {
      if (connectionsSentToday >= MAX_CONNECTIONS_PER_DAY) {
        log(`Daily connection limit reached (${MAX_CONNECTIONS_PER_DAY})`)
        break
      }
      const result = await sendConnectionRequest(page, lead)
      if (result === true) connectionsSentToday++
      await leadDelay()
    }

    // 2. Send Day 3 message to connected leads
    log('\n📤 Phase 2: Sending Day 3 messages...')
    const day3Cutoff = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString()
    const { data: connectedLeads } = await db
      .from('leads')
      .select('*, campaigns!inner(status)')
      .eq('status', 'connected')
      .eq('campaigns.status', 'active')
      .lte('connected_at', day3Cutoff)
      .limit(MAX_MESSAGES_PER_DAY - messagesSentToday)

    for (const lead of (connectedLeads || [])) {
      if (messagesSentToday >= MAX_MESSAGES_PER_DAY) break
      if (!lead.msg1) continue
      const ok = await sendMessage(page, lead, lead.msg1, 'msg1_sent', 'msg1_sent_at')
      if (ok) messagesSentToday++
      await leadDelay()
    }

    // 3. Send Day 7 follow-up
    log('\n📤 Phase 3: Sending Day 7 follow-ups...')
    const day7Cutoff = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: msg1Leads } = await db
      .from('leads')
      .select('*, campaigns!inner(status)')
      .eq('status', 'msg1_sent')
      .eq('campaigns.status', 'active')
      .lte('msg1_sent_at', day7Cutoff)
      .limit(MAX_MESSAGES_PER_DAY - messagesSentToday)

    for (const lead of (msg1Leads || [])) {
      if (messagesSentToday >= MAX_MESSAGES_PER_DAY) break
      if (!lead.msg2) continue
      const ok = await sendMessage(page, lead, lead.msg2, 'msg2_sent', 'msg2_sent_at')
      if (ok) messagesSentToday++
      await leadDelay()
    }

    // 4. Send Day 14 breakup message
    log('\n📤 Phase 4: Sending breakup messages...')
    const day14Cutoff = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString()
    const { data: msg2Leads } = await db
      .from('leads')
      .select('*, campaigns!inner(status)')
      .eq('status', 'msg2_sent')
      .eq('campaigns.status', 'active')
      .lte('msg2_sent_at', day14Cutoff)
      .limit(MAX_MESSAGES_PER_DAY - messagesSentToday)

    for (const lead of (msg2Leads || [])) {
      if (messagesSentToday >= MAX_MESSAGES_PER_DAY) break
      if (!lead.breakup_msg) continue
      const ok = await sendMessage(page, lead, lead.breakup_msg, 'breakup_sent', 'breakup_sent_at')
      if (ok) messagesSentToday++
      await leadDelay()
    }

    log(`\n✅ Bot run complete!`)
    log(`   Connections sent: ${connectionsSentToday}`)
    log(`   Messages sent: ${messagesSentToday}`)

  } catch (err) {
    log(`❌ Bot error: ${err.message}`)
    console.error(err)
  } finally {
    await browser.close()
  }
}

run()
