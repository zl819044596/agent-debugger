-- Migration: 0002_add_project_id_to_api_keys
ALTER TABLE api_keys ADD COLUMN project_id TEXT REFERENCES projects(id);
