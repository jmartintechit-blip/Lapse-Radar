create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  thresholds int[] not null default '{30,14,7,1}',
  email_alerts boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  constraint users_email_lowercase check (email = lower(email))
);
create unique index users_email_key on users (email);

-- Only a hash of the session token is stored, so a database leak cannot be replayed.
create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index sessions_user_id_idx on sessions (user_id);
create index sessions_expires_at_idx on sessions (expires_at);

create table items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  kind text not null check (kind in ('tls', 'domain', 'manual')),
  label text not null check (char_length(label) between 1 and 100),
  host text,
  expires_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'ok', 'error')),
  last_error text,
  last_checked_at timestamptz,
  next_check_at timestamptz,
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  -- Target of the composite foreign key from alerts: an alert can never point at another user's item.
  unique (user_id, id),
  unique (user_id, kind, host),
  check ((kind = 'manual') = (host is null)),
  check (kind <> 'manual' or expires_at is not null)
);
create index items_due_idx on items (next_check_at) where kind <> 'manual';
create index items_user_expiry_idx on items (user_id, expires_at);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  item_id uuid not null,
  threshold_days int not null check (threshold_days >= 0),
  expiry_snapshot timestamptz not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  emailed_at timestamptz,
  email_error text,
  foreign key (user_id, item_id) references items (user_id, id) on delete cascade,
  -- One alert per item, threshold and expiry date; renewing the item changes the snapshot and re-arms it.
  unique (item_id, threshold_days, expiry_snapshot)
);
create index alerts_user_created_idx on alerts (user_id, created_at desc);
create index alerts_email_pending_idx on alerts (created_at) where emailed_at is null and email_error is null;

create table rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

create table email_quota (
  day date primary key,
  sent int not null default 0
);
