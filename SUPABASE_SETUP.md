# Supabase Database Setup

This document describes the database schema and setup required for the AI booking agent to work with Supabase.

## Environment Variables Required

Add these to your `.env` file:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Database Schema

Run these SQL commands in your Supabase SQL editor:

```sql
-- Enable UUIDs
create extension if not exists "pgcrypto";

-- 1. Businesses table
create table public.businesses (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  timezone          text not null default 'UTC',
  default_phone_number text unique,
  created_at        timestamptz not null default now()
);

-- 2. Business phone numbers (mapping Twilio numbers to businesses)
create table public.business_phone_numbers (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses(id) on delete cascade,
  phone_number      text not null unique,  -- E164 format, e.g. +13642048572
  label             text,                   -- 'main line', 'support', etc.
  created_at        timestamptz not null default now()
);

create index business_phone_numbers_phone_number_idx
  on public.business_phone_numbers (phone_number);

-- 3. Business configs (AI behavior settings)
create table public.business_configs (
  business_id       uuid primary key references public.businesses(id) on delete cascade,
  greeting          text,
  working_hours      jsonb,
  min_notice_hours  integer not null default 2,
  notes_for_ai      text,
  openai_model      text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 4. Integrations (per-business API keys/secrets)
create table public.integrations (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid not null references public.businesses(id) on delete cascade,
  twilio_account_sid    text,
  twilio_auth_token     text,
  twilio_phone_number   text,
  google_service_account jsonb,
  google_calendar_id     text,
  openai_api_key        text,
  openai_model          text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index integrations_business_id_idx
  on public.integrations (business_id);

-- 5. Call sessions (one per Twilio call)
create table public.call_sessions (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  call_sid        text not null unique,      -- Twilio CallSid
  from_number     text not null,
  to_number       text not null,
  status          text not null check (status in ('in_progress','completed','failed')),
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  summary         text,
  created_at      timestamptz not null default now()
);

create index call_sessions_business_id_idx
  on public.call_sessions (business_id);

create index call_sessions_started_at_idx
  on public.call_sessions (started_at);

-- 6. Call messages (optional, for full conversation transcripts)
create table public.call_messages (
  id              uuid primary key default gen_random_uuid(),
  call_session_id uuid not null references public.call_sessions(id) on delete cascade,
  role            text not null check (role in ('user','assistant','system')),
  content         text not null,
  created_at      timestamptz not null default now()
);

create index call_messages_session_id_created_at_idx
  on public.call_messages (call_session_id, created_at);

-- 7. Bookings (appointments)
create table public.bookings (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null references public.businesses(id) on delete cascade,
  call_session_id     uuid references public.call_sessions(id) on delete set null,
  customer_name       text not null,
  customer_phone      text,
  start_time          timestamptz not null,
  end_time            timestamptz not null,
  external_calendar_id text,                 -- e.g. Google Calendar event ID (future)
  created_at          timestamptz not null default now()
);

create index bookings_business_id_start_time_idx
  on public.bookings (business_id, start_time);
```

## Initial Data Setup

After creating the schema, you need to:

1. **Create a business record:**
```sql
insert into public.businesses (name, timezone, default_phone_number)
values ('Your Business Name', 'America/New_York', '+13642048572');
```

2. **Map the Twilio phone number to the business:**
```sql
insert into public.business_phone_numbers (business_id, phone_number, label)
select id, '+13642048572', 'main line'
from public.businesses
where name = 'Your Business Name';
```

3. **Create business config (optional, will use defaults if not set):**
```sql
insert into public.business_configs (business_id, min_notice_hours, greeting)
select id, 2, 'Hi! Thanks for calling Your Business Name. How can I help you?'
from public.businesses
where name = 'Your Business Name';
```

## How It Works

1. **Call comes in** → Twilio sends webhook with `To` phone number
2. **Resolve business** → Look up `business_phone_numbers` by `phone_number = To`
3. **Load config** → Fetch `businesses` + `business_configs` + `integrations` for that `business_id`
4. **AI conversation** → Use business-specific config to build system prompt
5. **Booking** → Check `bookings` table for conflicts, insert new booking if available
6. **Logging** → Create/update `call_sessions` row throughout the call

## Security Notes

- The service uses **service role key** (full DB access) - never expose this to frontend
- All queries are scoped by `business_id` - never query without filtering
- Secrets in `integrations` table should be encrypted at rest (future enhancement)

