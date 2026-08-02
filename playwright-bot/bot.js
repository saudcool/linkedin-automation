require('dotenv').config({ path: 'C:\\Users\\Saud\\Documents\\GitHub\\inkedin-automation\\.env.local' })
const { chromium } = require('playwright')
const { createClient } = require('@supabase/supabase-js')

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const LINKEDIN_EMAIL = process.env.LINKEDIN_EMAIL
const LINKEDIN_PASSWORD = process.env.LINKEDIN_PASSWORD
const MAX_CONNECTIONS_PER_DAY = 15
const MAX_MESSAGES_PER_DAY = 20
const HEADLESS = process.env.HEADLESS === 'true'

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }
async function humanDelay() { await sleep(rand(2000, 6000)) }
async function leadDelay() { await sleep(rand(20000, 45000)) }
function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`) }

async function updateLead(id, updates) {
  const { error } = await db.from('leads').update(updates).eq('id', id)
  if (error) log(`DB update error: ${error.message}`)
}

async function logActivity(campaignId, leadId, action, details = '') {
  await db.from('activity_log').insert({ campaign_id: campaignId, lead_id: leadId, action, details }).catch(() => {})
}

async function login(page) {
  log('Checking if already logged in...')

  // Check feed first — don't go to login page yet
  try {
    await page.goto('https://www.linkedin.com/feed', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await sleep(2000)
  } catch (e) {
    log('Feed load failed, trying login...')
  }

  const currentUrl = page.url()
  log(`Current URL: ${currentUrl}`)

  if (currentUrl.includes('/feed') || currentUrl.includes('/home')) {
    log('✅ Already logged in!')
    return
  }

  // Need to log in
  log('Not logged in. Logging in now...')
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await sleep(2000)

  await page.fill('#username', LINKEDIN_EMAIL)
  await sleep(1000)
  await page.fill('#password', LINKEDIN_PASSWORD)
  await sleep(1000)
  await page.click('button[type="submit"]')
  await sleep(5000)

  const urlAfter = page.url()
  log(`URL after login attempt: ${urlAfter}`)

  if (urlAfter.includes('checkpoint') || urlAfter.includes('challenge') || urlAfter.includes('verify')) {
    log('⚠️  Security check detected! Please complete it manually in the browser. Waiting up to 2 minutes...')
    await page.waitForURL('**/feed**', { timeout: 120000 })
  }

  if (!page.url().includes('/feed')) {
    throw new Error(`Login failed. Current URL: ${page.url()}`)
  }

  log('✅ Logged in successfully!')
  await humanDelay()
}

async function sendConnectionRequest(page, lead) {
  if (!lead.linkedin_url) {
    log(`⚠️  No LinkedIn URL for ${lead.name}, skipping`)
    return false
  }

  const url = lead.linkedin_url.startsWith('http') ? lead.linkedin_url : `https://${lead.linkedin_url}`
  log(`Visiting: ${lead.name} — ${url}`)

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  } catch (e) {
    log(`Failed to load profile for ${lead.name}: ${e.message}`)
    return false
  }

  await sleep(3000)

  // Check for captcha
  if (await page.$('.captcha-container') || await page.$('[data-test="robot-challenge"]')) {
    log('🛑 Captcha detected! Stopping. Solve it manually and restart.')
    process.exit(1)
  }

  // Try multiple selectors for connect button
  let connectBtn = null
  const connectSelectors = [
    'button[aria-label*="Connect"]',
    'button[aria-label*="connect"]',
    '.pvs-profile-actions button:has-text("Connect")',
    'main button:has-text("Connect")',
  ]

  for (const sel of connectSelectors) {
    try {
      connectBtn = await page.$(sel)
      if (connectBtn) { log(`Found connect button with: ${sel}`); break }
    } catch (e) {}
  }

  // Check More button if connect not visible
  if (!connectBtn) {
    try {
      const moreBtn = await page.$('button[aria-label*="More actions"]') || await page.$('button:has-text("More")')
      if (moreBtn) {
        await moreBtn.click()
        await sleep(1000)
        for (const sel of connectSelectors) {
          try { connectBtn = await page.$(sel); if (connectBtn) break } catch (e) {}
        }
      }
    } catch (e) {}
  }

  if (!connectBtn) {
    const msgBtn = await page.$('button[aria-label*="Message"]').catch(() => null)
    if (msgBtn) {
      log(`Already connected with ${lead.name}`)
      await updateLead(lead.id, { status: 'connected', connected_at: new Date().toISOString() })
      return 'already_connected'
    }
    log(`Could not find Connect button for ${lead.name} — skipping`)
    return false
  }

  await connectBtn.click()
  await sleep(2000)

  // Add a note
  try {
    const addNoteBtn = await page.$('button[aria-label="Add a note"]') || await page.$('button:has-text("Add a note")')
    if (addNoteBtn && lead.connection_msg) {
      await addNoteBtn.click()
      await sleep(1500)
      const textarea = await page.$('textarea[name="message"]') || await page.$('#custom-message') || await page.$('textarea')
      if (textarea) {
        await textarea.click()
        const msg = lead.connection_msg.slice(0, 280)
        for (const char of msg) {
          await textarea.type(char, { delay: rand(30, 80) })
        }
        await sleep(1000)
      }
    }
  } catch (e) {
    log(`Could not add note: ${e.message}`)
  }

  // Send
  try {
    const sendBtn = await page.$('button[aria-label="Send now"]') ||
      await page.$('button[aria-label="Send invitation"]') ||
      await page.$('button:has-text("Send")')
    if (sendBtn) {
      await sendBtn.click()
      await sleep(2000)
      log(`✅ Connection request sent to ${lead.name}`)
      await updateLead(lead.id, { status: 'connection_sent', connection_sent_at: new Date().toISOString() })
      await logActivity(lead.campaign_id, lead.id, 'connection_sent', `Sent to ${lead.name}`)
      return true
    }
  } catch (e) {
    log(`Send button error: ${e.message}`)
  }

  return false
}

async function sendMessage(page, lead, messageText, newStatus, timestampField) {
  if (!lead.linkedin_url) return false

  const url = lead.linkedin_url.startsWith('http') ? lead.linkedin_url : `https://${lead.linkedin_url}`

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  } catch (e) {
    log(`Failed to load profile for ${lead.name}: ${e.message}`)
    return false
  }

  await sleep(3000)

  const msgBtn = await page.$('button[aria-label*="Message"]') || await page.$('button:has-text("Message")').catch(() => null)
  if (!msgBtn) {
    log(`No message button for ${lead.name} — not connected yet?`)
    return false
  }

  await msgBtn.click()
  await sleep(2000)

  const msgBox = await page.$('.msg-form__contenteditable') ||
    await page.$('[contenteditable="true"]') ||
    await page.$('div[role="textbox"]')

  if (!msgBox) {
    log(`No message box found for ${lead.name}`)
    return false
  }

  await msgBox.click()
  for (const char of messageText) {
    await msgBox.type(char, { delay: rand(25, 70) })
  }
  await sleep(1500)

  const sendBtn = await page.$('button[aria-label="Send"]') || await page.$('button.msg-form__send-button')
  if (sendBtn) {
    await sendBtn.click()
    await sleep(2000)
    log(`✅ Message sent to ${lead.name} (${newStatus})`)
    await updateLead(lead.id, { status: newStatus, [timestampField]: new Date().toISOString() })
    await logActivity(lead.campaign_id, lead.id, newStatus, `Message sent to ${lead.name}`)
    return true
  }

  return false
}

async function run() {
  if (!LINKEDIN_EMAIL || !LINKEDIN_PASSWORD) {
    log('❌ LINKEDIN_EMAIL and LINKEDIN_PASSWORD must be set in .env.local')
    process.exit(1)
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    log('❌ NEXT_PUBLIC_SUPABASE_URL not set in .env.local')
    process.exit(1)
  }

  log('🤖 Starting LinkedIn automation bot...')
  log(`   Email: ${LINKEDIN_EMAIL}`)
  log(`   Max connections/day: ${MAX_CONNECTIONS_PER_DAY}`)

  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
    slowMo: 100,
  })

  // Save session to disk so LinkedIn stays logged in between runs
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    storageState: require('fs').existsSync('./playwright-bot/session.json')
      ? './playwright-bot/session.json'
      : undefined,
  })
  const page = await context.newPage()

  // Hide automation flags
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })

  try {
    await login(page)
    await context.storageState({ path: './playwright-bot/session.json' })
    log('💾 Session saved')

    
// DEBUG: Check database connection and leads
    const { data: allLeads, error: dbError } = await db.from('leads').select('*')
    if (dbError) {
      log(`❌ Database error: ${dbError.message}`)
    } 
    else {
      log(`📊 Total leads in database: ${allLeads.length}`)
      allLeads.forEach(l => log(`   - ${l.name} | status: ${l.status} | campaign_id: ${l.campaign_id}`))
    }

const { data: campaigns } = await db.from('campaigns').select('*')
log(`📊 Total campaigns: ${(campaigns || []).length}`)
campaigns?.forEach(c => log(`   - ${c.name} | status: ${c.status}`))
    let connectionsSentToday = 0
    let messagesSentToday = 0
    const now = new Date()

    // Phase 1: Connection requests
    log('\n📤 Phase 1: Sending connection requests...')
    const { data: pendingLeads, error: e1 } = await db
      .from('leads')
      .select('*, campaigns!inner(status)')
      .eq('status', 'pending')
      .eq('campaigns.status', 'active')
      .limit(MAX_CONNECTIONS_PER_DAY)

    if (e1) log(`DB error: ${e1.message}`)
    log(`Found ${(pendingLeads || []).length} pending leads`)

    for (const lead of (pendingLeads || [])) {
      if (connectionsSentToday >= MAX_CONNECTIONS_PER_DAY) { log('Daily limit reached'); break }
      const result = await sendConnectionRequest(page, lead)
      if (result === true) connectionsSentToday++
      await leadDelay()
    }

    // Phase 2: Day 3 messages
    log('\n📤 Phase 2: Day 3 messages...')
    const day3Cutoff = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString()
    const { data: connectedLeads } = await db
      .from('leads')
      .select('*, campaigns!inner(status)')
      .eq('status', 'connected')
      .eq('campaigns.status', 'active')
      .lte('connected_at', day3Cutoff)
      .limit(MAX_MESSAGES_PER_DAY)

    log(`Found ${(connectedLeads || []).length} leads ready for Day 3 message`)
    for (const lead of (connectedLeads || [])) {
      if (messagesSentToday >= MAX_MESSAGES_PER_DAY) break
      if (!lead.msg1) continue
      const ok = await sendMessage(page, lead, lead.msg1, 'msg1_sent', 'msg1_sent_at')
      if (ok) messagesSentToday++
      await leadDelay()
    }

    // Phase 3: Day 7 follow-up
    log('\n📤 Phase 3: Day 7 follow-ups...')
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

    // Phase 4: Day 14 breakup
    log('\n📤 Phase 4: Breakup messages...')
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
