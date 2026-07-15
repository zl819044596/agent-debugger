-- Migration: 0005_add_oauth_states
-- Google OAuth CSRF state storage

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  redirect_to TEXT NOT NULL DEFAULT '/app',
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at);
