-- Migration: 0004_add_password_hash
-- Add password_hash column to users table for auth

ALTER TABLE users ADD COLUMN password_hash TEXT;
