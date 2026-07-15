-- Migration: 0001_init
-- Agent Debugger: Core schema for traces, steps, and API keys

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  stripe_customer_id TEXT,
  plan TEXT DEFAULT 'free' CHECK(plan IN ('free', 'hobby', 'pro', 'enterprise'))
);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  key_hash TEXT NOT NULL UNIQUE,  -- sha256 of the actual key
  name TEXT NOT NULL DEFAULT 'default',
  created_at TEXT DEFAULT (datetime('now')),
  last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS traces (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  agent_name TEXT NOT NULL DEFAULT 'agent',
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress', 'completed', 'failed', 'error')),
  total_steps INTEGER DEFAULT 0,
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  total_cost REAL DEFAULT 0.0,
  total_latency_ms INTEGER DEFAULT 0,
  framework TEXT DEFAULT 'custom',
  model TEXT,
  tags TEXT,  -- JSON array
  started_at TEXT DEFAULT (datetime('now')),
  ended_at TEXT,
  metadata TEXT,  -- JSON object
  -- for multi-agent
  parent_trace_id TEXT REFERENCES traces(id),
  agent_role TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_traces_project ON traces(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_traces_status ON traces(project_id, status);
CREATE INDEX IF NOT EXISTS idx_traces_parent ON traces(parent_trace_id);

CREATE TABLE IF NOT EXISTS steps (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL REFERENCES traces(id),
  step_index INTEGER NOT NULL,
  step_type TEXT NOT NULL CHECK(step_type IN ('think', 'tool_call', 'tool_result', 'message', 'decision', 'error', 'handoff')),
  -- The actual data (stored in R2 for large payloads, inline for small)
  input TEXT,
  output TEXT,
  thinking TEXT,      -- the agent's reasoning at this step
  tool_name TEXT,
  tool_input TEXT,    -- JSON
  tool_output TEXT,   -- JSON
  -- Metadata
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost REAL DEFAULT 0.0,
  latency_ms INTEGER DEFAULT 0,
  status TEXT DEFAULT 'success' CHECK(status IN ('success', 'error', 'warning')),
  error_message TEXT,
  -- Multi-agent handoff
  handoff_to_agent TEXT,
  handoff_trace_id TEXT,
  -- Timestamps
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(trace_id, step_index)
);

CREATE INDEX IF NOT EXISTS idx_steps_trace ON steps(trace_id, step_index);

-- For replay: store a deterministic hash of the step context
CREATE TABLE IF NOT EXISTS step_checkpoints (
  id TEXT PRIMARY KEY,
  step_id TEXT NOT NULL REFERENCES steps(id),
  context_hash TEXT NOT NULL,  -- sha256 of (input + state)
  snapshot TEXT,               -- JSON state snapshot
  created_at TEXT DEFAULT (datetime('now'))
);

-- For token budget tracking
CREATE TABLE IF NOT EXISTS token_budgets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  monthly_budget REAL,      -- in dollars
  monthly_spent REAL DEFAULT 0.0,
  alert_threshold REAL DEFAULT 0.8,  -- alert at 80%
  reset_day INTEGER DEFAULT 1,       -- day of month to reset
  created_at TEXT DEFAULT (datetime('now'))
);

-- For alerts
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  type TEXT NOT NULL CHECK(type IN ('budget', 'latency', 'error_rate', 'custom')),
  enabled INTEGER DEFAULT 1,
  config TEXT,  -- JSON
  webhook_url TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
