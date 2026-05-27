CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  tutorial_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash);

CREATE TABLE IF NOT EXISTS cards (
  card_id TEXT PRIMARY KEY,
  side TEXT NOT NULL DEFAULT 'neutral',
  rarity TEXT NOT NULL DEFAULT 'common',
  enabled BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS user_cards (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL REFERENCES cards(card_id) ON DELETE CASCADE,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, card_id)
);

CREATE TABLE IF NOT EXISTS decks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  side TEXT NOT NULL DEFAULT 'human',
  slot_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deck_cards (
  deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL REFERENCES cards(card_id) ON DELETE CASCADE,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (deck_id, card_id)
);

CREATE TABLE IF NOT EXISTS pack_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pack_type TEXT NOT NULL DEFAULT 'test',
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pack_results (
  pack_log_id INTEGER NOT NULL REFERENCES pack_logs(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL REFERENCES cards(card_id) ON DELETE CASCADE,
  amount INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS rank_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL DEFAULT 1000,
  rank_points INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS match_logs (
  id SERIAL PRIMARY KEY,
  player1_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  player2_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  winner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  loser_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  result TEXT NOT NULL DEFAULT 'unknown',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO cards (card_id, side, rarity, enabled) VALUES
('test_human_001', 'human', 'common', TRUE),
('test_human_002', 'human', 'common', TRUE),
('test_god_001', 'god', 'common', TRUE),
('test_neutral_001', 'neutral', 'common', TRUE)
ON CONFLICT (card_id) DO NOTHING;
