-- Migration 0006: Create nodes and edges tables for multi-agent topology
CREATE TABLE IF NOT EXISTS nodes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id    TEXT    NOT NULL UNIQUE,
    name        TEXT    NOT NULL,
    type        TEXT    NOT NULL,
    project_id  TEXT    NOT NULL,
    metadata    TEXT    DEFAULT '{}',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS edges (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    source_agent_id   TEXT    NOT NULL,
    target_agent_id   TEXT    NOT NULL,
    relation_type     TEXT    NOT NULL,
    project_id        TEXT    NOT NULL,
    metadata          TEXT    DEFAULT '{}',
    created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_nodes_agent_id ON nodes (agent_id);
CREATE INDEX IF NOT EXISTS idx_nodes_project_id ON nodes (project_id);
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges (source_agent_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges (target_agent_id);
CREATE INDEX IF NOT EXISTS idx_edges_project_id ON edges (project_id);
CREATE INDEX IF NOT EXISTS idx_edges_relation_type ON edges (relation_type);
CREATE INDEX IF NOT EXISTS idx_edges_source_target ON edges (source_agent_id, target_agent_id);
