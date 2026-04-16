-- ============================================================
-- Tristar PT — RPV Analytics Schema
-- Run in Supabase SQL Editor → project tkgygnninsbzzwlobtff
-- ============================================================

-- Stores one row per location per reporting period (month or YTD snapshot).
-- Populated by your Prompt EMR export pipeline or manual entry.
create table if not exists rpv_by_location (
  id                    uuid primary key default gen_random_uuid(),
  location              text not null,
  period_start          date not null,
  period_end            date not null,
  rpv_actual            numeric(6,2) not null,   -- collected revenue / visits
  rpv_contracted        numeric(6,2),             -- contracted/expected RPV
  visits                integer not null,
  total_collected       numeric(10,2),            -- rpv_actual * visits
  -- Payer mix percentages (must sum to 100)
  payer_bcbs_pct        numeric(5,2) default 0,
  payer_medicare_pct    numeric(5,2) default 0,
  payer_commercial_pct  numeric(5,2) default 0,
  payer_medicaid_pct    numeric(5,2) default 0,
  payer_selfpay_pct     numeric(5,2) default 0,
  payer_wc_pct          numeric(5,2) default 0,
  payer_va_pct          numeric(5,2) default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (location, period_start, period_end)
);

-- Trigger to keep updated_at current
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger rpv_by_location_updated_at
  before update on rpv_by_location
  for each row execute function set_updated_at();

create index if not exists idx_rpv_location      on rpv_by_location(location);
create index if not exists idx_rpv_period_start  on rpv_by_location(period_start desc);

alter table rpv_by_location enable row level security;

create policy "Authenticated users can read rpv_by_location"
  on rpv_by_location for select
  using (auth.role() = 'authenticated');

create policy "Authenticated users can upsert rpv_by_location"
  on rpv_by_location for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can update rpv_by_location"
  on rpv_by_location for update
  using (auth.role() = 'authenticated');

-- ============================================================
-- Seed data — YTD 2026 snapshot for all 8 Tristar locations
-- Reflects real performance patterns: Morristown HQ strongest,
-- Johnson City and Bean Station weakest (high Medicaid mix).
-- ============================================================
insert into rpv_by_location (
  location, period_start, period_end,
  rpv_actual, rpv_contracted, visits,
  payer_bcbs_pct, payer_medicare_pct, payer_commercial_pct,
  payer_medicaid_pct, payer_selfpay_pct, payer_wc_pct, payer_va_pct
) values
  ('Morristown',    '2026-01-01', '2026-03-31', 96.20, 98.50, 3150, 42, 28, 18, 8,  1, 2, 1),
  ('Maryville',     '2026-01-01', '2026-03-31', 95.80, 97.20, 2340, 38, 30, 22, 6,  1, 2, 1),
  ('Jefferson City','2026-01-01', '2026-03-31', 93.40, 96.80, 1860, 35, 26, 24, 11, 1, 2, 1),
  ('Newport',       '2026-01-01', '2026-03-31', 92.10, 95.40, 1530, 32, 24, 20, 18, 2, 3, 1),
  ('Rogersville',   '2026-01-01', '2026-03-31', 91.60, 95.10, 1440, 30, 22, 19, 23, 2, 3, 1),
  ('New Tazewell',  '2026-01-01', '2026-03-31', 89.50, 94.70, 1170, 28, 20, 18, 28, 2, 3, 1),
  ('Bean Station',  '2026-01-01', '2026-03-31', 87.20, 94.20,  960, 24, 18, 16, 36, 2, 3, 1),
  ('Johnson City',  '2026-01-01', '2026-03-31', 85.40, 93.80, 1350, 22, 16, 20, 36, 2, 3, 1)
on conflict (location, period_start, period_end) do update set
  rpv_actual           = excluded.rpv_actual,
  rpv_contracted       = excluded.rpv_contracted,
  visits               = excluded.visits,
  payer_bcbs_pct       = excluded.payer_bcbs_pct,
  payer_medicare_pct   = excluded.payer_medicare_pct,
  payer_commercial_pct = excluded.payer_commercial_pct,
  payer_medicaid_pct   = excluded.payer_medicaid_pct,
  payer_selfpay_pct    = excluded.payer_selfpay_pct,
  payer_wc_pct         = excluded.payer_wc_pct,
  payer_va_pct         = excluded.payer_va_pct,
  updated_at           = now();
