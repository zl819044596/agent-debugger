-- Migration: 0007_add_subscriptions
-- Agent Debugger: Add subscription tracking for Creem payments

ALTER TABLE users ADD COLUMN creem_customer_id TEXT;
ALTER TABLE users ADD COLUMN creem_subscription_id TEXT;
ALTER TABLE users ADD COLUMN subscription_ends_at TEXT;
ALTER TABLE users ADD COLUMN subscription_status TEXT DEFAULT 'none' CHECK(subscription_status IN ('none', 'active', 'past_due', 'cancelled', 'expired'));
