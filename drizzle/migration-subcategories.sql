-- Migration: Add subcategories + item fields
-- Run this on Turso after deploying

CREATE TABLE IF NOT EXISTS subcategories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS subcategories_category_idx ON subcategories(category_id);

ALTER TABLE items ADD COLUMN subcategory_id INTEGER;
CREATE INDEX IF NOT EXISTS items_subcategory_idx ON items(subcategory_id);

ALTER TABLE items ADD COLUMN description TEXT;

-- Default scan_enabled to 'true'
INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('scan_enabled', 'true', strftime('%s','now'));
