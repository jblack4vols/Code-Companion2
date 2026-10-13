-- ============================================================
-- Tristar PT — Provider Productivity Schema
-- Run in Supabase SQL Editor → project tkgygnninsbzzwlobtff
-- ============================================================

-- Weekly performance snapshot per provider.
-- One row per provider per week. Populated from Prompt EMR exports.
create table if not exists provider_weekly_stats (
  id                uuid primary key default gen_random_uuid(),
  provider_name     text not null,
  provider_role     text not null check (provider_role in ('PT','PTA','OT','OTA')),
  location          text not null,
  week_start        date not null,            -- Monday of the reporting week
  days_worked       integer not null default 5,
  total_visits      integer not null default 0,
  visits_per_day    numeric(5,2) not null default 0,
  total_units       integer not null default 0,
  units_per_visit   numeric(4,2) not null default 0,
  visits_per_case   numeric(4,1),             -- avg episode length this week
  weekly_revenue    numeric(10,2),            -- visits * RPV
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (provider_name, location, week_start)
);

-- CPT utilization breakdown per provider per week.
-- One row per CPT code per provider per week.
create table if not exists provider_cpt_utilization (
  id                uuid primary key default gen_random_uuid(),
  provider_name     text not null,
  location          text not null,
  week_start        date not null,
  cpt_code          text not null,
  unit_count        integer not null default 0,
  pct_of_total      numeric(5,2) not null default 0,   -- % of this provider's total units
  location_peer_pct numeric(5,2),                       -- avg % for same location/role
  created_at        timestamptz not null default now(),
  unique (provider_name, location, week_start, cpt_code)
);

-- Triggers
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger provider_weekly_stats_updated_at
  before update on provider_weekly_stats
  for each row execute function set_updated_at();

-- Indexes
create index if not exists idx_pws_week_start   on provider_weekly_stats(week_start desc);
create index if not exists idx_pws_location     on provider_weekly_stats(location);
create index if not exists idx_pws_provider     on provider_weekly_stats(provider_name);
create index if not exists idx_pcu_provider_wk  on provider_cpt_utilization(provider_name, week_start);

-- RLS
alter table provider_weekly_stats     enable row level security;
alter table provider_cpt_utilization  enable row level security;

create policy "Auth read provider_weekly_stats"
  on provider_weekly_stats for select using (auth.role() = 'authenticated');
create policy "Auth insert provider_weekly_stats"
  on provider_weekly_stats for insert with check (auth.role() = 'authenticated');
create policy "Auth update provider_weekly_stats"
  on provider_weekly_stats for update using (auth.role() = 'authenticated');

create policy "Auth read provider_cpt_utilization"
  on provider_cpt_utilization for select using (auth.role() = 'authenticated');
create policy "Auth insert provider_cpt_utilization"
  on provider_cpt_utilization for insert with check (auth.role() = 'authenticated');
create policy "Auth update provider_cpt_utilization"
  on provider_cpt_utilization for update using (auth.role() = 'authenticated');

-- ============================================================
-- Seed — 4 weeks of data for all 22 providers
-- Weeks: 2026-03-24, 2026-03-31, 2026-04-07, 2026-04-14
-- ============================================================
insert into provider_weekly_stats
  (provider_name, provider_role, location, week_start, days_worked,
   total_visits, visits_per_day, total_units, units_per_visit, visits_per_case, weekly_revenue)
values
-- Morristown
  ('Sarah Mitchell','PT','Morristown','2026-03-24',5,54,10.8,233,4.2,10.2, 5130),
  ('Sarah Mitchell','PT','Morristown','2026-03-31',5,55,11.0,237,4.3,10.2, 5225),
  ('Sarah Mitchell','PT','Morristown','2026-04-07',5,57,11.4,234,4.1,10.2, 5415),
  ('Sarah Mitchell','PT','Morristown','2026-04-14',5,56,11.2,241,4.3,10.2, 5320),
  ('Derek Owens','PT','Morristown','2026-03-24',5,51,10.2,199,3.9,9.8,4845),
  ('Derek Owens','PT','Morristown','2026-03-31',5,53,10.5,212,4.0,9.8,5035),
  ('Derek Owens','PT','Morristown','2026-04-07',5,54,10.8,221,4.1,9.8,5130),
  ('Derek Owens','PT','Morristown','2026-04-14',5,54,10.8,221,4.1,9.8,5130),
  ('Brittany Cole','PTA','Morristown','2026-03-24',5,49,9.8,186,3.8,8.4,4655),
  ('Brittany Cole','PTA','Morristown','2026-03-31',4,38,9.5,141,3.7,8.4,3610),
  ('Brittany Cole','PTA','Morristown','2026-04-07',5,46,9.2,175,3.8,8.4,4370),
  ('Brittany Cole','PTA','Morristown','2026-04-14',4,37,9.2,137,3.7,8.4,3515),
  ('Owen Garrett','PT','Morristown','2026-03-24',5,46,9.2,161,3.5,7.1,4370),
  ('Owen Garrett','PT','Morristown','2026-03-31',5,42,8.4,139,3.3,7.1,3990),
  ('Owen Garrett','PT','Morristown','2026-04-07',5,38,7.6,118,3.1,7.1,3610),
  ('Owen Garrett','PT','Morristown','2026-04-14',3,20,6.8,60,3.0,7.1,1900),
-- Maryville
  ('Amanda Torres','OT','Maryville','2026-03-24',5,51,10.2,204,4.0,9.6,4845),
  ('Amanda Torres','OT','Maryville','2026-03-31',5,52,10.4,218,4.2,9.6,4940),
  ('Amanda Torres','OT','Maryville','2026-04-07',5,53,10.5,217,4.1,9.6,5035),
  ('Amanda Torres','OT','Maryville','2026-04-14',5,53,10.5,223,4.2,9.6,5035),
  ('Chris Lawson','PT','Maryville','2026-03-24',5,50,10.0,190,3.8,9.4,4750),
  ('Chris Lawson','PT','Maryville','2026-03-31',5,50,10.0,195,3.9,9.4,4750),
  ('Chris Lawson','PT','Maryville','2026-04-07',5,51,10.2,204,4.0,9.4,4845),
  ('Chris Lawson','PT','Maryville','2026-04-14',5,51,10.1,204,4.0,9.4,4845),
  ('Dustin Shaw','PT','Maryville','2026-03-24',5,45,9.0,162,3.6,7.8,4275),
  ('Dustin Shaw','PT','Maryville','2026-03-31',5,43,8.6,151,3.5,7.8,4085),
  ('Dustin Shaw','PT','Maryville','2026-04-07',5,42,8.4,143,3.4,7.8,3990),
  ('Dustin Shaw','PT','Maryville','2026-04-14',5,41,8.2,140,3.4,7.8,3895),
-- Jefferson City
  ('Lindsey Park','PTA','Jefferson City','2026-03-24',5,48,9.6,187,3.9,8.9,4560),
  ('Lindsey Park','PTA','Jefferson City','2026-03-31',5,49,9.7,191,3.9,8.9,4655),
  ('Lindsey Park','PTA','Jefferson City','2026-04-07',5,50,9.9,200,4.0,8.9,4750),
  ('Lindsey Park','PTA','Jefferson City','2026-04-14',5,49,9.8,196,4.0,8.9,4655),
  ('Tyler Ross','PT','Jefferson City','2026-03-24',5,46,9.2,184,4.0,9.1,4370),
  ('Tyler Ross','PT','Jefferson City','2026-03-31',5,47,9.3,188,4.0,9.1,4465),
  ('Tyler Ross','PT','Jefferson City','2026-04-07',5,47,9.4,193,4.1,9.1,4465),
  ('Tyler Ross','PT','Jefferson City','2026-04-14',5,47,9.4,193,4.1,9.1,4465),
  ('Leah Stanton','PT','Jefferson City','2026-03-24',5,39,7.8,129,3.3,6.2,3705),
  ('Leah Stanton','PT','Jefferson City','2026-03-31',5,36,7.2,112,3.1,6.2,3420),
  ('Leah Stanton','PT','Jefferson City','2026-04-07',5,34,6.8,102,3.0,6.2,3230),
  ('Leah Stanton','PT','Jefferson City','2026-04-14',5,32,6.4,93,2.9,6.2,3040),
-- Newport
  ('Marcus Webb','PT','Newport','2026-03-24',5,47,9.4,179,3.8,8.8,4465),
  ('Marcus Webb','PT','Newport','2026-03-31',5,48,9.5,182,3.8,8.8,4560),
  ('Marcus Webb','PT','Newport','2026-04-07',5,48,9.6,187,3.9,8.8,4560),
  ('Marcus Webb','PT','Newport','2026-04-14',5,48,9.6,187,3.9,8.8,4560),
  ('Cassie Monroe','PT','Newport','2026-03-24',5,42,8.4,155,3.7,7.9,3990),
  ('Cassie Monroe','PT','Newport','2026-03-31',5,41,8.2,152,3.7,7.9,3895),
  ('Cassie Monroe','PT','Newport','2026-04-07',5,41,8.1,148,3.6,7.9,3895),
  ('Cassie Monroe','PT','Newport','2026-04-14',5,40,8.0,144,3.6,7.9,3800),
-- Rogersville
  ('Kelly Nguyen','PT','Rogersville','2026-03-24',5,47,9.3,174,3.7,8.6,4465),
  ('Kelly Nguyen','PT','Rogersville','2026-03-31',5,47,9.4,179,3.8,8.6,4465),
  ('Kelly Nguyen','PT','Rogersville','2026-04-07',5,48,9.5,182,3.8,8.6,4560),
  ('Kelly Nguyen','PT','Rogersville','2026-04-14',5,48,9.5,182,3.8,8.6,4560),
  ('Paige Simmons','OT','Rogersville','2026-03-24',5,41,8.2,148,3.6,7.4,3895),
  ('Paige Simmons','OT','Rogersville','2026-03-31',4,32,7.9,115,3.6,7.4,3040),
  ('Paige Simmons','OT','Rogersville','2026-04-07',5,39,7.8,137,3.5,7.4,3705),
  ('Paige Simmons','OT','Rogersville','2026-04-14',4,30,7.6,105,3.5,7.4,2850),
-- New Tazewell
  ('James Porter','PT','New Tazewell','2026-03-24',5,45,9.0,171,3.8,8.5,4275),
  ('James Porter','PT','New Tazewell','2026-03-31',5,45,9.0,176,3.9,8.5,4275),
  ('James Porter','PT','New Tazewell','2026-04-07',5,45,9.0,176,3.9,8.5,4275),
  ('James Porter','PT','New Tazewell','2026-04-14',5,45,9.0,176,3.9,8.5,4275),
  ('Evan Burke','PT','New Tazewell','2026-03-24',5,42,8.4,147,3.5,7.2,3990),
  ('Evan Burke','PT','New Tazewell','2026-03-31',5,41,8.2,140,3.4,7.2,3895),
  ('Evan Burke','PT','New Tazewell','2026-04-07',5,40,8.0,136,3.4,7.2,3800),
  ('Evan Burke','PT','New Tazewell','2026-04-14',5,39,7.8,129,3.3,7.2,3705),
-- Bean Station
  ('Megan Howell','PTA','Bean Station','2026-03-24',5,43,8.6,159,3.7,7.9,4085),
  ('Megan Howell','PTA','Bean Station','2026-03-31',5,43,8.5,163,3.8,7.9,4085),
  ('Megan Howell','PTA','Bean Station','2026-04-07',5,42,8.4,160,3.8,7.9,3990),
  ('Megan Howell','PTA','Bean Station','2026-04-14',5,42,8.4,160,3.8,7.9,3990),
  ('Ian Fletcher','PT','Bean Station','2026-03-24',5,40,8.0,136,3.4,7.1,3800),
  ('Ian Fletcher','PT','Bean Station','2026-03-31',5,39,7.7,129,3.3,7.1,3705),
  ('Ian Fletcher','PT','Bean Station','2026-04-07',5,38,7.5,125,3.3,7.1,3610),
  ('Ian Fletcher','PT','Bean Station','2026-04-14',5,37,7.4,118,3.2,7.1,3515),
  ('Cody Barnes','PTA','Bean Station','2026-03-24',5,32,6.4,96,3.0,5.9,3040),
  ('Cody Barnes','PTA','Bean Station','2026-03-31',5,31,6.2,90,2.9,5.9,2945),
  ('Cody Barnes','PTA','Bean Station','2026-04-07',5,30,6.0,84,2.8,5.9,2850),
  ('Cody Barnes','PTA','Bean Station','2026-04-14',5,29,5.8,81,2.8,5.9,2755),
-- Johnson City
  ('Rachel Kim','OT','Johnson City','2026-03-24',5,45,9.0,167,3.7,6.1,4275),
  ('Rachel Kim','OT','Johnson City','2026-03-31',5,45,8.9,167,3.7,6.1,4275),
  ('Rachel Kim','OT','Johnson City','2026-04-07',5,44,8.8,158,3.6,6.1,4180),
  ('Rachel Kim','OT','Johnson City','2026-04-14',5,44,8.8,158,3.6,6.1,4180),
  ('Nathan Cruz','PT','Johnson City','2026-03-24',5,44,8.8,158,3.6,6.3,4180),
  ('Nathan Cruz','PT','Johnson City','2026-03-31',5,44,8.7,154,3.5,6.3,4180),
  ('Nathan Cruz','PT','Johnson City','2026-04-07',5,44,8.7,158,3.6,6.3,4180),
  ('Nathan Cruz','PT','Johnson City','2026-04-14',5,43,8.6,151,3.5,6.3,4085),
  ('Tara Patel','PTA','Johnson City','2026-03-24',5,38,7.6,122,3.2,5.8,3610),
  ('Tara Patel','PTA','Johnson City','2026-03-31',5,37,7.4,117,3.2,5.8,3515),
  ('Tara Patel','PTA','Johnson City','2026-04-07',5,37,7.3,115,3.1,5.8,3515),
  ('Tara Patel','PTA','Johnson City','2026-04-14',5,36,7.2,112,3.1,5.8,3420)
on conflict (provider_name, location, week_start) do update set
  visits_per_day  = excluded.visits_per_day,
  units_per_visit = excluded.units_per_visit,
  visits_per_case = excluded.visits_per_case,
  weekly_revenue  = excluded.weekly_revenue,
  updated_at      = now();

-- ============================================================
-- Seed CPT utilization for most recent week (2026-04-14)
-- ============================================================
insert into provider_cpt_utilization
  (provider_name, location, week_start, cpt_code, unit_count, pct_of_total, location_peer_pct)
values
-- Owen Garrett (flagged — over-indexed on 97110)
  ('Owen Garrett','Morristown','2026-04-14','97110',35,58,35),
  ('Owen Garrett','Morristown','2026-04-14','97530',14,24,24),
  ('Owen Garrett','Morristown','2026-04-14','97012', 4, 7,13),
  ('Owen Garrett','Morristown','2026-04-14','97035', 3, 5,11),
  ('Owen Garrett','Morristown','2026-04-14','97750', 2, 3, 8),
-- Dustin Shaw (flagged)
  ('Dustin Shaw','Maryville','2026-04-14','97110',70,50,35),
  ('Dustin Shaw','Maryville','2026-04-14','97530',36,26,24),
  ('Dustin Shaw','Maryville','2026-04-14','97012',11, 8,13),
  ('Dustin Shaw','Maryville','2026-04-14','97035', 8, 6,11),
  ('Dustin Shaw','Maryville','2026-04-14','97750', 5, 4, 8),
-- Leah Stanton (flagged — worst in practice)
  ('Leah Stanton','Jefferson City','2026-04-14','97110',58,62,35),
  ('Leah Stanton','Jefferson City','2026-04-14','97530',21,22,24),
  ('Leah Stanton','Jefferson City','2026-04-14','97012', 6, 6,13),
  ('Leah Stanton','Jefferson City','2026-04-14','97035', 4, 4,11),
  ('Leah Stanton','Jefferson City','2026-04-14','97750', 1, 1, 8),
-- Cassie Monroe (near-target/flagged)
  ('Cassie Monroe','Newport','2026-04-14','97110',63,44,36),
  ('Cassie Monroe','Newport','2026-04-14','97530',35,24,23),
  ('Cassie Monroe','Newport','2026-04-14','97012',14,10,12),
  ('Cassie Monroe','Newport','2026-04-14','97035',12, 8,10),
  ('Cassie Monroe','Newport','2026-04-14','97750', 7, 5, 7),
-- Evan Burke (flagged)
  ('Evan Burke','New Tazewell','2026-04-14','97110',62,48,36),
  ('Evan Burke','New Tazewell','2026-04-14','97530',31,24,23),
  ('Evan Burke','New Tazewell','2026-04-14','97012',12, 9,12),
  ('Evan Burke','New Tazewell','2026-04-14','97035', 9, 7,10),
  ('Evan Burke','New Tazewell','2026-04-14','97750', 5, 4, 7),
-- Ian Fletcher (flagged)
  ('Ian Fletcher','Bean Station','2026-04-14','97110',61,52,37),
  ('Ian Fletcher','Bean Station','2026-04-14','97530',28,24,22),
  ('Ian Fletcher','Bean Station','2026-04-14','97012', 9, 8,12),
  ('Ian Fletcher','Bean Station','2026-04-14','97035', 6, 5,10),
  ('Ian Fletcher','Bean Station','2026-04-14','97750', 4, 3, 7),
-- Cody Barnes (flagged)
  ('Cody Barnes','Bean Station','2026-04-14','97110',53,65,37),
  ('Cody Barnes','Bean Station','2026-04-14','97530',16,20,22),
  ('Cody Barnes','Bean Station','2026-04-14','97012', 4, 5,12),
  ('Cody Barnes','Bean Station','2026-04-14','97035', 3, 4,10),
  ('Cody Barnes','Bean Station','2026-04-14','97750', 2, 2, 7),
-- Nathan Cruz (flagged)
  ('Nathan Cruz','Johnson City','2026-04-14','97110',70,46,36),
  ('Nathan Cruz','Johnson City','2026-04-14','97530',35,23,23),
  ('Nathan Cruz','Johnson City','2026-04-14','97012',14, 9,12),
  ('Nathan Cruz','Johnson City','2026-04-14','97035',11, 7,10),
  ('Nathan Cruz','Johnson City','2026-04-14','97750', 8, 5, 7),
-- Tara Patel (flagged)
  ('Tara Patel','Johnson City','2026-04-14','97110',62,55,36),
  ('Tara Patel','Johnson City','2026-04-14','97530',25,22,23),
  ('Tara Patel','Johnson City','2026-04-14','97012', 8, 7,12),
  ('Tara Patel','Johnson City','2026-04-14','97035', 6, 5,10),
  ('Tara Patel','Johnson City','2026-04-14','97750', 3, 3, 7),
-- Paige Simmons (flagged)
  ('Paige Simmons','Rogersville','2026-04-14','97530',37,35,28),
  ('Paige Simmons','Rogersville','2026-04-14','97110',29,28,30),
  ('Paige Simmons','Rogersville','2026-04-14','97165',13,12,15),
  ('Paige Simmons','Rogersville','2026-04-14','97012',11,10,13),
  ('Paige Simmons','Rogersville','2026-04-14','97750', 5, 5, 9)
on conflict (provider_name, location, week_start, cpt_code) do update set
  pct_of_total      = excluded.pct_of_total,
  location_peer_pct = excluded.location_peer_pct;
