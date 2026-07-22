# LinkedIn Outreach Automation

Fully automated LinkedIn outreach — find leads, generate personalized messages with Claude AI, send automatically via Playwright.

**Cost: ~$5-10/mo (Claude API only)**

---

## How it works

```
You create a campaign → add leads (manual or CSV)
→ Claude auto-writes personalized 4-message sequences per lead
→ Playwright bot logs into LinkedIn and sends everything on a schedule
→ Dashboard shows status, replies, and pipeline
```

---

## Setup (30 minutes)

### 1. Clone and install

```bash
git clone <your-repo>
cd linkedin-automation
npm install
cd playwright-bot && npx playwright install chromium && cd ..
```

### 2. Set up Supabase (free)

1. Go to [supabase.com](https://supabase.com) → New project
2. Go to SQL Editor → paste contents of `lib/schema.sql` → Run
3. Go to Settings → API → copy your URL and keys

### 3. Get Anthropic API key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create an API key

### 4. Configure environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
ANTHROPIC_API_KEY=sk-ant-...
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
LINKEDIN_EMAIL=your@email.com
LINKEDIN_PASSWORD=yourpassword
HEADLESS=false
```

### 5. Run the dashboard

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Running the bot

### Manually (run it now)

```bash
node playwright-bot/bot.js
```

The browser will open. If LinkedIn asks for a security check, solve it manually — the bot will continue automatically after.

### Automatically every day

Add to crontab (runs at 9am weekdays):

```bash
crontab -e
```

Add this line (update the path):

```
0 9 * * 1-5 cd /path/to/linkedin-automation && node playwright-bot/scheduler.js >> bot.log 2>&1
```

### Run headless on a VPS

Set `HEADLESS=true` in `.env.local`, then the bot runs without opening a browser window.

**Cheapest VPS:** Hetzner CX11 — €3.29/mo (~$3.50). Runs the bot 24/7.

---

## Using the dashboard

1. **Create a campaign** — name it, set your goal, describe your target persona, add your details
2. **Add leads** — paste manually or upload CSV with columns: `name, role, company, linkedin_url, about`
3. **Claude auto-generates** personalized connection request + 3 follow-up messages per lead
4. **Run the bot** — it sends everything on LinkedIn automatically
5. **Check the dashboard** — see who's replied, update statuses, copy messages

---

## Bot safety limits

The bot follows these limits to avoid LinkedIn restrictions:

| Action | Daily limit | Delay between actions |
|---|---|---|
| Connection requests | 20/day | 30–90 seconds |
| Messages | 30/day | 30–90 seconds |
| Keystrokes | Random 25–90ms | — |
| Start time | Randomized ±2hrs | — |

**Important:** Run from a real IP address (not a datacenter VPS for the first few weeks). Start with 5–10 connections/day and ramp up slowly.

---

## CSV format

```csv
name,role,company,linkedin_url,about,extra_context
Sarah Chen,VP Engineering,Stripe,linkedin.com/in/sarahchen,"Passionate about scaling teams...","Recently posted about microservices"
John Smith,CTO,Acme Inc,linkedin.com/in/johnsmith,"Building the future of fintech...","Ex-Google engineer"
```

---

## Stack

- **Frontend:** Next.js 14 + TypeScript
- **Database:** Supabase (PostgreSQL)
- **AI:** Anthropic Claude API (claude-sonnet-4-6)
- **Bot:** Playwright (Chromium)
- **Hosting:** Vercel (free tier)

---

## Deploy to Vercel (free)

```bash
npm install -g vercel
vercel
```

Add your environment variables in the Vercel dashboard under Settings → Environment Variables.

Note: The Playwright bot runs locally or on a VPS — not on Vercel (serverless functions can't run a browser).
