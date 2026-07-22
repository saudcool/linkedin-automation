-- Run this in your Supabase SQL editor to set up the database

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  goal text not null,
  target_persona text not null,
  your_name text not null,
  your_role text not null,
  your_pitch text not null,
  status text default 'active', -- active | paused | completed
  created_at timestamptz default now(),
  leads_count int default 0,
  sent_count int default 0,
  reply_count int default 0
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  name text not null,
  role text,
  company text,
  linkedin_url text,
  about text,
  extra_context text,
  status text default 'pending', -- pending | connection_sent | connected | msg1_sent | msg2_sent | breakup_sent | replied | converted | ignored
  connection_msg text,
  msg1 text,
  msg2 text,
  breakup_msg text,
  reply_text text,
  reply_sentiment text, -- interested | not_interested | question | out_of_office
  created_at timestamptz default now(),
  connection_sent_at timestamptz,
  connected_at timestamptz,
  msg1_sent_at timestamptz,
  msg2_sent_at timestamptz,
  breakup_sent_at timestamptz,
  replied_at timestamptz
);

create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  lead_id uuid references leads(id) on delete cascade,
  action text not null,
  details text,
  created_at timestamptz default now()
);

-- Indexes
create index if not exists leads_campaign_id_idx on leads(campaign_id);
create index if not exists leads_status_idx on leads(status);
create index if not exists activity_log_campaign_idx on activity_log(campaign_id);
