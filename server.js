"use strict";

const http = require("http");
const { WebSocketServer, WebSocket } = require("ws");
const { Pool } = require("pg");
const packageInfo = require("./package.json");
const { makeCardFromId, getAvailableCardIds, getCardDefinition, getCardRarity, choosePackCardId, NORMAL_CARD_IDS, hasCardDefinition, isDeckBuildableCard, resolveCardId } = require("./cards_database");
const BattleEngine = require("./battle_engine");
const { createAuthService } = require("./auth_service");
const { createAuthRoutes } = require("./auth_routes");
const { createAuthMiddleware } = require("./auth_middleware");
const { chooseFirstPlayer } = require("./battle/coin_flip");
const {
  createAircraftMatchState,
  applyAircraftAction,
  serializeAircraftState,
  validateAircraftState
} = require("./aircraft_battle/aircraft_server_adapter");

const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL || "";

const STARTING_HP = 30;
const REQUIRED_DECK_SIZE = 30;
const STARTING_HAND_SIZE = 3;
const STARTING_MANA = 0;
const TURN_TIME_LIMIT_SECONDS = 45.0;
const MAX_HAND_SIZE = 9;
const PACK_COST = 200;
const PACK_SIZE = 5;
const STARTER_CARD_COUNT = 4;
const INITIAL_GOLD = 1000;
const MATCH_WIN_GOLD = 100;
const MATCH_TIMER_TICK_MS = 250;
const MATCH_RECONNECT_GRACE_MS = Number(process.env.MATCH_RECONNECT_GRACE_MS || 120000);
const QUEUE_ENTRY_TTL_MS = 5 * 60 * 1000;
const MATCH_TYPE_CASUAL = "casual";
const MATCH_TYPE_RANKED = "ranked";
const INITIAL_RATING = 1500;
const MIN_RATING = 1200;
const MAX_RATING = 2000;
const SERVER_COMMIT =
  process.env.RENDER_GIT_COMMIT ||
  process.env.COMMIT_SHA ||
  process.env.GIT_COMMIT ||
  "unknown";

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false
    })
  : null;

let nextClientNumber = 1;
let nextHostNumber = 1;
let nextMatchNumber = 1;

const clients = new Map();
const hosts = new Map();
const queue = [];
const matches = new Map();
const aircraftQueue = [];
const aircraftMatches = new Map();

function makeId(prefix, number) {
  return `${prefix}_${number}_${Date.now()}`;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });
  res.end(JSON.stringify(payload));
}

function safeSend(ws, message) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return false;
  }

  try {
    ws.send(JSON.stringify(message));
    return true;
  } catch (error) {
    console.error("[WS SEND ERROR]", error && error.stack ? error.stack : error);
    return false;
  }
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

function sendError(ws, message) {
  safeSend(ws, {
    type: "error",
    message
  });
}

function sendActionRejected(clientId, message) {
  const client = clients.get(clientId);

  if (!client) {
    return;
  }

  safeSend(client.ws, {
    type: "action_rejected",
    message: String(message || "Action rejected.")
  });
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();

      if (body.length > 1024 * 1024) {
        req.destroy();
      }
    });

    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (_error) {
        resolve(null);
      }
    });

    req.on("error", () => {
      resolve(null);
    });
  });
}

async function dbQuery(text, params = []) {
  if (!pool) {
    throw new Error("DATABASE_URL is not set.");
  }

  return await pool.query(text, params);
}

const authService = createAuthService({ query: dbQuery, initializeUserProgression: ensureUserProgression });
const authMiddleware = createAuthMiddleware({ authService, sendJson });
const authRoutes = createAuthRoutes({ authService, readJsonBody, sendJson });

let deckSchemaReady = false;
let rankedSchemaReady = false;
let progressionSchemaReady = false;

function getCardCatalogEntry(cardId) {
  const card = getCardDefinition(cardId) || {};
  return {
    card_id: cardId,
    name: String(card.name || cardId),
    side: String(card.side || "human"),
    rarity: getCardRarity(cardId),
    type: String(card.type || "spell"),
    cost: Number(card.cost || 0),
    attack: Number(card.attack || 0),
    hp: Number(card.hp || 0),
    traits: Array.isArray(card.traits) ? card.traits : [],
    image_path: String(card.image_path || ""),
    description: String(card.description || "")
  };
}

function parseDeveloperAccounts() {
  const raw = String(process.env.DEV_ACCOUNTS || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch (_error) {
    // Accept username:password pairs as a compact deployment-friendly format.
  }
  return raw.split(",").map((pair) => {
    const separator = pair.indexOf(":");
    if (separator < 0) return null;
    return { username: pair.slice(0, separator).trim(), password: pair.slice(separator + 1) };
  }).filter(Boolean);
}

async function ensureProgressionSchema() {
  if (progressionSchemaReady) return;
  await authService.ensureSchema();
  await ensureRankedSchema();
  await dbQuery("ALTER TABLE cards ALTER COLUMN rarity SET DEFAULT 'silver'");
  await dbQuery("ALTER TABLE match_logs ADD COLUMN IF NOT EXISTS external_match_id TEXT");
  await dbQuery("ALTER TABLE match_logs ADD COLUMN IF NOT EXISTS reward_gold INTEGER NOT NULL DEFAULT 0");
  await dbQuery("CREATE UNIQUE INDEX IF NOT EXISTS idx_match_logs_external_match_id ON match_logs(external_match_id)");
  await dbQuery(
    `UPDATE users
     SET gold = $1, updated_at = NOW()
     WHERE gold = 0
       AND NOT EXISTS (SELECT 1 FROM pack_logs WHERE pack_logs.user_id = users.id)
       AND NOT EXISTS (
         SELECT 1
         FROM match_logs
         WHERE match_logs.player1_id = users.id OR match_logs.player2_id = users.id
       )`,
    [INITIAL_GOLD]
  );
  for (const cardId of getAvailableCardIds()) {
    const card = getCardCatalogEntry(cardId);
    await dbQuery(
      `INSERT INTO cards (card_id, side, rarity, enabled)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (card_id)
       DO UPDATE SET side = EXCLUDED.side, rarity = EXCLUDED.rarity, enabled = TRUE`,
      [card.card_id, card.side, card.rarity]
    );
  }
  progressionSchemaReady = true;
  for (const account of parseDeveloperAccounts()) {
    if (!account || !account.username || !account.password) continue;
    const developer = await authService.seedDeveloperAccount(account);
    await grantAllCardsToDeveloper(developer.id);
  }
}

async function grantAllCardsToDeveloper(userId, db = { query: dbQuery }) {
  for (const cardId of getAvailableCardIds()) {
    await db.query(
      `INSERT INTO user_cards (user_id, card_id, count) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, card_id)
       DO UPDATE SET count = GREATEST(user_cards.count, EXCLUDED.count)`,
      [userId, cardId, STARTER_CARD_COUNT]
    );
  }
}

async function traceStarterSummary(userId) {
  const summaryResult = await dbQuery(
    `SELECT COUNT(*)::INTEGER AS rows_count,
            COALESCE(SUM(count), 0)::INTEGER AS total_owned_count
     FROM user_cards
     WHERE user_id = $1`,
    [userId]
  );
  const normalCountsResult = await dbQuery(
    `SELECT card_id, count
     FROM user_cards
     WHERE user_id = $1 AND card_id = ANY($2::text[])
     ORDER BY card_id`,
    [userId, NORMAL_CARD_IDS]
  );
  const summary = summaryResult.rows[0] || {};
  const normalCounts = Object.fromEntries(
    NORMAL_CARD_IDS.map((cardId) => [cardId, 0])
  );
  for (const row of normalCountsResult.rows) {
    normalCounts[String(row.card_id)] = Number(row.count || 0);
  }
  console.log("[PROGRESSION_TRACE] starter.done", JSON.stringify({
    user_id: userId,
    user_cards_rows_count: Number(summary.rows_count || 0),
    total_owned_count: Number(summary.total_owned_count || 0),
    normal_card_counts: normalCounts
  }));
}

async function ensureUserProgression(userId) {
  await ensureProgressionSchema();
  const userResult = await dbQuery(
    "SELECT is_developer FROM users WHERE id = $1 LIMIT 1",
    [userId]
  );
  if (userResult.rows.length <= 0) return;
  console.log("[PROGRESSION_TRACE] starter.begin", JSON.stringify({
    user_id: userId,
    is_developer: Boolean(userResult.rows[0].is_developer),
    starter_cards: NORMAL_CARD_IDS.map((cardId) => {
      const card = getCardDefinition(cardId);
      return {
        requested_name: cardId,
        card_database_found: Boolean(card),
        resolved_card_id: resolveCardId(cardId),
        display_name: card ? String(card.name || cardId) : ""
      };
    })
  }));
  if (Boolean(userResult.rows[0].is_developer)) {
    await grantAllCardsToDeveloper(userId);
    await traceStarterSummary(userId);
    return;
  }
  for (const cardId of NORMAL_CARD_IDS) {
    const card = getCardDefinition(cardId);
    const cardsTableResult = await dbQuery(
      "SELECT card_id FROM cards WHERE card_id = $1 LIMIT 1",
      [cardId]
    );
    try {
      const upsertResult = await dbQuery(
        `INSERT INTO user_cards (user_id, card_id, count) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, card_id)
         DO UPDATE SET count = GREATEST(user_cards.count, EXCLUDED.count)`,
        [userId, cardId, STARTER_CARD_COUNT]
      );
      console.log("[PROGRESSION_TRACE] starter.card", JSON.stringify({
        user_id: userId,
        requested_name: cardId,
        card_database_found: Boolean(card),
        cards_table_found: cardsTableResult.rows.length > 0,
        resolved_card_id: resolveCardId(cardId),
        inserted_card_id: cardId,
        user_cards_affected_rows: Number(upsertResult.rowCount || 0),
        failed: false
      }));
    } catch (error) {
      console.log("[PROGRESSION_TRACE] starter.card", JSON.stringify({
        user_id: userId,
        requested_name: cardId,
        card_database_found: Boolean(card),
        cards_table_found: cardsTableResult.rows.length > 0,
        resolved_card_id: resolveCardId(cardId),
        inserted_card_id: cardId,
        user_cards_affected_rows: 0,
        failed: true,
        error: String(error && error.message ? error.message : error)
      }));
      throw error;
    }
  }
  await traceStarterSummary(userId);
}

async function ensureDeckSchema() {
  if (deckSchemaReady) {
    return;
  }

  await dbQuery("ALTER TABLE decks ADD COLUMN IF NOT EXISTS slot_index INTEGER NOT NULL DEFAULT 0");
  await dbQuery(`
    WITH ranked AS (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id, side ORDER BY created_at ASC, id ASC) AS new_slot
      FROM decks
      WHERE slot_index <= 0
    )
    UPDATE decks
    SET slot_index = ranked.new_slot
    FROM ranked
    WHERE decks.id = ranked.id
  `);
  deckSchemaReady = true;
}

function getCurrentSeasonId() {
  return new Date().toISOString().slice(0, 7);
}

function rankFromRating(value) {
  const rating = Math.max(MIN_RATING, Math.min(MAX_RATING, Math.round(Number(value) || INITIAL_RATING)));
  if (rating >= 1900) return "Celestial";
  if (rating >= 1800) return "Grandmaster";
  if (rating >= 1700) return "Master";
  if (rating >= 1600) return "Diamond";
  if (rating >= 1500) return "Platinum";
  if (rating >= 1400) return "Gold";
  if (rating >= 1300) return "Silver";
  return "Bronze";
}

function normalizeMatchType(value) {
  const matchType = String(value || MATCH_TYPE_CASUAL).trim().toLowerCase();
  return matchType === MATCH_TYPE_CASUAL || matchType === MATCH_TYPE_RANKED ? matchType : "";
}

function calculateWinRating(currentRating, newWinStreak) {
  const rating = Math.max(MIN_RATING, Math.min(MAX_RATING, Math.round(Number(currentRating) || INITIAL_RATING)));
  const effectiveStreak = Math.max(0, Math.min(12, Number(newWinStreak) || 0));
  const baseGain = 8 + 24 * ((MAX_RATING - rating) / 800);
  const multiplier = effectiveStreak < 3
    ? 1.0
    : 1.0 + 0.35 * (1.0 - Math.exp(-(effectiveStreak - 2) / 3.0));
  return Math.max(MIN_RATING, Math.min(MAX_RATING, Math.round(rating + Math.round(baseGain * multiplier))));
}

function calculateLossRating(currentRating) {
  const rating = Math.max(MIN_RATING, Math.min(MAX_RATING, Math.round(Number(currentRating) || INITIAL_RATING)));
  const baseLoss = 8 + 24 * ((rating - MIN_RATING) / 800);
  return Math.max(MIN_RATING, Math.min(MAX_RATING, Math.round(rating - Math.round(baseLoss))));
}

async function ensureRankedSchema() {
  if (rankedSchemaReady) return;
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS rank_profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL DEFAULT 1500,
      rank_points INTEGER NOT NULL DEFAULT 1500,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      draws INTEGER NOT NULL DEFAULT 0,
      current_rank TEXT NOT NULL DEFAULT 'Platinum',
      win_streak INTEGER NOT NULL DEFAULT 0,
      current_season_id TEXT NOT NULL DEFAULT '',
      highest_rating_this_season INTEGER NOT NULL DEFAULT 1500,
      highest_rank_this_season TEXT NOT NULL DEFAULT 'Platinum',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS match_logs (
      id SERIAL PRIMARY KEY,
      player1_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      player2_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      winner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      loser_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      result TEXT NOT NULL DEFAULT 'unknown',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await dbQuery("ALTER TABLE rank_profiles ALTER COLUMN rating SET DEFAULT 1500");
  await dbQuery("ALTER TABLE rank_profiles ADD COLUMN IF NOT EXISTS rank_points INTEGER NOT NULL DEFAULT 1500");
  await dbQuery("ALTER TABLE rank_profiles ADD COLUMN IF NOT EXISTS wins INTEGER NOT NULL DEFAULT 0");
  await dbQuery("ALTER TABLE rank_profiles ADD COLUMN IF NOT EXISTS losses INTEGER NOT NULL DEFAULT 0");
  await dbQuery("ALTER TABLE rank_profiles ADD COLUMN IF NOT EXISTS draws INTEGER NOT NULL DEFAULT 0");
  await dbQuery("ALTER TABLE rank_profiles ADD COLUMN IF NOT EXISTS current_rank TEXT NOT NULL DEFAULT 'Platinum'");
  await dbQuery("ALTER TABLE rank_profiles ADD COLUMN IF NOT EXISTS win_streak INTEGER NOT NULL DEFAULT 0");
  await dbQuery("ALTER TABLE rank_profiles ADD COLUMN IF NOT EXISTS current_season_id TEXT NOT NULL DEFAULT ''");
  await dbQuery("ALTER TABLE rank_profiles ADD COLUMN IF NOT EXISTS highest_rating_this_season INTEGER NOT NULL DEFAULT 1500");
  await dbQuery("ALTER TABLE rank_profiles ADD COLUMN IF NOT EXISTS highest_rank_this_season TEXT NOT NULL DEFAULT 'Platinum'");
  await dbQuery("ALTER TABLE rank_profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()");
  await dbQuery("ALTER TABLE rank_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()");
  await dbQuery("ALTER TABLE match_logs ADD COLUMN IF NOT EXISTS match_type TEXT NOT NULL DEFAULT 'casual'");
  await dbQuery("ALTER TABLE match_logs ADD COLUMN IF NOT EXISTS ended_reason TEXT NOT NULL DEFAULT 'normal'");
  await dbQuery("ALTER TABLE match_logs ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()");
  await dbQuery("ALTER TABLE match_logs ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ NOT NULL DEFAULT NOW()");
  await dbQuery("ALTER TABLE match_logs ADD COLUMN IF NOT EXISTS player1_side TEXT");
  await dbQuery("ALTER TABLE match_logs ADD COLUMN IF NOT EXISTS player2_side TEXT");
  await dbQuery("ALTER TABLE match_logs ADD COLUMN IF NOT EXISTS winner_rating_before INTEGER");
  await dbQuery("ALTER TABLE match_logs ADD COLUMN IF NOT EXISTS winner_rating_after INTEGER");
  await dbQuery("ALTER TABLE match_logs ADD COLUMN IF NOT EXISTS loser_rating_before INTEGER");
  await dbQuery("ALTER TABLE match_logs ADD COLUMN IF NOT EXISTS loser_rating_after INTEGER");
  await dbQuery("ALTER TABLE match_logs ADD COLUMN IF NOT EXISTS winner_rank_before TEXT");
  await dbQuery("ALTER TABLE match_logs ADD COLUMN IF NOT EXISTS winner_rank_after TEXT");
  await dbQuery("ALTER TABLE match_logs ADD COLUMN IF NOT EXISTS loser_rank_before TEXT");
  await dbQuery("ALTER TABLE match_logs ADD COLUMN IF NOT EXISTS loser_rank_after TEXT");
  await dbQuery("ALTER TABLE match_logs ADD COLUMN IF NOT EXISTS external_match_id TEXT");
  await dbQuery("ALTER TABLE match_logs ADD COLUMN IF NOT EXISTS reward_gold INTEGER NOT NULL DEFAULT 0");
  await dbQuery("CREATE UNIQUE INDEX IF NOT EXISTS idx_match_logs_external_match_id ON match_logs(external_match_id)");
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS rank_season_history (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      season_id TEXT NOT NULL,
      final_rating INTEGER NOT NULL,
      final_rank TEXT NOT NULL,
      highest_rating INTEGER NOT NULL,
      highest_rank TEXT NOT NULL,
      wins INTEGER NOT NULL,
      losses INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, season_id)
    )
  `);
  await dbQuery("UPDATE rank_profiles SET rating = GREATEST(1200, LEAST(2000, rating))");
  await dbQuery("UPDATE rank_profiles SET rank_points = rating WHERE rank_points IS NULL OR rank_points = 0");
  rankedSchemaReady = true;
}

async function getSeasonProfile(db, userId) {
  const seasonId = getCurrentSeasonId();
  await db.query(
    `INSERT INTO rank_profiles
      (user_id, rating, rank_points, current_rank, current_season_id, highest_rating_this_season, highest_rank_this_season)
     VALUES ($1, $2, $2, $3, $4, $2, $3)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, INITIAL_RATING, rankFromRating(INITIAL_RATING), seasonId]
  );
  let result = await db.query("SELECT * FROM rank_profiles WHERE user_id = $1 LIMIT 1", [userId]);
  let profile = result.rows[0];
  const oldRating = Math.max(MIN_RATING, Math.min(MAX_RATING, Math.round(Number(profile.rating) || INITIAL_RATING)));
  const oldRank = rankFromRating(oldRating);
  const previousSeason = String(profile.current_season_id || "");

  if (previousSeason !== "" && previousSeason !== seasonId) {
    await db.query(
      `INSERT INTO rank_season_history
        (user_id, season_id, final_rating, final_rank, highest_rating, highest_rank, wins, losses)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, season_id) DO NOTHING`,
      [
        userId,
        previousSeason,
        oldRating,
        oldRank,
        Number(profile.highest_rating_this_season || oldRating),
        String(profile.highest_rank_this_season || oldRank),
        Number(profile.wins || 0),
        Number(profile.losses || 0)
      ]
    );
    const resetRating = Math.max(
      MIN_RATING,
      Math.min(MAX_RATING, Math.round(INITIAL_RATING + (oldRating - INITIAL_RATING) * 0.35))
    );
    const resetRank = rankFromRating(resetRating);
    await db.query(
      `UPDATE rank_profiles
       SET rating = $2, rank_points = $2, wins = 0, losses = 0, draws = 0, win_streak = 0,
           current_rank = $3, current_season_id = $4,
           highest_rating_this_season = $2, highest_rank_this_season = $3,
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId, resetRating, resetRank, seasonId]
    );
  } else {
    await db.query(
      `UPDATE rank_profiles
       SET rating = $2, rank_points = $2, current_rank = $3, current_season_id = $4,
           highest_rating_this_season = GREATEST(highest_rating_this_season, $2),
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId, oldRating, oldRank, seasonId]
    );
  }

  result = await db.query(
    `SELECT user_id, rating, rank_points, wins, losses, draws, current_rank, win_streak, current_season_id,
            highest_rating_this_season, highest_rank_this_season, created_at, updated_at
     FROM rank_profiles WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  profile = result.rows[0];
  const played = Number(profile.wins || 0) + Number(profile.losses || 0);
  profile.win_rate = played > 0 ? Number((Number(profile.wins || 0) * 100 / played).toFixed(1)) : 0.0;
  return profile;
}

async function finalizeMatch(match, endedReason) {
  if (!match || match.result_saved) return;
  match.result_saved = true;
  if (!pool) return;

  const reason = ["normal", "surrender", "disconnect", "server_error"].includes(endedReason)
    ? endedReason
    : "server_error";
  const state = match.state || {};
  const winnerSeat = String(state.winner_seat || "");
  const loserSeat = String(state.loser_seat || "");
  const winnerUserId = match.seats[winnerSeat] ? Number(match.seats[winnerSeat].user_id || 0) : null;
  const loserUserId = match.seats[loserSeat] ? Number(match.seats[loserSeat].user_id || 0) : null;
  const validWinner = winnerUserId && loserUserId && winnerUserId !== loserUserId;
  const applyRankedResult = match.match_type === MATCH_TYPE_RANKED && reason !== "server_error" && validWinner;
  const db = await pool.connect();

  try {
    await db.query("BEGIN");
    let winnerBefore = null;
    let winnerAfter = null;
    let loserBefore = null;
    let loserAfter = null;

    if (applyRankedResult) {
      winnerBefore = await getSeasonProfile(db, winnerUserId);
      loserBefore = await getSeasonProfile(db, loserUserId);
      const newStreak = Number(winnerBefore.win_streak || 0) + 1;
      const winnerRating = calculateWinRating(winnerBefore.rating, newStreak);
      const loserRating = calculateLossRating(loserBefore.rating);
      const winnerRank = rankFromRating(winnerRating);
      const loserRank = rankFromRating(loserRating);
      await db.query(
        `UPDATE rank_profiles
         SET rating = $2, rank_points = $2, wins = wins + 1, win_streak = $3, current_rank = $4,
             highest_rating_this_season = GREATEST(highest_rating_this_season, $2),
             highest_rank_this_season = CASE WHEN highest_rating_this_season <= $2 THEN $4 ELSE highest_rank_this_season END,
             updated_at = NOW()
         WHERE user_id = $1`,
        [winnerUserId, winnerRating, newStreak, winnerRank]
      );
      await db.query(
        `UPDATE rank_profiles
         SET rating = $2, rank_points = $2, losses = losses + 1, win_streak = 0, current_rank = $3,
             updated_at = NOW()
         WHERE user_id = $1`,
        [loserUserId, loserRating, loserRank]
      );
      winnerAfter = { rating: winnerRating, current_rank: winnerRank };
      loserAfter = { rating: loserRating, current_rank: loserRank };
    }

    const logResult = await db.query(
      `INSERT INTO match_logs
        (player1_id, player2_id, winner_id, loser_id, result, match_type, ended_reason,
         started_at, ended_at, player1_side, player2_side,
         winner_rating_before, winner_rating_after, loser_rating_before, loser_rating_after,
         winner_rank_before, winner_rank_after, loser_rank_before, loser_rank_after,
         external_match_id, reward_gold)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
       ON CONFLICT (external_match_id) DO NOTHING
       RETURNING id`,
      [
        Number(match.seats.A.user_id || 0) || null,
        Number(match.seats.B.user_id || 0) || null,
        validWinner ? winnerUserId : null,
        validWinner ? loserUserId : null,
        validWinner ? "win" : "draw",
        match.match_type,
        reason,
        new Date(Number(match.created_at || Date.now())),
        match.seats.A.side,
        match.seats.B.side,
        winnerBefore ? Number(winnerBefore.rating) : null,
        winnerAfter ? winnerAfter.rating : null,
        loserBefore ? Number(loserBefore.rating) : null,
        loserAfter ? loserAfter.rating : null,
        winnerBefore ? String(winnerBefore.current_rank) : null,
        winnerAfter ? winnerAfter.current_rank : null,
        loserBefore ? String(loserBefore.current_rank) : null,
        loserAfter ? loserAfter.current_rank : null,
        String(match.match_id || ""),
        validWinner && reason !== "server_error" ? MATCH_WIN_GOLD : 0
      ]
    );
    let awardedGold = 0;
    if (logResult.rows.length > 0 && validWinner && reason !== "server_error") {
      await db.query("UPDATE users SET gold = gold + $2, updated_at = NOW() WHERE id = $1", [winnerUserId, MATCH_WIN_GOLD]);
      awardedGold = MATCH_WIN_GOLD;
    }
    const userIds = [...new Set([winnerUserId, loserUserId].filter(Boolean))];
    const progressionResult = userIds.length > 0
      ? await db.query(
          "SELECT id, gold, role, is_developer, account_type FROM users WHERE id = ANY($1::int[])",
          [userIds]
        )
      : { rows: [] };
    await db.query("COMMIT");
    sendBattleProgressionUpdates(match, progressionResult.rows, winnerUserId, awardedGold);
  } catch (error) {
    match.result_saved = false;
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}

function sendBattleProgressionUpdates(match, progressionRows, winnerUserId, awardedGold) {
  const progressionByUserId = new Map(
    progressionRows.map((row) => [Number(row.id), row])
  );

  for (const seatId of ["A", "B"]) {
    const seat = match && match.seats ? match.seats[seatId] : null;
    const client = seat ? clients.get(seat.client_id) : null;
    const userId = seat ? Number(seat.user_id || 0) : 0;
    const progression = progressionByUserId.get(userId);

    if (!client || !progression) {
      continue;
    }

    safeSend(client.ws, {
      type: "battle_result",
      match_id: String(match.match_id || ""),
      result_for_client: Number(winnerUserId || 0) === userId ? "win" : winnerUserId ? "lose" : "draw",
      reward_gold: Number(winnerUserId || 0) === userId ? awardedGold : 0,
      gold: Number(progression.gold || 0),
      role: String(progression.role || "normal"),
      is_developer: Boolean(progression.is_developer),
      account_type: String(progression.account_type || progression.role || "normal")
    });
  }
}

async function requireUser(req, res) {
  const user = await authMiddleware.requireAuth(req, res);
  if (user) await ensureUserProgression(user.id);
  return user;
}

function normalizeSide(value) {
  const side = String(value || "human").trim().toLowerCase();

  if (side === "god") {
    return "god";
  }

  return "human";
}

function countCards(cardIds) {
	const counts = new Map();

	for (const raw of cardIds) {
		const cardId = extractCardId(raw);

		if (!cardId) {
			continue;
		}

		counts.set(cardId, (counts.get(cardId) || 0) + 1);
	}

	return counts;
}

function extractCardId(raw) {
	if (raw && typeof raw === "object") {
		const direct = raw.card_id || raw.cardId || raw.id || "";
		if (direct && hasCardDefinition(direct)) {
			return resolveCardId(direct);
		}

		const nested = raw.card || raw.card_data || null;
		if (nested && typeof nested === "object") {
			const nestedId = extractCardId(nested);
			if (nestedId) {
				return nestedId;
			}
		}

		const name = raw.name || raw.card_name || raw.cardName || "";
		if (name && hasCardDefinition(name)) {
			return resolveCardId(name);
		}

		return String(direct || "").trim();
	}

	const cardId = String(raw || "").trim();
	return hasCardDefinition(cardId) ? resolveCardId(cardId) : cardId;
}

// ============================================================================
// HTTP API
// ============================================================================
async function handleCollection(req, res) {
  const user = await requireUser(req, res);

  if (!user) {
    return;
  }

  await ensureUserProgression(user.id);

  const result = await dbQuery(
    `
    SELECT user_cards.card_id, user_cards.count, cards.side, cards.rarity
    FROM user_cards
    INNER JOIN cards ON cards.card_id = user_cards.card_id
    WHERE user_id = $1
    ORDER BY card_id ASC
    `,
    [user.id]
  );

  const cards = result.rows.map((row) => ({ ...getCardCatalogEntry(row.card_id), count: Number(row.count || 0) }));
  const userResult = await dbQuery("SELECT gold, role, is_developer, account_type FROM users WHERE id = $1", [user.id]);
  const ownedSummaryResult = await dbQuery(
    `SELECT COUNT(*)::INTEGER AS rows_count,
            COALESCE(SUM(count), 0)::INTEGER AS total_owned_count
     FROM user_cards
     WHERE user_id = $1`,
    [user.id]
  );
  const normalCounts = Object.fromEntries(
    NORMAL_CARD_IDS.map((cardId) => [cardId, Number((result.rows.find((row) => row.card_id === cardId) || {}).count || 0)])
  );
  const ownedSummary = ownedSummaryResult.rows[0] || {};
  console.log("[PROGRESSION_TRACE] collection.response", JSON.stringify({
    user_id: user.id,
    db_gold: Number(userResult.rows[0].gold || 0),
    top_level_gold: Number(userResult.rows[0].gold || 0),
    cards_returned_count: cards.length,
    owned_cards_rows_count: Number(ownedSummary.rows_count || 0),
    total_owned_count: Number(ownedSummary.total_owned_count || 0),
    normal_card_counts: normalCounts
  }));
  sendJson(res, 200, { ok: true, cards, ...userResult.rows[0] });
}

async function handleOpenPack(req, res) {
  const user = await requireUser(req, res);

  if (!user) {
    return;
  }

  const body = await readJsonBody(req);

  if (body === null) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON" });
    return;
  }

  const packType = String(body.pack_type || body.packType || "standard");
  const availableCardIds = getAvailableCardIds().filter((cardId) => getCardRarity(cardId) !== "normal");
  if (availableCardIds.length <= 0) {
    sendJson(res, 400, { ok: false, error: "No cards available." });
    return;
  }

  const opened = [];

  for (let i = 0; i < PACK_SIZE; i++) {
    const cardId = choosePackCardId();
    if (!cardId) {
      sendJson(res, 500, { ok: false, error: "Pack rarity pool is empty." });
      return;
    }
    opened.push(cardId);
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const userResult = await client.query("SELECT gold, is_developer FROM users WHERE id = $1 FOR UPDATE", [user.id]);
    const account = userResult.rows[0];
    console.log("[PROGRESSION_TRACE] open_pack.start", JSON.stringify({
      user_id: user.id,
      request_gold: Number(account.gold || 0),
      is_developer: Boolean(account.is_developer),
      insufficient_gold: Number(account.gold || 0) < PACK_COST,
      can_purchase: !Boolean(account.is_developer) && Number(account.gold || 0) >= PACK_COST
    }));
    if (Boolean(account.is_developer)) {
      await client.query("ROLLBACK");
      sendJson(res, 400, { ok: false, error: "Developer accounts already have every card." });
      return;
    }
    if (Number(account.gold || 0) < PACK_COST) {
      await client.query("ROLLBACK");
      sendJson(res, 400, { ok: false, error: "Not enough gold." });
      return;
    }
    await client.query("UPDATE users SET gold = gold - $2, updated_at = NOW() WHERE id = $1", [user.id, PACK_COST]);

    const packLogResult = await client.query(
      "INSERT INTO pack_logs (user_id, pack_type) VALUES ($1, $2) RETURNING id",
      [user.id, packType]
    );

    const packLogId = packLogResult.rows[0].id;
    const openedCounts = countCards(opened);

    for (const [cardId, amount] of openedCounts.entries()) {
      await client.query(
        `
        INSERT INTO user_cards (user_id, card_id, count)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, card_id)
        DO UPDATE SET count = user_cards.count + EXCLUDED.count
        `,
        [user.id, cardId, amount]
      );

      await client.query(
        "INSERT INTO pack_results (pack_log_id, card_id, amount) VALUES ($1, $2, $3)",
        [packLogId, cardId, amount]
      );
    }

    await client.query("COMMIT");

    const cards = opened.map((cardId) => ({
      ...getCardCatalogEntry(cardId),
      amount: 1
    }));
    const updatedCountsResult = await dbQuery("SELECT card_id, count FROM user_cards WHERE user_id = $1 ORDER BY card_id", [user.id]);
    const updatedCounts = updatedCountsResult.rows.map((row) => ({
      card_id: row.card_id,
      count: Number(row.count || 0)
    }));
    const newGoldResult = await dbQuery("SELECT gold FROM users WHERE id = $1", [user.id]);
    const groupedCards = Array.from(openedCounts.entries()).map(([cardId, amount]) => ({
      ...getCardCatalogEntry(cardId),
      count: amount,
      amount
    }));
    console.log("[PROGRESSION_TRACE] open_pack.response", JSON.stringify({
      user_id: user.id,
      response_gold: Number(newGoldResult.rows[0].gold || 0),
      response_new_gold: Number(newGoldResult.rows[0].gold || 0),
      opened_cards_count: cards.length,
      updated_counts_rows_count: updatedCounts.length
    }));

    sendJson(res, 200, {
      ok: true,
      pack_log_id: packLogId,
      cards: groupedCards,
      opened_cards: cards,
      results: groupedCards,
      updated_counts: updatedCounts,
      new_gold: Number(newGoldResult.rows[0].gold || 0),
      gold: Number(newGoldResult.rows[0].gold || 0)
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function handleGetDecks(req, res) {
  const user = await requireUser(req, res);

  if (!user) {
    return;
  }

  await ensureDeckSchema();

  const decksResult = await dbQuery(
    `
    SELECT id, name, side, slot_index, created_at, updated_at
    FROM decks
    WHERE user_id = $1
    ORDER BY side ASC, slot_index ASC, id ASC
    `,
    [user.id]
  );

  const decks = [];

  for (const deck of decksResult.rows) {
    const cardsResult = await dbQuery(
      `
      SELECT card_id, count
      FROM deck_cards
      WHERE deck_id = $1
      ORDER BY card_id ASC
      `,
      [deck.id]
    );

    const cardIds = [];

    for (const row of cardsResult.rows) {
      const amount = Number(row.count || 0);

      for (let i = 0; i < amount; i++) {
        cardIds.push(row.card_id);
      }
    }

    decks.push({
      id: deck.id,
      deck_id: deck.id,
      name: deck.name,
      side: deck.side,
      slot_index: Number(deck.slot_index || 0),
      cards: cardIds,
      card_ids: cardIds,
      card_counts: cardsResult.rows,
      created_at: deck.created_at,
      updated_at: deck.updated_at
    });
  }

  sendJson(res, 200, { ok: true, decks });
}

async function handleSaveDeck(req, res) {
  const user = await requireUser(req, res);

  if (!user) {
    return;
  }

  await ensureDeckSchema();

  const body = await readJsonBody(req);

  if (body === null) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON" });
    return;
  }

  const deckId = Number(body.deck_id || body.id || 0);
  const name = String(body.name || body.deck_name || "New Deck").trim();
  const side = normalizeSide(body.side);
  let slotIndex = Number(body.slot_index || 0);
  const cardSource = Array.isArray(body.cards)
    ? body.cards
    : Array.isArray(body.card_ids)
      ? body.card_ids
      : [];

  const cardIds = cardSource.map((value) => extractCardId(value)).filter(Boolean);

  if (!name) {
    sendJson(res, 400, { ok: false, error: "Deck name is empty." });
    return;
  }

  const unknownCardIds = cardIds.filter((cardId) => !hasCardDefinition(cardId));
  if (unknownCardIds.length > 0) {
    sendJson(res, 400, { ok: false, error: "Unknown card_id: " + unknownCardIds[0] });
    return;
  }

  const unavailableCardIds = cardIds.filter((cardId) => !isDeckBuildableCard(cardId));
  if (unavailableCardIds.length > 0) {
    sendJson(res, 400, { ok: false, error: "Card cannot be added to a deck: " + unavailableCardIds[0] });
    return;
  }

  const wrongSideCardIds = cardIds.filter((cardId) => String((getCardDefinition(cardId) || {}).side || "human") !== side);
  if (wrongSideCardIds.length > 0) {
    sendJson(res, 400, { ok: false, error: "Card side does not match deck side: " + wrongSideCardIds[0] });
    return;
  }

  const cardCounts = countCards(cardIds);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const accountResult = await client.query("SELECT is_developer FROM users WHERE id = $1 FOR UPDATE", [user.id]);
    if (!Boolean(accountResult.rows[0] && accountResult.rows[0].is_developer)) {
      const ownedResult = await client.query("SELECT card_id, count FROM user_cards WHERE user_id = $1", [user.id]);
      const ownedCounts = new Map(ownedResult.rows.map((row) => [String(row.card_id), Number(row.count || 0)]));
      for (const [cardId, amount] of cardCounts.entries()) {
        if (amount > Math.min(4, ownedCounts.get(cardId) || 0)) {
          await client.query("ROLLBACK");
          sendJson(res, 400, { ok: false, error: "Not enough owned copies of card: " + cardId });
          return;
        }
      }
    }

    let finalDeckId = deckId;

    if (slotIndex <= 0) {
      const slotResult = await client.query(
        "SELECT COALESCE(MAX(slot_index), 0) + 1 AS next_slot FROM decks WHERE user_id = $1 AND side = $2",
        [user.id, side]
      );
      slotIndex = Number(slotResult.rows[0].next_slot || 1);
    }

    if (finalDeckId > 0) {
      const updateResult = await client.query(
        `
        UPDATE decks
        SET name = $1, side = $2, slot_index = $3, updated_at = NOW()
        WHERE id = $4 AND user_id = $5
        RETURNING id
        `,
        [name, side, slotIndex, finalDeckId, user.id]
      );

      if (updateResult.rows.length <= 0) {
        finalDeckId = 0;
      }
    }

    if (finalDeckId <= 0) {
      const insertResult = await client.query(
        `
        INSERT INTO decks (user_id, name, side, slot_index)
        VALUES ($1, $2, $3, $4)
        RETURNING id
        `,
        [user.id, name, side, slotIndex]
      );

      finalDeckId = insertResult.rows[0].id;
    }

    await client.query("DELETE FROM deck_cards WHERE deck_id = $1", [finalDeckId]);

    for (const [cardId, amount] of cardCounts.entries()) {
      await client.query(
        `
        INSERT INTO deck_cards (deck_id, card_id, count)
        VALUES ($1, $2, $3)
        `,
        [finalDeckId, cardId, amount]
      );
    }

    await client.query("COMMIT");

    sendJson(res, 200, {
      ok: true,
      deck: {
        id: finalDeckId,
        deck_id: finalDeckId,
        name,
        side,
        slot_index: slotIndex,
        cards: cardIds,
        card_ids: cardIds
      }
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function handleDeleteDeck(req, res) {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  await ensureDeckSchema();
  const body = await readJsonBody(req);
  if (body === null) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON" });
    return;
  }

  const deckId = Number(body.deck_id || body.id || 0);
  if (deckId <= 0) {
    sendJson(res, 400, { ok: false, error: "deck_id is required." });
    return;
  }

  const result = await dbQuery(
    "DELETE FROM decks WHERE id = $1 AND user_id = $2 RETURNING id",
    [deckId, user.id]
  );
  if (result.rows.length <= 0) {
    sendJson(res, 404, { ok: false, error: "Deck not found." });
    return;
  }

  sendJson(res, 200, { ok: true, deck_id: deckId });
}

async function handleRankedProfile(req, res) {
  const user = await requireUser(req, res);

  if (!user) {
    return;
  }
  await ensureRankedSchema();
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const profile = await getSeasonProfile(db, user.id);
    await db.query("COMMIT");
    sendJson(res, 200, { ok: true, profile });
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}

async function handleRankedResult(req, res) {
  const user = await requireUser(req, res);

  if (!user) {
    return;
  }

  sendJson(res, 403, {
    ok: false,
    error: "Ranked results are recorded only from server-authoritative matches."
  });
}

async function handleHttp(req, res) {
  try {
    if (req.method === "OPTIONS") {
      sendJson(res, 200, { ok: true });
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;

    if (path === "/" || path === "/health") {
      sendJson(res, 200, {
        ok: true,
        service: "godot-card-node-authoritative",
        db: !!pool,
        clients: clients.size,
        hosts: hosts.size,
        queued: queue.length,
        matches: matches.size,
        card_count: getAvailableCardIds().length
      });
      return;
    }

    if (!pool) {
      sendJson(res, 500, { ok: false, error: "DATABASE_URL is not set." });
      return;
    }

    if (req.method === "POST" && path === "/register") {
      await authRoutes.register(req, res);
      return;
    }

    if (req.method === "POST" && path === "/login") {
      await authRoutes.login(req, res);
      return;
    }

    if (req.method === "POST" && path === "/logout") {
      await authRoutes.logout(req, res);
      return;
    }

    if (req.method === "GET" && path === "/me") {
      await authRoutes.me(req, res, requireUser);
      return;
    }

    if (req.method === "POST" && path === "/tutorial/complete") {
      await authRoutes.completeTutorial(req, res, requireUser);
      return;
    }

    if (req.method === "GET" && path === "/collection") {
      await handleCollection(req, res);
      return;
    }

    if (req.method === "POST" && path === "/open_pack") {
      await handleOpenPack(req, res);
      return;
    }

    if (req.method === "GET" && path === "/decks") {
      await handleGetDecks(req, res);
      return;
    }

    if (req.method === "POST" && path === "/save_deck") {
      await handleSaveDeck(req, res);
      return;
    }

    if (req.method === "POST" && path === "/delete_deck") {
      await handleDeleteDeck(req, res);
      return;
    }

    if (req.method === "GET" && path === "/ranked/profile") {
      await handleRankedProfile(req, res);
      return;
    }

    if (req.method === "POST" && path === "/ranked/result") {
      await handleRankedResult(req, res);
      return;
    }

    sendJson(res, 404, { ok: false, error: "Not found" });
  } catch (error) {
    console.error("[HTTP ERROR]", error && error.stack ? error.stack : error);
    sendJson(res, 500, { ok: false, error: error.message });
  }
}

const server = http.createServer(handleHttp);
const wss = new WebSocketServer({ server });

// ============================================================================
// Battle state helpers
// ============================================================================
function removeClientFromQueue(clientId) {
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].client_id === clientId) {
      queue.splice(i, 1);
    }
  }
}

function resetClientMatchmakingState(client) {
  if (!client) return;
  client.queued = false;
  client.match_id = "";
  client.seat_id = "";
}

function pruneStaleQueueEntries(reason = "unspecified") {
  const now = Date.now();

  for (let i = queue.length - 1; i >= 0; i--) {
    const entry = queue[i];
    const clientId = String(entry && entry.client_id || "");
    const client = clients.get(clientId);
    let staleReason = "";

    if (!entry || !clientId) {
      staleReason = "invalid_entry";
    } else if (!client) {
      staleReason = "missing_client";
    } else if (!client.ws || client.ws.readyState !== WebSocket.OPEN) {
      staleReason = "socket_not_open";
    } else if (Number(entry.user_id || 0) !== Number(client.user_id || 0)) {
      staleReason = "user_id_mismatch";
    } else if (client.match_id) {
      staleReason = "client_already_in_match";
    } else if (now - Number(entry.joined_at || 0) >= QUEUE_ENTRY_TTL_MS) {
      staleReason = "ttl_expired";
    }

    if (!staleReason) continue;

    queue.splice(i, 1);
    if (client && !queue.some((queuedEntry) => queuedEntry && queuedEntry.client_id === clientId)) {
      client.queued = false;
    }
    console.log("[QUEUE PRUNE]", "reason=", reason, "stale=", staleReason, "client_id=", clientId, "user_id=", entry ? entry.user_id : "");
  }
}

function hasOtherQueueOrMatchForUser(userId, clientId) {
  const targetUserId = Number(userId || 0);
  const ignoredClientId = String(clientId || "");

  for (const entry of queue) {
    if (entry && Number(entry.user_id || 0) === targetUserId && String(entry.client_id || "") !== ignoredClientId) {
      return true;
    }
  }

  for (const match of matches.values()) {
    if (!match || !match.seats) continue;
    for (const seatId of ["A", "B"]) {
      const seat = match.seats[seatId];
      if (seat && Number(seat.user_id || 0) === targetUserId && String(seat.client_id || "") !== ignoredClientId) {
        return true;
      }
    }
  }

  return false;
}

function getSideFromDeckData(deckData) {
  if (!deckData || typeof deckData !== "object") {
    return "";
  }

  return String(deckData.side || "").toLowerCase();
}

function destroyMatchesForClient(clientId, reason = "Client started a new queue.") {
  const targetClientId = String(clientId || "");

  if (targetClientId === "") {
    return;
  }

  const matchIdsToDestroy = [];

  for (const [matchId, match] of matches.entries()) {
    if (!match || !match.seats) {
      continue;
    }

    const aClientId = match.seats.A ? String(match.seats.A.client_id || "") : "";
    const bClientId = match.seats.B ? String(match.seats.B.client_id || "") : "";

    if (aClientId === targetClientId || bClientId === targetClientId) {
      matchIdsToDestroy.push(matchId);
    }
  }

  for (const matchId of matchIdsToDestroy) {
    destroyMatch(matchId, reason);
  }
}

function getCardIdsFromDeckData(deckData) {
  if (!deckData || typeof deckData !== "object") {
    return [];
  }

  const source = Array.isArray(deckData.card_ids)
    ? deckData.card_ids
    : Array.isArray(deckData.cards)
      ? deckData.cards
      : [];

  return source.map((value) => extractCardId(value)).filter(Boolean);
}

function validateDeckData(deckData) {
  if (!deckData || typeof deckData !== "object") {
    return "deck_data is missing.";
  }

  const side = getSideFromDeckData(deckData);

  if (side !== "human" && side !== "god") {
    return "deck_data.side must be human or god.";
  }

  const cards = getCardIdsFromDeckData(deckData);

  if (cards.length !== REQUIRED_DECK_SIZE) {
    return `deck_data must contain exactly ${REQUIRED_DECK_SIZE} cards.`;
  }

  const unknownCardIds = cards.filter((cardId) => !hasCardDefinition(cardId));
  if (unknownCardIds.length > 0) {
    return "deck_data contains unknown card_id: " + unknownCardIds[0];
  }

  const unavailableCardIds = cards.filter((cardId) => !isDeckBuildableCard(cardId));
  if (unavailableCardIds.length > 0) {
    return "deck_data contains a card that cannot be added to a deck: " + unavailableCardIds[0];
  }

  const wrongSideCardIds = cards.filter((cardId) => String((getCardDefinition(cardId) || {}).side || "human") !== side);
  if (wrongSideCardIds.length > 0) {
    return "deck_data contains a card from the wrong side: " + wrongSideCardIds[0];
  }

  return "";
}

async function validateOwnedDeckData(userId, deckData) {
  await ensureUserProgression(userId);
  const accountResult = await dbQuery("SELECT is_developer FROM users WHERE id = $1 LIMIT 1", [userId]);
  if (Boolean(accountResult.rows[0] && accountResult.rows[0].is_developer)) return "";
  const ownedResult = await dbQuery("SELECT card_id, count FROM user_cards WHERE user_id = $1", [userId]);
  const ownedCounts = new Map(ownedResult.rows.map((row) => [String(row.card_id), Number(row.count || 0)]));
  for (const [cardId, amount] of countCards(getCardIdsFromDeckData(deckData)).entries()) {
    if (amount > Math.min(4, ownedCounts.get(cardId) || 0)) {
      return "deck_data contains more copies than this account owns: " + cardId;
    }
  }
  return "";
}

function findQueuePair() {
  for (let i = 0; i < queue.length; i++) {
    for (let j = i + 1; j < queue.length; j++) {
      const a = queue[i];
      const b = queue[j];

      if (!a || !b) {
        continue;
      }

      if (!clients.has(a.client_id) || !clients.has(b.client_id)) {
        continue;
      }

      if (a.match_type !== b.match_type) {
        continue;
      }

      if (Number(a.user_id || 0) === Number(b.user_id || 0)) {
        continue;
      }

      if (a.side === b.side) {
        continue;
      }

      return {
        entryA: a.side === "human" ? a : b,
        entryB: a.side === "human" ? b : a
      };
    }
  }

  return null;
}

function drawOneCard(player) {
  if (!player) {
    return null;
  }

  if (!Array.isArray(player.deck)) {
    player.deck = [];
  }

  if (!Array.isArray(player.hand)) {
    player.hand = [];
  }

  if (!Array.isArray(player.graveyard)) {
    player.graveyard = [];
  }

  if (player.deck.length <= 0) {
    return null;
  }

  const card = player.deck.pop();

  if (player.hand.length >= MAX_HAND_SIZE) {
    player.graveyard.push(card);
    return card;
  }

  player.hand.push(card);
  return card;
}

function makeInitialPlayerState(ownerId, deckData) {
  const cardIds = getCardIdsFromDeckData(deckData);
  const deck = cardIds
    .map((cardId) => makeCardFromId(cardId))
    .filter((card) => card && typeof card === "object");

  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }

  return {
    owner_id: ownerId,
    name: ownerId === "player1" ? "Player1" : "Player2",

    hp: STARTING_HP,
    max_hp: STARTING_HP,

    mana: STARTING_MANA,
    max_mana: STARTING_MANA,

    deck,
    hand: [],
    board: [],
    graveyard: [],

    inflation_counters: 0,
    scholar_cards_played_this_game: 0,
    scholar_played_count: 0,
    played_trait_counts: {},
    last_spell_cast: null
  };
}

function makeInitialMatchState(match) {
  const player1 = makeInitialPlayerState("player1", match.seats.A.deck_data);
  const player2 = makeInitialPlayerState("player2", match.seats.B.deck_data);
  const coinFlip = chooseFirstPlayer(match.seats);

  for (let i = 0; i < STARTING_HAND_SIZE; i++) {
    drawOneCard(player1);
    drawOneCard(player2);
  }

  const state = {
    match_id: match.match_id,
    authority_mode: "server",

    turn_number: 1,
    current_player_id: coinFlip.first_player_id,
    turn_seat: coinFlip.first_player_seat,
    first_player_id: coinFlip.first_player_id,
    first_player_seat: coinFlip.first_player_seat,
    first_player_side: coinFlip.first_player_side,

    status_message: "",
    game_over: false,
    winner_seat: "",
    loser_seat: "",

    turn_time_left: TURN_TIME_LIMIT_SECONDS,
    turn_timer_active: false,
    turn_timer_timeout_handled: false,

    player1,
    player2,
    players: {
      A: player1,
      B: player2
    },

    owner_to_seat_id: {
      player1: "A",
      player2: "B"
    },
    seat_to_owner_id: {
      A: "player1",
      B: "player2"
    },

    battle_log_messages: [],
    log: [],

    selecting_target: false,
    selecting_hand_card: false,
    pending_action_type: "none",
    pending_card: null,
    pending_hand_index: -1,
    pending_card_owner: "",
    pending_attacker_index: -1,
    selected_attacker_owner: "",
    selected_attacker_index: -1,
    pending_ability: {},
    selected: null,
    pending_deaths: [],
    pending_summons: [],
    pending_hand_selection_effect: "",
    pending_hand_selection_owner: "",
    pending_card_selection_owner: "",
    pending_card_selection_zone: "hand",
    pending_hand_candidate_indexes: [],
    pending_end_turn_after_hand_selection: false,
    pending_end_turn_seat: ""
  };

  const result = BattleEngine.startTurn(state, coinFlip.first_player_seat, { makeCardFromId });

  if (result && result.ok === false) {
    throw new Error(result.message || "Failed to start first turn.");
  }

  return normalizeAuthoritativeState(state);
}

function normalizeAuthoritativeState(state) {
  if (!state || typeof state !== "object") {
    return {};
  }

  if (BattleEngine && typeof BattleEngine.normalizeStateRuntime === "function") {
    BattleEngine.normalizeStateRuntime(state);
  }

  if (!state.players || typeof state.players !== "object") {
    state.players = {
      A: state.player1,
      B: state.player2
    };
  }

  if (state.players.A) {
    state.player1 = state.players.A;
  }

  if (state.players.B) {
    state.player2 = state.players.B;
  }

  if (!state.owner_to_seat_id || typeof state.owner_to_seat_id !== "object") {
    state.owner_to_seat_id = {
      player1: "A",
      player2: "B"
    };
  }

  if (!state.seat_to_owner_id || typeof state.seat_to_owner_id !== "object") {
    state.seat_to_owner_id = {
      A: "player1",
      B: "player2"
    };
  }

  if (state.turn_seat === "A") {
    state.current_player_id = "player1";
  } else if (state.turn_seat === "B") {
    state.current_player_id = "player2";
  } else {
    state.turn_seat = state.owner_to_seat_id[state.current_player_id] || "A";
    state.current_player_id = state.seat_to_owner_id[state.turn_seat] || "player1";
  }

  if (!Array.isArray(state.battle_log_messages)) {
    state.battle_log_messages = [];
  }

  if (!Array.isArray(state.log)) {
    state.log = [];
  }

  for (const message of state.log) {
    const text = String(message || "");

    if (text && !state.battle_log_messages.includes(text)) {
      state.battle_log_messages.push(text);
    }
  }

  if (state.battle_log_messages.length > 80) {
    state.battle_log_messages.splice(0, state.battle_log_messages.length - 80);
  }

  if (state.log.length > 80) {
    state.log.splice(0, state.log.length - 80);
  }

  if (state.game_over) {
    state.turn_timer_active = false;
    state.turn_timer_timeout_handled = true;
  }

  return state;
}

function getPublicBattleState(match) {
  if (!match || !match.state) {
    return {};
  }

  try {
    if (BattleEngine && typeof BattleEngine.makePublicState === "function") {
      const publicState = BattleEngine.makePublicState(match.state);

      if (publicState && typeof publicState === "object") {
        publicState.match_id = match.match_id;
        publicState.match_type = match.match_type;
        addPublicResultMetadata(match, publicState);
        return publicState;
      }
    }
  } catch (error) {
    console.error(
      "[PUBLIC STATE ERROR]",
      match.match_id || "",
      error && error.stack ? error.stack : error
    );
  }

  const fallback = normalizeAuthoritativeState(match.state);
  fallback.match_id = match.match_id;
  fallback.match_type = match.match_type;
  addPublicResultMetadata(match, fallback);
  return fallback;
}

function addPublicResultMetadata(match, state) {
  if (!state || !state.game_over) return;
  const winnerSeat = String(state.winner_seat || "");
  const loserSeat = String(state.loser_seat || "");
  state.winner_side = match.seats[winnerSeat] ? match.seats[winnerSeat].side : "";
  state.loser_side = match.seats[loserSeat] ? match.seats[loserSeat].side : "";
  state.winner_user_id = match.seats[winnerSeat] ? Number(match.seats[winnerSeat].user_id || 0) : 0;
  state.loser_user_id = match.seats[loserSeat] ? Number(match.seats[loserSeat].user_id || 0) : 0;
  state.result_reason = String((match.state && match.state.result_reason) || state.result_reason || "normal");
}

function publicStateForSeat(publicState, seatId) {
  const state = { ...publicState };
  if (state.game_over) {
    state.result_for_client = state.winner_seat === seatId ? "win" : state.loser_seat === seatId ? "lose" : "draw";
  }
  return state;
}

function broadcastMatchState(matchId) {
  const match = matches.get(matchId);

  if (!match) {
    return;
  }

  match.state = normalizeAuthoritativeState(match.state);
  const publicState = getPublicBattleState(match);

  const clientA = clients.get(match.seats.A.client_id);
  const clientB = clients.get(match.seats.B.client_id);

  if (clientA) {
    safeSend(clientA.ws, {
      type: "match_state",
      match_id: matchId,
      seat_id: "A",
      state: publicStateForSeat(publicState, "A")
    });
  }

  if (clientB) {
    safeSend(clientB.ws, {
      type: "match_state",
      match_id: matchId,
      seat_id: "B",
      state: publicStateForSeat(publicState, "B")
    });
  }
}

function isSeatConnected(match, seatId) {
  const seat = match && match.seats ? match.seats[seatId] : null;

  if (!seat || seat.disconnected) {
    return false;
  }

  const client = clients.get(seat.client_id);
  return Boolean(client && client.ws && client.ws.readyState === WebSocket.OPEN);
}

function hasExpiredDisconnectedSeat(match, now) {
  if (!match || !match.seats) {
    return false;
  }

  for (const seatId of ["A", "B"]) {
    const seat = match.seats[seatId];
    if (seat && seat.disconnected && Number(seat.disconnected_at || 0) > 0) {
      if (now - Number(seat.disconnected_at) >= MATCH_RECONNECT_GRACE_MS) {
        return true;
      }
    }
  }

  return false;
}

function sendMatchFound(matchId) {
  const match = matches.get(matchId);

  if (!match) {
    console.error("[MATCH FOUND SEND ERROR] match not found", matchId);
    return false;
  }

  let publicState = {};

  try {
    publicState = getPublicBattleState(match);
  } catch (error) {
    console.error(
      "[MATCH FOUND PUBLIC STATE ERROR]",
      matchId,
      error && error.stack ? error.stack : error
    );
    publicState = match.state || {};
  }

  const clientA = clients.get(match.seats.A.client_id);
  const clientB = clients.get(match.seats.B.client_id);

  const sideA = match.seats.A.side;
  const sideB = match.seats.B.side;

  const payloadA = {
    type: "match_found",
    match_id: matchId,
    match_type: match.match_type,
    seat_id: "A",
    side: sideA,
    opponent_side: sideB,
    display_name: match.seats.A.display_name,
    opponent_display_name: match.seats.B.display_name,
    first_player_id: publicState.first_player_id,
    first_player_seat: publicState.first_player_seat,
    first_player_side: publicState.first_player_side,
    state: publicState
  };

  const payloadB = {
    type: "match_found",
    match_id: matchId,
    match_type: match.match_type,
    seat_id: "B",
    side: sideB,
    opponent_side: sideA,
    display_name: match.seats.B.display_name,
    opponent_display_name: match.seats.A.display_name,
    first_player_id: publicState.first_player_id,
    first_player_seat: publicState.first_player_seat,
    first_player_side: publicState.first_player_side,
    state: publicState
  };

  let sentA = false;
  let sentB = false;

  if (clientA && clientA.ws) {
    sentA = safeSend(clientA.ws, payloadA);
  }

  if (clientB && clientB.ws) {
    sentB = safeSend(clientB.ws, payloadB);
  }

  console.log(
    "[MATCH FOUND SEND]",
    matchId,
    "A_client=",
    match.seats.A.client_id,
    "A_ws=",
    clientA && clientA.ws ? clientA.ws.readyState : "missing",
    "A_sent=",
    sentA,
    "B_client=",
    match.seats.B.client_id,
    "B_ws=",
    clientB && clientB.ws ? clientB.ws.readyState : "missing",
    "B_sent=",
    sentB
  );

  if (sentA) {
    safeSend(clientA.ws, {
      type: "match_state",
      match_id: matchId,
      seat_id: "A",
      state: publicState
    });
  }

  if (sentB) {
    safeSend(clientB.ws, {
      type: "match_state",
      match_id: matchId,
      seat_id: "B",
      state: publicState
    });
  }

  return sentA && sentB;
}

function tryMakeMatch() {
  pruneStaleQueueEntries("try_make_match");

  while (queue.length >= 2) {
    const pair = findQueuePair();

    if (!pair) {
      console.log("[MATCH] Waiting for compatible queue pair. queue=", queue.length);
      return;
    }

    const entryA = pair.entryA;
    const entryB = pair.entryB;

    removeClientFromQueue(entryA.client_id);
    removeClientFromQueue(entryB.client_id);

    const clientA = clients.get(entryA.client_id);
    const clientB = clients.get(entryB.client_id);

    if (!clientA || !clientB) {
      resetClientMatchmakingState(clientA);
      resetClientMatchmakingState(clientB);
      console.log("[MATCH CREATE CLEANUP]", "reason=missing_client", "A=", entryA.client_id, "B=", entryB.client_id);
      continue;
    }

    if (!clientA.ws || clientA.ws.readyState !== WebSocket.OPEN) {
      resetClientMatchmakingState(clientA);
      resetClientMatchmakingState(clientB);
      console.log("[MATCH CREATE CLEANUP]", "reason=A_socket_not_open", "A=", entryA.client_id, "B=", entryB.client_id);
      continue;
    }

    if (!clientB.ws || clientB.ws.readyState !== WebSocket.OPEN) {
      resetClientMatchmakingState(clientA);
      resetClientMatchmakingState(clientB);
      console.log("[MATCH CREATE CLEANUP]", "reason=B_socket_not_open", "A=", entryA.client_id, "B=", entryB.client_id);
      continue;
    }

    const matchId = makeId("match", nextMatchNumber++);

    const match = {
      match_id: matchId,
      match_type: entryA.match_type,
      result_saved: false,
      state: {},
      seats: {
        A: {
          client_id: entryA.client_id,
          user_id: clientA.user_id,
          username: clientA.username,
          display_name: clientA.display_name,
          deck_data: entryA.deck_data,
          side: entryA.side,
          disconnected: false,
          disconnected_at: null
        },
        B: {
          client_id: entryB.client_id,
          user_id: clientB.user_id,
          username: clientB.username,
          display_name: clientB.display_name,
          deck_data: entryB.deck_data,
          side: entryB.side,
          disconnected: false,
          disconnected_at: null
        }
      },
      created_at: Date.now(),
      last_timer_update_at: Date.now()
    };

    try {
      match.state = makeInitialMatchState(match);
    } catch (error) {
      console.error(
        "[MATCH CREATE ERROR]",
        matchId,
        error && error.stack ? error.stack : error
      );

      resetClientMatchmakingState(clientA);
      resetClientMatchmakingState(clientB);

      sendError(clientA.ws, "Server failed while creating match.");
      sendError(clientB.ws, "Server failed while creating match.");
      continue;
    }

    matches.set(matchId, match);

    clientA.match_id = matchId;
    clientA.seat_id = "A";
    clientA.queued = false;

    clientB.match_id = matchId;
    clientB.seat_id = "B";
    clientB.queued = false;

    console.log(
      "[MATCH] Created Node authoritative match",
      matchId,
      "A=",
      entryA.client_id,
      "user_id=",
      clientA.user_id,
      "display_name=",
      clientA.display_name,
      entryA.side,
      "B=",
      entryB.client_id,
      "user_id=",
      clientB.user_id,
      "display_name=",
      clientB.display_name,
      entryB.side,
      "match_type=",
      match.match_type,
      "first_side=",
      match.state.first_player_side,
      "first_seat=",
      match.state.first_player_seat
    );

    if (!sendMatchFound(matchId)) {
      matches.delete(matchId);
      resetClientMatchmakingState(clientA);
      resetClientMatchmakingState(clientB);
      console.log("[MATCH CREATE CLEANUP]", "reason=match_found_send_failed", "match_id=", matchId);
      sendError(clientA.ws, "Match could not start because a client disconnected.");
      sendError(clientB.ws, "Match could not start because a client disconnected.");
    }
  }
}

function tickMatchTimers() {
  pruneStaleQueueEntries("timer_tick");
  expireDisconnectedAircraftMatches();
  const now = Date.now();

  for (const [matchId, match] of matches.entries()) {
    try {
      if (!match || !match.state) {
        continue;
      }

      const state = match.state;

      if (state.game_over) {
        continue;
      }

      if (hasExpiredDisconnectedSeat(match, now)) {
        const disconnectedSeats = ["A", "B"].filter((seatId) => !isSeatConnected(match, seatId));
        if (disconnectedSeats.length === 1) {
          const loserSeat = disconnectedSeats[0];
          const winnerSeat = loserSeat === "A" ? "B" : "A";
          match.state.game_over = true;
          match.state.winner_seat = winnerSeat;
          match.state.loser_seat = loserSeat;
          match.state.status_message = "Opponent disconnected.";
          match.state.result_reason = "disconnect";
        }
        for (const seatId of ["A", "B"]) {
          if (isSeatConnected(match, seatId)) {
            const client = clients.get(match.seats[seatId].client_id);
            safeSend(client.ws, {
              type: "opponent_left",
              match_id: matchId,
              message: "Opponent did not reconnect in time."
            });
          }
        }
        destroyMatch(matchId, "Reconnection grace period expired.", disconnectedSeats.length === 1 ? "disconnect" : "server_error");
        continue;
      }

      if (!isSeatConnected(match, "A") && !isSeatConnected(match, "B")) {
        match.last_timer_update_at = now;
        continue;
      }

      if (!state.turn_timer_active) {
        match.last_timer_update_at = now;
        continue;
      }

      if (state.turn_timer_timeout_handled) {
        match.last_timer_update_at = now;
        continue;
      }

      const last = Number(match.last_timer_update_at || now);
      const deltaSeconds = Math.max(0, (now - last) / 1000.0);
      match.last_timer_update_at = now;

      if (deltaSeconds <= 0) {
        continue;
      }

      state.turn_time_left = Math.max(0, Number(state.turn_time_left || 0) - deltaSeconds);

      if (state.turn_time_left > 0) {
        continue;
      }

      state.turn_time_left = 0;
      state.turn_timer_timeout_handled = true;

      console.log(
        "[MATCH TIMER] timeout",
        matchId,
        "turn=",
        state.turn_number,
        "seat=",
        state.turn_seat
      );

      const seatId = state.turn_seat || (
        state.current_player_id === "player2" ? "B" : "A"
      );

      const result = BattleEngine.handleBattleAction(match, seatId, {
        action: "end_turn",
        reason: "timeout"
      }, {
        makeCardFromId
      });

      if (!result || result.ok !== true) {
        console.error(
          "[MATCH TIMER] auto end_turn failed",
          matchId,
          result && (result.message || result.reason)
            ? (result.message || result.reason)
            : "unknown error"
        );

        state.turn_timer_active = false;
        continue;
      }

      match.state = normalizeAuthoritativeState(match.state);
      match.last_timer_update_at = Date.now();

      broadcastMatchState(matchId);

      if (match.state && match.state.game_over) {
        destroyMatch(matchId, "Match finished by timer.", "normal");
      }
    } catch (error) {
      console.error(
        "[MATCH TIMER ERROR]",
        matchId,
        error && error.stack ? error.stack : error
      );
    }
  }
}

function destroyMatch(matchId, reason = "Match destroyed.", endedReason = "server_error") {
  const match = matches.get(matchId);

  if (!match) {
    return;
  }

  finalizeMatch(match, endedReason).catch((error) => {
    console.error("[MATCH FINALIZE ERROR]", matchId, error && error.stack ? error.stack : error);
  });

  const clientA = match.seats && match.seats.A ? clients.get(match.seats.A.client_id) : null;
  const clientB = match.seats && match.seats.B ? clients.get(match.seats.B.client_id) : null;

  if (clientA) {
    clientA.match_id = "";
    clientA.seat_id = "";
    clientA.queued = false;
  }

  if (clientB) {
    clientB.match_id = "";
    clientB.seat_id = "";
    clientB.queued = false;
  }

  matches.delete(matchId);

  console.log("[MATCH] destroyed", matchId, reason);

  tryMakeMatch();
}

// ============================================================================
// Aircraft WebSocket MVP
// ============================================================================
function normalizeAircraftId(value) {
  const aircraftId = String(value || "iron_gull");
  if (["swift_needle", "iron_gull", "bastion_tortoise", "crown_cathedral"].includes(aircraftId)) {
    return aircraftId;
  }
  return "";
}

function removeClientFromAircraftQueue(clientId) {
  for (let i = aircraftQueue.length - 1; i >= 0; i--) {
    if (aircraftQueue[i].client_id === clientId) {
      aircraftQueue.splice(i, 1);
    }
  }
}

function findAircraftSeat(match, clientId) {
  if (!match || !match.players) return "";
  if (match.players.A && match.players.A.client_id === clientId) return "A";
  if (match.players.B && match.players.B.client_id === clientId) return "B";
  return "";
}

function getAircraftClient(match, seatId) {
  const seat = match && match.players ? match.players[seatId] : null;
  return seat ? clients.get(seat.client_id) : null;
}

function sendAircraftError(client, message) {
  if (!client) return;
  safeSend(client.ws, {
    type: "aircraft_error",
    message: String(message || "Aircraft error.")
  });
}

function sendAircraftActionRejected(client, reason) {
  if (!client) return;
  safeSend(client.ws, {
    type: "aircraft_action_rejected",
    reason: String(reason || "Aircraft action rejected.")
  });
}

function hasOtherAircraftQueueOrMatchForUser(userId, ignoredClientId) {
  const targetUserId = Number(userId || 0);
  const ignored = String(ignoredClientId || "");
  if (targetUserId <= 0) return false;

  for (const entry of aircraftQueue) {
    if (Number(entry.user_id || 0) === targetUserId && String(entry.client_id || "") !== ignored) {
      return true;
    }
  }

  for (const match of aircraftMatches.values()) {
    for (const seatId of ["A", "B"]) {
      const seat = match.players && match.players[seatId] ? match.players[seatId] : null;
      if (seat && Number(seat.user_id || 0) === targetUserId && String(seat.client_id || "") !== ignored) {
        return true;
      }
    }
  }

  return false;
}

function serializeAircraftMatchState(match) {
  const state = serializeAircraftState(match.state);
  state.match_id = match.match_id;
  state.match_type = "aircraft";
  return state;
}

function broadcastAircraftMatchState(match) {
  if (!match) return;
  match.state = serializeAircraftState(match.state);

  for (const seatId of ["A", "B"]) {
    const client = getAircraftClient(match, seatId);
    if (!client) continue;
    safeSend(client.ws, {
      type: "aircraft_match_state",
      match_id: match.match_id,
      seat_id: seatId,
      player_index: seatId === "A" ? 0 : 1,
      state: serializeAircraftMatchState(match)
    });
  }
}

function sendAircraftBattleResult(match) {
  for (const seatId of ["A", "B"]) {
    const client = getAircraftClient(match, seatId);
    if (!client) continue;
    safeSend(client.ws, {
      type: "aircraft_battle_result",
      match_id: match.match_id,
      result_text: String(match.state.result_text || "Aircraft battle finished."),
      winner_index: match.state.winner_index
    });
  }
}

function cleanupAircraftMatch(matchId) {
  const match = aircraftMatches.get(matchId);
  if (!match) return;

  for (const seatId of ["A", "B"]) {
    const client = getAircraftClient(match, seatId);
    if (client) {
      client.aircraftMatchId = "";
      client.aircraftSeatId = "";
    }
  }

  aircraftMatches.delete(matchId);
}

function makeAircraftQueueEntry(client, message) {
  const aircraftId = normalizeAircraftId(message.aircraft_id);
  if (!aircraftId) {
    return { ok: false, reason: "Invalid aircraft_id." };
  }

  const deckIds = Array.isArray(message.deck_ids) ? message.deck_ids.map((value) => String(value)) : null;
  return {
    ok: true,
    entry: {
      client_id: client.client_id,
      user_id: client.user_id,
      display_name: String(message.display_name || client.display_name || client.username || client.client_id),
      aircraft_id: aircraftId,
      deck_ids: deckIds,
      joined_at: Date.now()
    }
  };
}

function tryMakeAircraftMatch() {
  while (aircraftQueue.length >= 2) {
    const entryA = aircraftQueue.shift();
    const entryB = aircraftQueue.shift();
    const clientA = clients.get(entryA.client_id);
    const clientB = clients.get(entryB.client_id);

    if (!clientA || !clientB || !clientA.ws || !clientB.ws || clientA.ws.readyState !== WebSocket.OPEN || clientB.ws.readyState !== WebSocket.OPEN) {
      if (clientA) {
        clientA.aircraftMatchId = "";
        clientA.aircraftSeatId = "";
      }
      if (clientB) {
        clientB.aircraftMatchId = "";
        clientB.aircraftSeatId = "";
      }
      continue;
    }

    const matchId = makeId("aircraft_match", nextMatchNumber++);
    let state = null;

    try {
      state = createAircraftMatchState({
        player1_aircraft_id: entryA.aircraft_id,
        player2_aircraft_id: entryB.aircraft_id,
        player1_deck_ids: entryA.deck_ids,
        player2_deck_ids: entryB.deck_ids
      });
    } catch (error) {
      console.error("[AIRCRAFT MATCH CREATE ERROR]", error && error.stack ? error.stack : error);
      sendAircraftError(clientA, "Aircraft match could not be created.");
      sendAircraftError(clientB, "Aircraft match could not be created.");
      continue;
    }

    const validation = validateAircraftState(state);
    if (!validation.ok) {
      sendAircraftError(clientA, validation.reason || "Invalid Aircraft state.");
      sendAircraftError(clientB, validation.reason || "Invalid Aircraft state.");
      continue;
    }

    console.log("[AIRCRAFT_STATE_CHECK] create match p1", {
      aircraft: state.players[0].aircraft_id,
      deck: state.players[0].deck?.length,
      hand: state.players[0].hand?.length,
      mana: state.players[0].mana,
      max_mana: state.players[0].max_mana
    });
    console.log("[AIRCRAFT_STATE_CHECK] create match p2", {
      aircraft: state.players[1].aircraft_id,
      deck: state.players[1].deck?.length,
      hand: state.players[1].hand?.length,
      mana: state.players[1].mana,
      max_mana: state.players[1].max_mana
    });

    const match = {
      match_id: matchId,
      type: "aircraft",
      players: {
        A: { ...entryA, connected: true },
        B: { ...entryB, connected: true }
      },
      state,
      created_at: Date.now(),
      last_action_at: Date.now()
    };

    aircraftMatches.set(matchId, match);
    clientA.aircraftMatchId = matchId;
    clientA.aircraftSeatId = "A";
    clientB.aircraftMatchId = matchId;
    clientB.aircraftSeatId = "B";

    safeSend(clientA.ws, {
      type: "aircraft_match_found",
      match_id: matchId,
      seat_id: "A",
      player_index: 0,
      opponent_name: entryB.display_name,
      state: serializeAircraftMatchState(match)
    });
    safeSend(clientB.ws, {
      type: "aircraft_match_found",
      match_id: matchId,
      seat_id: "B",
      player_index: 1,
      opponent_name: entryA.display_name,
      state: serializeAircraftMatchState(match)
    });

    console.log("[AIRCRAFT MATCH] created", matchId, entryA.display_name, "vs", entryB.display_name);
  }
}

function handleAircraftDisconnect(client) {
  removeClientFromAircraftQueue(client.client_id);

  if (!client.aircraftMatchId) return;
  const match = aircraftMatches.get(client.aircraftMatchId);
  if (!match) return;

  const seatId = findAircraftSeat(match, client.client_id);
  if (!seatId || !match.players[seatId]) return;

  match.players[seatId].connected = false;
  match.players[seatId].disconnected_at = Date.now();

  const otherSeatId = seatId === "A" ? "B" : "A";
  const otherClient = getAircraftClient(match, otherSeatId);
  if (otherClient) {
    safeSend(otherClient.ws, {
      type: "aircraft_opponent_connection_lost",
      match_id: match.match_id,
      state: serializeAircraftMatchState(match)
    });
  }
}

function expireDisconnectedAircraftMatches() {
  const now = Date.now();
  for (const match of aircraftMatches.values()) {
    for (const seatId of ["A", "B"]) {
      const seat = match.players[seatId];
      if (seat && seat.connected === false && Number(seat.disconnected_at || 0) > 0) {
        if (now - Number(seat.disconnected_at) >= 60000) {
          const winnerSeatId = seatId === "A" ? "B" : "A";
          match.state.battle_over = true;
          match.state.winner_index = winnerSeatId === "A" ? 0 : 1;
          match.state.result_text = "Opponent disconnected. Aircraft battle finished.";
          sendAircraftBattleResult(match);
          cleanupAircraftMatch(match.match_id);
          break;
        }
      }
    }
  }
}

// ============================================================================
// WebSocket
// ============================================================================
async function handleClientMessage(client, message) {
  const type = String(message.type || "");

  switch (type) {
    case "auth": {
      const user = await authService.getUserBySessionToken(String(message.token || ""));

      if (!user) {
        removeClientFromQueue(client.client_id);
        removeClientFromAircraftQueue(client.client_id);
        client.queued = false;
        client.is_authenticated = false;
        safeSend(client.ws, { type: "auth_error", message: "Invalid token" });
        return;
      }

      const previousUserId = Number(client.user_id || 0);
      const nextUserId = Number(user.id || 0);
      if (previousUserId > 0 && previousUserId !== nextUserId) {
        if (client.match_id) {
          safeSend(client.ws, { type: "auth_error", message: "Leave the active match before switching accounts." });
          return;
        }
        if (client.aircraftMatchId) {
          safeSend(client.ws, { type: "auth_error", message: "Leave the active Aircraft match before switching accounts." });
          return;
        }
        removeClientFromQueue(client.client_id);
        removeClientFromAircraftQueue(client.client_id);
        client.queued = false;
        console.log("[QUEUE CLEANUP]", "reason=auth_user_switch", "client_id=", client.client_id, "old_user_id=", previousUserId, "new_user_id=", nextUserId);
      }

      client.user_id = user.id;
      client.username = user.username;
      client.display_name = user.display_name;
      client.is_authenticated = true;
      await ensureUserProgression(client.user_id);

      safeSend(client.ws, { type: "auth_ok", user });
      console.log(
        "[AUTH] client authenticated",
        client.client_id,
        "user_id=",
        client.user_id,
        "display_name=",
        client.display_name
      );
      return;
    }

    case "queue_join": {
      if (!client.is_authenticated) {
        safeSend(client.ws, { type: "auth_error", message: "Authentication required." });
        return;
      }

      const deckData = message.deck_data || {};
      const validationError = validateDeckData(deckData);
      const matchType = normalizeMatchType(message.match_type);

      if (validationError) {
        sendError(client.ws, validationError);
        return;
      }
      const ownershipError = await validateOwnedDeckData(client.user_id, deckData);
      if (ownershipError) {
        sendError(client.ws, ownershipError);
        return;
      }

      if (!matchType) {
        sendError(client.ws, "match_type must be casual or ranked.");
        return;
      }

      if (client.match_id) {
        sendError(client.ws, "Leave the active match before entering another queue.");
        return;
      }

      pruneStaleQueueEntries("queue_join");

      if (hasOtherQueueOrMatchForUser(client.user_id, client.client_id)) {
        sendError(client.ws, "This account is already queued or in a match.");
        return;
      }

      removeClientFromQueue(client.client_id);
      client.queued = true;
      client.match_id = "";
      client.seat_id = "";

      const side = getSideFromDeckData(deckData);

      queue.push({
        client_id: client.client_id,
        user_id: client.user_id,
        match_type: matchType,
        side,
        deck_data: deckData,
        joined_at: Date.now()
      });

      console.log(
        "[QUEUE] joined",
        client.client_id,
        "user_id=",
        client.user_id,
        "display_name=",
        client.display_name,
        "side=",
        side,
        "match_type=",
        matchType,
        "queue=",
        queue.length
      );

      safeSend(client.ws, {
        type: "queue_joined",
        side,
        match_type: matchType,
        queue_size: queue.filter((entry) => entry.match_type === matchType).length
      });

      tryMakeMatch();
      return;
    }

    case "rejoin_match": {
      if (!client.is_authenticated) {
        safeSend(client.ws, { type: "auth_error", message: "Authentication required." });
        return;
      }

      const matchId = String(message.match_id || "");
      const seatId = String(message.seat_id || "");
      const match = matches.get(matchId);

      if (!match || (seatId !== "A" && seatId !== "B") || !match.seats[seatId]) {
        safeSend(client.ws, {
          type: "rejoin_failed",
          match_id: matchId,
          message: "Battle could not be restored after the server restarted."
        });
        return;
      }

      const seat = match.seats[seatId];
      if (Number(seat.user_id || 0) !== Number(client.user_id || 0)) {
        safeSend(client.ws, {
          type: "rejoin_failed",
          match_id: matchId,
          message: "This account cannot rejoin that seat."
        });
        return;
      }

      const previousClient = clients.get(seat.client_id);
      if (!seat.disconnected && previousClient && previousClient.ws && previousClient.ws.readyState === WebSocket.OPEN) {
        safeSend(client.ws, {
          type: "rejoin_failed",
          match_id: matchId,
          message: "That battle seat is already connected."
        });
        return;
      }

      removeClientFromQueue(client.client_id);
      client.queued = false;
      client.match_id = matchId;
      client.seat_id = seatId;

      seat.client_id = client.client_id;
      seat.disconnected = false;
      seat.disconnected_at = null;
      match.last_timer_update_at = Date.now();

      const otherSeatId = seatId === "A" ? "B" : "A";
      const otherSeat = match.seats[otherSeatId];
      const publicState = getPublicBattleState(match);

      safeSend(client.ws, {
        type: "match_rejoined",
        match_id: matchId,
        match_type: match.match_type,
        seat_id: seatId,
        side: seat.side,
        opponent_side: otherSeat.side,
        display_name: seat.display_name,
        opponent_display_name: otherSeat.display_name,
        first_player_id: publicState.first_player_id,
        first_player_seat: publicState.first_player_seat,
        first_player_side: publicState.first_player_side,
        state: publicState
      });

      if (isSeatConnected(match, otherSeatId)) {
        const otherClient = clients.get(otherSeat.client_id);
        safeSend(otherClient.ws, {
          type: "opponent_rejoined",
          match_id: matchId,
          message: "Opponent rejoined the battle."
        });
      }

      broadcastMatchState(matchId);
      console.log(
        "[MATCH] client rejoined",
        matchId,
        "seat=",
        seatId,
        "client_id=",
        client.client_id,
        "user_id=",
        client.user_id
      );
      return;
    }

    case "queue_leave": {
      removeClientFromQueue(client.client_id);
      client.queued = false;
      safeSend(client.ws, { type: "queue_left" });
      console.log("[QUEUE] left", client.client_id, "queue=", queue.length);
      return;
    }

    case "aircraft_queue_join": {
      if (client.match_id || client.aircraftMatchId) {
        sendAircraftError(client, "Leave the active match before entering Aircraft queue.");
        return;
      }

      if (client.queued || hasOtherQueueOrMatchForUser(client.user_id, client.client_id) || hasOtherAircraftQueueOrMatchForUser(client.user_id, client.client_id)) {
        sendAircraftError(client, "This account is already queued or in a match.");
        return;
      }

      const queueEntry = makeAircraftQueueEntry(client, message);
      if (!queueEntry.ok) {
        sendAircraftError(client, queueEntry.reason);
        return;
      }

      removeClientFromAircraftQueue(client.client_id);
      aircraftQueue.push(queueEntry.entry);
      safeSend(client.ws, {
        type: "aircraft_queue_joined",
        queue_size: aircraftQueue.length
      });
      console.log("[AIRCRAFT QUEUE] joined", client.client_id, "aircraft=", queueEntry.entry.aircraft_id, "deck_ids=", queueEntry.entry.deck_ids ? queueEntry.entry.deck_ids.length : 0, "queue=", aircraftQueue.length);
      tryMakeAircraftMatch();
      return;
    }

    case "aircraft_queue_leave": {
      removeClientFromAircraftQueue(client.client_id);
      safeSend(client.ws, { type: "aircraft_queue_left" });
      console.log("[AIRCRAFT QUEUE] left", client.client_id, "queue=", aircraftQueue.length);
      return;
    }

    case "aircraft_rejoin_match": {
      const matchId = String(message.match_id || "");
      const seatId = String(message.seat_id || "");
      const match = aircraftMatches.get(matchId);

      if (!match || (seatId !== "A" && seatId !== "B") || !match.players[seatId]) {
        safeSend(client.ws, {
          type: "aircraft_rejoin_failed",
          match_id: matchId,
          message: "Aircraft match was not found."
        });
        return;
      }

      const seat = match.players[seatId];
      if (Number(seat.user_id || 0) > 0 && Number(seat.user_id || 0) !== Number(client.user_id || 0)) {
        safeSend(client.ws, {
          type: "aircraft_rejoin_failed",
          match_id: matchId,
          message: "This account cannot rejoin that Aircraft seat."
        });
        return;
      }

      removeClientFromAircraftQueue(client.client_id);
      client.aircraftMatchId = matchId;
      client.aircraftSeatId = seatId;
      seat.client_id = client.client_id;
      seat.connected = true;
      seat.disconnected_at = 0;
      match.last_action_at = Date.now();

      safeSend(client.ws, {
        type: "aircraft_rejoin_ok",
        match_id: matchId,
        seat_id: seatId,
        player_index: seatId === "A" ? 0 : 1,
        state: serializeAircraftMatchState(match)
      });
      broadcastAircraftMatchState(match);

      const otherClient = getAircraftClient(match, seatId === "A" ? "B" : "A");
      if (otherClient) {
        safeSend(otherClient.ws, {
          type: "aircraft_opponent_rejoined",
          match_id: matchId
        });
      }
      return;
    }

    case "aircraft_battle_action":
    case "aircraft_surrender": {
      const matchId = String(message.match_id || client.aircraftMatchId || "");
      const match = aircraftMatches.get(matchId);
      if (!match) {
        sendAircraftActionRejected(client, "Aircraft match not found.");
        return;
      }

      const seatId = findAircraftSeat(match, client.client_id);
      if (!seatId || client.aircraftMatchId !== matchId || client.aircraftSeatId !== seatId) {
        sendAircraftActionRejected(client, "You are not in this Aircraft match.");
        return;
      }

      const playerIndex = seatId === "A" ? 0 : 1;
      const action = type === "aircraft_surrender"
        ? { game: "aircraft", schema_version: 1, action_type: "surrender", payload: {} }
        : (message.action && typeof message.action === "object" ? message.action : {});
      const actionType = String(action.action_type || action.type || "");

      if (!actionType) {
        sendAircraftActionRejected(client, "Invalid Aircraft action.");
        return;
      }

      if (actionType === "reset_battle") {
        sendAircraftActionRejected(client, "reset_battle is disabled online.");
        return;
      }

      if (actionType !== "surrender" && Number(match.state.current_player_index || 0) !== playerIndex) {
        sendAircraftActionRejected(client, "It is not your Aircraft turn.");
        return;
      }

      const beforePlayer = Array.isArray(match.state.players) ? match.state.players[playerIndex] : null;
      const actionOptions = { client_id: client.client_id };
      if (actionType === "extra_draw" && beforePlayer) {
        actionOptions.before_deck = Array.isArray(beforePlayer.deck) ? beforePlayer.deck.length : 0;
        actionOptions.before_hand = Array.isArray(beforePlayer.hand) ? beforePlayer.hand.length : 0;
      }

      let result = null;
      try {
        result = applyAircraftAction(match.state, action, actionOptions);
      } catch (error) {
        console.error("[AIRCRAFT ACTION ERROR]", error && error.stack ? error.stack : error);
        sendAircraftActionRejected(client, "Server failed while resolving Aircraft action.");
        return;
      }

      if (!result || result.ok !== true) {
        sendAircraftActionRejected(client, result && result.reason ? result.reason : "Aircraft action rejected.");
        return;
      }

      match.state = serializeAircraftState(result.state);
      match.last_action_at = Date.now();
      if (actionType === "end_turn") {
        console.log("[AIRCRAFT_STATE_CHECK] after end_turn", {
          turn_number: match.state.turn_number,
          current_player_index: match.state.current_player_index,
          p1_mana: match.state.players[0].mana,
          p1_max_mana: match.state.players[0].max_mana,
          p1_deck: match.state.players[0].deck?.length,
          p1_hand: match.state.players[0].hand?.length,
          p2_mana: match.state.players[1].mana,
          p2_max_mana: match.state.players[1].max_mana,
          p2_deck: match.state.players[1].deck?.length,
          p2_hand: match.state.players[1].hand?.length
        });
      }
      broadcastAircraftMatchState(match);

      if (match.state.battle_over) {
        sendAircraftBattleResult(match);
        cleanupAircraftMatch(matchId);
      }
      return;
    }

    case "battle_action": {
      if (!client.is_authenticated) {
        safeSend(client.ws, { type: "auth_error", message: "Authentication required." });
        return;
      }

      const matchId = String(message.match_id || "");
      const seatId = String(message.seat_id || "");
      const action = String(message.action || "");
      const payload = message.payload && typeof message.payload === "object" ? message.payload : {};

      if (!matchId || !seatId || !action) {
        sendActionRejected(client.client_id, "Invalid battle_action message.");
        return;
      }

      const match = matches.get(matchId);

      if (!match) {
        sendActionRejected(client.client_id, "Match not found.");
        return;
      }

      if (client.match_id !== matchId) {
        sendActionRejected(client.client_id, "You are not in this match.");
        return;
      }

      if (client.seat_id !== seatId) {
        sendActionRejected(client.client_id, "Invalid seat for this client.");
        return;
      }

      const enginePayload = {
        ...payload,
        action
      };

      console.log("[MANA_TRACE]", "server.battle_action.enter", JSON.stringify({
        action_type: action,
        client_id: client.client_id,
        match_id: matchId,
        seat_id: seatId,
        hand_index: payload.hand_index ?? payload.handIndex ?? payload.index ?? null,
        payload
      }));

      let result = null;

      try {
        match.state = normalizeAuthoritativeState(match.state);

        result = BattleEngine.handleBattleAction(match, seatId, enginePayload, {
          makeCardFromId,
          manaTrace: {
            action_type: action,
            client_id: client.client_id,
            match_id: matchId,
            seat_id: seatId,
            payload
          }
        });
      } catch (error) {
        console.error(
          "[BATTLE ACTION ERROR]",
          client.client_id,
          "match=",
          matchId,
          "seat=",
          seatId,
          "action=",
          action
        );
        console.error(error && error.stack ? error.stack : error);
        sendActionRejected(client.client_id, "Server failed while resolving battle action.");
        return;
      }

      if (!result || result.ok !== true) {
        console.log("[MANA_TRACE]", "server.battle_action.rejected", JSON.stringify({
          action_type: action,
          client_id: client.client_id,
          match_id: matchId,
          seat_id: seatId,
          hand_index: payload.hand_index ?? payload.handIndex ?? payload.index ?? null,
          reject_reason: result && (result.reason || result.message)
            ? (result.reason || result.message)
            : "Action rejected."
        }));
        sendActionRejected(
          client.client_id,
          result && (result.reason || result.message)
            ? (result.reason || result.message)
            : "Action rejected."
        );
        return;
      }

      match.state = normalizeAuthoritativeState(match.state);
      match.last_timer_update_at = Date.now();

      console.log("[MANA_TRACE]", "server.battle_action.accepted", JSON.stringify({
        action_type: action,
        client_id: client.client_id,
        match_id: matchId,
        seat_id: seatId,
        hand_index: payload.hand_index ?? payload.handIndex ?? payload.index ?? null
      }));

      if (match.state && match.state.game_over) {
        match.state.result_reason = action === "surrender" ? "surrender" : "normal";
      }
      broadcastMatchState(matchId);

      if (match.state && match.state.game_over) {
        destroyMatch(matchId, "Match finished.", action === "surrender" ? "surrender" : "normal");
      }

      return;
    }

    case "ping": {
      safeSend(client.ws, { type: "pong" });
      return;
    }

    default: {
      console.log("[CLIENT] Unknown message", client.client_id, message);
      sendError(client.ws, "Unknown client message type: " + type);
    }
  }
}

function handleHostMessage(host, message) {
  const type = String(message.type || "");

  switch (type) {
    case "host_ready": {
      host.ready = true;

      if (message.host_id) {
        host.host_id = String(message.host_id);
        hosts.set(host.host_id, host);
      }

      host.capacity = Number(message.capacity || 1);
      console.log("[HOST] ready ignored in Node authoritative mode", host.host_id);
      return;
    }

    case "pong":
      return;

    default:
      console.log("[HOST] Ignored message in Node authoritative mode", host.host_id, message);
  }
}

function handleDisconnect(connection) {
  if (connection.role === "client") {
    const client = connection;
    console.log("[CLIENT] disconnected", client.client_id);

    removeClientFromQueue(client.client_id);
    handleAircraftDisconnect(client);

    if (client.match_id) {
      const match = matches.get(client.match_id);

      if (match) {
        const seatId = client.seat_id;
        const otherSeatId = seatId === "A" ? "B" : "A";
        const otherSeat = match.seats[otherSeatId];

        if (seatId && match.seats[seatId]) {
          match.seats[seatId].disconnected = true;
          match.seats[seatId].disconnected_at = Date.now();
          match.state = normalizeAuthoritativeState(match.state);
          const loserPlayer = seatId === "A" ? match.state.player1 : match.state.player2;
          const winnerPlayer = otherSeatId === "A" ? match.state.player1 : match.state.player2;
          if (loserPlayer) {
            loserPlayer.hp = 0;
          }
          match.state.game_over = true;
          match.state.winner_seat = otherSeatId;
          match.state.loser_seat = seatId;
          match.state.status_message = `${loserPlayer ? loserPlayer.name : "Opponent"} disconnected. ${winnerPlayer ? winnerPlayer.name : "Opponent"} wins.`;
          match.state.result_reason = "disconnect";
          if (Array.isArray(match.state.battle_log_messages)) {
            match.state.battle_log_messages.push(match.state.status_message);
          }
          if (Array.isArray(match.state.log)) {
            match.state.log.push(match.state.status_message);
          }
        }

        console.log(
          "[MATCH] client disconnected and loses match",
          match.match_id,
          "seat=",
          seatId
        );

        if (otherSeat) {
          const otherClient = clients.get(otherSeat.client_id);

          if (otherClient && otherClient.ws) {
            safeSend(otherClient.ws, {
              type: "opponent_connection_lost",
              match_id: match.match_id,
              message: "Opponent connection was lost.",
              state: getPublicBattleState(match)
            });
          }
        }
        broadcastMatchState(match.match_id);
        destroyMatch(match.match_id, "Client disconnected.", "disconnect");
      }
    }

    clients.delete(client.client_id);
    return;
  }

  if (connection.role === "host") {
    const host = connection;
    console.log("[HOST] disconnected", host.host_id);
    hosts.delete(host.host_id);
    return;
  }

  console.log("[WS] disconnected unknown connection");
}

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const role = url.searchParams.get("role") || "client";

  if (role === "host") {
    const hostId = makeId("host", nextHostNumber++);

    const host = {
      role: "host",
      ws,
      host_id: hostId,
      ready: false,
      capacity: 1,
      current_match_id: ""
    };

    hosts.set(hostId, host);

    console.log("[HOST] connected but unused in Node authoritative mode", hostId);

    safeSend(ws, {
      type: "host_welcome",
      host_id: hostId,
      mode: "node_authoritative"
    });

    ws.on("message", (data) => {
      try {
        const text = data.toString();
        const message = safeParse(text);

        if (!message) {
          console.log("[HOST] invalid JSON from", hostId, "raw=", text);
          return;
        }

        console.log("[HOST MESSAGE]", hostId, JSON.stringify(message));
        handleHostMessage(host, message);
      } catch (error) {
        console.error("[HOST MESSAGE ERROR]", hostId);
        console.error(error && error.stack ? error.stack : error);
      }
    });

    ws.on("close", (code, reason) => {
      console.log(
        "[HOST] socket close",
        hostId,
        "code=",
        code,
        "reason=",
        reason ? reason.toString() : ""
      );

      handleDisconnect(host);
    });

    ws.on("error", (error) => {
      console.error("[HOST] socket error", hostId, error && error.stack ? error.stack : error);
    });

    return;
  }

  const clientId = makeId("client", nextClientNumber++);

  const client = {
    role: "client",
    ws,
    client_id: clientId,
    user_id: 0,
    username: "",
    display_name: "",
    is_authenticated: false,
    queued: false,
    match_id: "",
    seat_id: "",
    aircraftMatchId: "",
    aircraftSeatId: ""
  };

  clients.set(clientId, client);

  console.log("[CLIENT] connected", clientId);

  safeSend(ws, {
    type: "welcome",
    client_id: clientId
  });

  ws.on("message", (data) => {
    try {
      const text = data.toString();
      const message = safeParse(text);

      if (!message) {
        console.log("[CLIENT] invalid JSON from", clientId, "raw=", text);
        sendError(ws, "Invalid JSON.");
        return;
      }

      console.log("[CLIENT MESSAGE]", clientId, "type=", String(message.type || ""));
      console.log("[MANA_TRACE]", "server.ws_message.received", JSON.stringify({
        version: String(packageInfo.version || ""),
        commit: SERVER_COMMIT,
        client_id: clientId,
        message_type: String(message.type || ""),
        action_type: String(message.action || ""),
        match_id: String(message.match_id || ""),
        seat_id: String(message.seat_id || "")
      }));
      Promise.resolve(handleClientMessage(client, message)).catch((error) => {
        console.error("[CLIENT MESSAGE ERROR]", clientId);
        console.error(error && error.stack ? error.stack : error);
        sendError(ws, "Server failed while handling client message.");
      });
    } catch (error) {
      console.error("[CLIENT MESSAGE ERROR]", clientId);
      console.error(error && error.stack ? error.stack : error);
      sendError(ws, "Server failed while handling client message.");
    }
  });

  ws.on("close", (code, reason) => {
    console.log(
      "[CLIENT] socket close",
      clientId,
      "code=",
      code,
      "reason=",
      reason ? reason.toString() : ""
    );

    handleDisconnect(client);
  });

  ws.on("error", (error) => {
    console.error("[CLIENT] socket error", clientId, error && error.stack ? error.stack : error);
  });
});

setInterval(tickMatchTimers, MATCH_TIMER_TICK_MS);

async function startServer() {
  if (pool) {
    await authService.ensureSchema();
    await ensureRankedSchema();
    await ensureProgressionSchema();
  }

  server.listen(PORT, () => {
    console.log("[BOOT]", JSON.stringify({
      name: String(packageInfo.name || ""),
      version: String(packageInfo.version || ""),
      commit: SERVER_COMMIT,
      mana_trace_enabled: true
    }));
    console.log(`[SERVER] Node authoritative gateway + save API listening on port ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("[SERVER START ERROR]", error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
