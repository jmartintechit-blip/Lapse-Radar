-- Email verification: alert emails go only to addresses whose owner proved control of them.
alter table users add column email_verified_at timestamptz;

-- One-time links (verify an address, reset a password, confirm a new address). Only the SHA-256
-- of the token is stored, like sessions, so a database leak cannot be replayed as a link.
create table account_tokens (
  token_hash text primary key,
  user_id uuid not null references users (id) on delete cascade,
  purpose text not null check (purpose in ('verify', 'reset', 'change_email')),
  new_email text check (new_email = lower(new_email)),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check ((purpose = 'change_email') = (new_email is not null))
);
create index account_tokens_user_idx on account_tokens (user_id, purpose);
create index account_tokens_expires_idx on account_tokens (expires_at);
