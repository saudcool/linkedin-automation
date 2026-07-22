/**
 * Bot Scheduler
 * Runs the LinkedIn bot once per day at a random time between 9am–11am
 * to mimic natural human behavior.
 *
 * Run with: node playwright-bot/scheduler.js
 * Or add to crontab: 0 9 * * 1-5 cd /path/to/app && node playwright-bot/scheduler.js
 */

const { execSync } = require('child_process')
const path = require('path')

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`) }

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }

async function main() {
  // Random delay 0–2 hours to avoid predictable patterns
  const delayMs = rand(0, 2 * 60 * 60 * 1000)
  const delayMin = Math.round(delayMs / 60000)
  log(`Waiting ${delayMin} minutes before starting bot run (randomized delay)...`)
  await new Promise(r => setTimeout(r, delayMs))

  log('Starting bot...')
  try {
    execSync(`node ${path.join(__dirname, 'bot.js')}`, { stdio: 'inherit' })
    log('Bot run finished.')
  } catch (e) {
    log(`Bot run failed: ${e.message}`)
  }
}

main()
