require('dotenv').config({ path: 'C:\\Users\\Saud\\Documents\\GitHub\\inkedin-automation\\.env.local' })
const { chromium } = require('playwright')
const { createClient } = require('@supabase/supabase-js')

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const LINKEDIN_EMAIL = process.env.LINKEDIN_EMAIL
const LINKEDIN_PASSWORD = process.env.LINKEDIN_PASSWORD
const MAX_CONNECTIONS_PER_DAY = 0
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
  try {
    await db.from('activity_log').insert({ campaign_id: campaignId, lead_id: leadId, action, details })
  } catch(e) {}
}

async function login(page) {
  log('Checking if already logged in...')
  await page.goto('https://www.linkedin.com/feed', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await sleep(3000)
  log(`Current URL: ${page.url()}`)

  if (page.url().includes('/feed')) {
    log('✅ Already logged in!')
    return
  }

  log('Not logged in. Going to login page...')
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await sleep(5000)
  log(`Login page URL: ${page.url()}`)

  if (page.url().includes('/feed')) {
    log('✅ Auto-logged in!')
    return
  }

  log('Waiting for login form or auto-redirect...')
  try {
    await Promise.race([
      page.waitForSelector('#username', { timeout: 15000 }),
      page.waitForURL('**/feed**', { timeout: 15000 }),
    ])
  } catch (e) {
    log('Continuing anyway...')
  }

  await sleep(2000)

  if (page.url().includes('/feed')) {
    log('✅ Auto-logged in by LinkedIn!')
    return
  }

  log('Filling in credentials...')
  await page.fill('#username', LINKEDIN_EMAIL)
  await sleep(1000)
  await page.fill('#password', LINKEDIN_PASSWORD)
  await sleep(1000)
  await page.click('button[type="submit"]')
  await sleep(6000)

  if (page.url().includes('checkpoint') || page.url().includes('challenge')) {
    log('⚠️  Security check! Complete it manually. Waiting 2 minutes...')
    await page.waitForURL('**/feed**', { timeout: 120000 })
  }

  log('✅ Logged in successfully!')
  await humanDelay()
}

async function sendConnectionRequest(page, lead) {
  if (!lead.linkedin_url) {
    log(`⚠️  No LinkedIn URL for ${lead.name}, skipping`)
    return false
  }

  const url = lead.linkedin_url.startsWith('http')
    ? lead.linkedin_url
    : `https://${lead.linkedin_url}`

  log(`Visiting: ${lead.name} — ${url}`)

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  } catch (e) {
    log(`Failed to load profile for ${lead.name}: ${e.message}`)
    return false
  }

  await sleep(4000)

  // Debug: find all buttons and their locations
  const pageInfo = await page.evaluate(() => {
    const allBtns = Array.from(document.querySelectorAll('button'))
    return allBtns
      .map(b => ({
        text: b.innerText.trim().replace(/\n/g, ' '),
        label: b.getAttribute('aria-label') || '',
        classes: b.className.substring(0, 80),
        rect: JSON.stringify(b.getBoundingClientRect())
      }))
      .filter(b => b.text.length > 0 || b.label.length > 0)
  })

  log(`All buttons: ${pageInfo.map(b => `"${b.text}" [${b.label}]`).join(' | ')}`)

  // Find Connect button anywhere on page
  const connectInfo = pageInfo.find(
    b => b.text.includes('Connect') || b.label.includes('Connect')
  )

  if (connectInfo) {
    log(`Found Connect button: "${connectInfo.text}" [${connectInfo.label}]`)

    const clicked = await page.evaluate(({ btnText, btnLabel }) => {
      const allBtns = Array.from(document.querySelectorAll('button'))
      const btn = allBtns.find(
        b =>
          b.innerText.trim().replace(/\n/g, ' ') === btnText ||
          (b.getAttribute('aria-label') === btnLabel && btnLabel.length > 0)
      )

      if (btn) {
        btn.click()
        return true
      }

      return false
    }, {
      btnText: connectInfo.text,
      btnLabel: connectInfo.label
    })

    if (clicked) {
      log(`Clicked Connect for ${lead.name}`)
      await sleep(2000)

      const dialogBtns = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'))
        return btns.map(
          b => `"${b.innerText.trim()}" [${b.getAttribute('aria-label') || ''}]`
        )
      })

      log(`Dialog buttons: ${dialogBtns.join(' | ')}`)

      try {
        await page
          .locator('[role="dialog"]')
          .locator('button:has-text("Send without a note")')
          .click()

        log(`✅ Connection request sent to ${lead.name}`)

        await updateLead(lead.id, {
          status: 'connection_sent',
          connection_sent_at: new Date().toISOString()
        })

        await logActivity(
          lead.campaign_id,
          lead.id,
          'connection_sent',
          `Sent to ${lead.name}`
        )

        return true
      } catch (e) {
        try {
          await page
            .locator('[role="dialog"]')
            .locator('button:has-text("Send")')
            .click()

          log(`✅ Connection request sent to ${lead.name}`)

          await updateLead(lead.id, {
            status: 'connection_sent',
            connection_sent_at: new Date().toISOString()
          })

          await logActivity(
            lead.campaign_id,
            lead.id,
            'connection_sent',
            `Sent to ${lead.name}`
          )

          return true
        } catch (e2) {
          log(`Send button not found for ${lead.name}: ${e2.message}`)
        }
      }
    }
  }

  // No Connect button visible — try More button
  log(`No Connect button visible for ${lead.name}, trying More...`)

  const moreClicked = await page.evaluate(() => {
    const allBtns = Array.from(document.querySelectorAll('button'))

    const topBtns = allBtns.filter(b => {
      const rect = b.getBoundingClientRect()
      return rect.top < 600 && rect.top > 0 && b.innerText.trim() === 'More'
    })

    if (topBtns.length > 0) {
      topBtns[0].click()
      return true
    }

    return false
  })

  if (moreClicked) {
    log('Clicked More button, waiting for dropdown...')
    await sleep(2000)

    await page.screenshot({
      path: `./playwright-bot/screenshot-${lead.name}-dropdown.png`
    })

    const dropdownConnect = await page.evaluate(() => {
      const allItems = Array.from(
        document.querySelectorAll(
          '.artdeco-dropdown__content li, .artdeco-dropdown--is-open li, [role="menu"] li, [role="menuitem"]'
        )
      )

      const connectItem = allItems.find(i =>
        i.innerText.includes('Connect')
      )

      if (connectItem) {
        const btn = connectItem.querySelector('button') || connectItem
        btn.click()
        return true
      }

      return false
    })

    if (dropdownConnect) {
      log(`Clicked Connect from More dropdown for ${lead.name}`)
      await sleep(2000)

      try {
        await page
          .locator('[role="dialog"]')
          .locator('button:has-text("Send without a note")')
          .click()

        log(`✅ Connection request sent to ${lead.name}`)

        await updateLead(lead.id, {
          status: 'connection_sent',
          connection_sent_at: new Date().toISOString()
        })

        await logActivity(
          lead.campaign_id,
          lead.id,
          'connection_sent',
          `Sent to ${lead.name}`
        )

        return true
      } catch (e) {
        try {
          await page
            .locator('[role="dialog"]')
            .locator('button:has-text("Send")')
            .click()

          log(`✅ Connection request sent to ${lead.name}`)

          await updateLead(lead.id, {
            status: 'connection_sent',
            connection_sent_at: new Date().toISOString()
          })

          await logActivity(
            lead.campaign_id,
            lead.id,
            'connection_sent',
            `Sent to ${lead.name}`
          )

          return true
        } catch (e2) {
          log(`Send button not found for ${lead.name}: ${e2.message}`)
        }
      }
    } else {
      const isConnected = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'))
        return btns.some(b => b.innerText.includes('Message'))
      })

      if (isConnected) {
        log(`Already connected with ${lead.name}`)

        await updateLead(lead.id, {
          status: 'connected',
          connected_at: new Date().toISOString()
        })

        return 'already_connected'
      }

      log(`Could not find any action button for ${lead.name}`)
      return false
    }
  } else {
    log(`Could not find More button for ${lead.name}`)
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

  const msgClicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'))
    const msgBtn = btns.find(b => 
      b.innerText.trim() === 'Message' ||
      (b.getAttribute('aria-label') || '').includes('Message')
    )
    if (msgBtn) { msgBtn.click(); return true }
    return false
  })

  if (!msgClicked) {
    log(`No message button for ${lead.name}`)
    return false
  }

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

  const sent = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'))
    const sendBtn = btns.find(b => 
      b.getAttribute('aria-label') === 'Send' ||
      b.className.includes('msg-form__send-button')
    )
    if (sendBtn) { sendBtn.click(); return true }
    return false
  })

  if (sent) {
    log(`✅ Message sent to ${lead.name} (${newStatus})`)
    await updateLead(lead.id, { status: newStatus, [timestampField]: new Date().toISOString() })
    await logActivity(lead.campaign_id, lead.id, newStatus, `Message sent to ${lead.name}`)
    return true
  }

  return false
}

async function run() {
  log('🔵 Bot started')
  log(`🔵 Supabase URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`)
  log(`🔵 LinkedIn email: ${LINKEDIN_EMAIL}`)

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
    slowMo: 50,
  })

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    storageState: require('fs').existsSync('./playwright-bot/session.json')
      ? './playwright-bot/session.json'
      : undefined,
  })

  const page = await context.newPage()

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })

  try {
    await login(page)
    await context.storageState({ path: './playwright-bot/session.json' })
    log('💾 Session saved')

    // Debug DB
    const { data: allLeads, error: dbError } = await db.from('leads').select('*')
    if (dbError) {
      log(`❌ Database error: ${dbError.message}`)
    } else {
      log(`📊 Total leads in database: ${allLeads.length}`)
      allLeads.forEach(l => log(`   - ${l.name} | status: ${l.status}`))
    }

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
    
    const day3Cutoff = new Date(now + 1 * 60 * 1000).toISOString()
    const { data: connectedLeads, error: e2} = await db
      .from('leads')
      .select('*, campaigns!inner(status)')
      .eq('status', 'connected')
      .eq('campaigns.status', 'active')
      .lte('connected_at', day3Cutoff)
      .limit(MAX_MESSAGES_PER_DAY)
      
    if (e2) log(`Phase 2 DB error: ${e2.message}`)
    log(`Found ${(connectedLeads|| []).length} msg1 leads`)
    
    
    
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
