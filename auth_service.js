"use strict";

const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const SESSION_LIFETIME_DAYS = 30;
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
const PASSWORD_MIN_LENGTH = 6;
const MAX_DISPLAY_NAME_LENGTH = 40;
const BCRYPT_ROUNDS = 10;
const INITIAL_GOLD = 1000;

function authError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function createAuthService({ query, initializeUserProgression = null }) {
  let schemaPromise = null;
  let hasLegacyPasswordColumn = false;

  async function ensureSchema() {
    if (schemaPromise) {
      return await schemaPromise;
    }

    schemaPromise = (async () => {
      await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT");
      await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT");
      await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS tutorial_completed BOOLEAN NOT NULL DEFAULT FALSE");
      await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS gold INTEGER NOT NULL DEFAULT 1000");
      await query("ALTER TABLE users ALTER COLUMN gold SET DEFAULT 1000");
      await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'normal'");
      await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_developer BOOLEAN NOT NULL DEFAULT FALSE");
      await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'normal'");
      await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()");
      await query(`
        UPDATE users
        SET display_name = username
        WHERE display_name IS NULL OR BTRIM(display_name) = ''
      `);

      const legacyColumn = await query(`
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'password'
        LIMIT 1
      `);
      hasLegacyPasswordColumn = legacyColumn.rows.length > 0;

      if (hasLegacyPasswordColumn) {
        await query("ALTER TABLE users ALTER COLUMN password DROP NOT NULL");
      }

      await query(`
        CREATE TABLE IF NOT EXISTS user_sessions (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMPTZ NOT NULL,
          revoked_at TIMESTAMPTZ NULL
        )
      `);
      await query("CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)");
      await query("CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash)");
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });

    return await schemaPromise;
  }

  function validateUsername(username) {
    if (!USERNAME_PATTERN.test(String(username || ""))) {
      throw authError(
        400,
        "Username must be 3-20 characters using letters, numbers, or underscore."
      );
    }
  }

  function validatePassword(password) {
    if (String(password || "").length < PASSWORD_MIN_LENGTH) {
      throw authError(400, "Password must be at least 6 characters.");
    }
  }

  function normalizeDisplayName(displayName, username) {
    const normalized = String(displayName || "").trim() || username;

    if (normalized.length > MAX_DISPLAY_NAME_LENGTH) {
      throw authError(400, "Display name must be 40 characters or fewer.");
    }

    return normalized;
  }

  async function hashPassword(password) {
    return await bcrypt.hash(String(password), BCRYPT_ROUNDS);
  }

  async function verifyPassword(password, passwordHash) {
    if (!passwordHash) {
      return false;
    }

    return await bcrypt.compare(String(password), String(passwordHash));
  }

  function generateSessionToken() {
    return crypto.randomBytes(32).toString("base64url");
  }

  function hashSessionToken(token) {
    return crypto.createHash("sha256").update(String(token)).digest("hex");
  }

  function toPublicUser(row) {
    return {
      id: Number(row.id),
      username: String(row.username),
      display_name: String(row.display_name || row.username),
      tutorial_completed: Boolean(row.tutorial_completed),
      gold: Number(row.gold || 0),
      role: String(row.role || "normal"),
      is_developer: Boolean(row.is_developer),
      account_type: String(row.account_type || row.role || "normal")
    };
  }

  async function getPublicUserById(userId) {
    const result = await query(
      `
      SELECT id, username, display_name, tutorial_completed, gold, role, is_developer, account_type
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [userId]
    );
    return result.rows.length > 0 ? toPublicUser(result.rows[0]) : null;
  }

  async function getOwnedCardSummary(userId) {
    const result = await query(
      `
      SELECT COUNT(*)::INTEGER AS rows_count,
             COALESCE(SUM(count), 0)::INTEGER AS total_owned_count
      FROM user_cards
      WHERE user_id = $1
      `,
      [userId]
    );
    const row = result.rows[0] || {};
    return {
      rows_count: Number(row.rows_count || 0),
      total_owned_count: Number(row.total_owned_count || 0)
    };
  }

  async function createSession(userId) {
    const token = generateSessionToken();
    const tokenHash = hashSessionToken(token);
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_DAYS * 24 * 60 * 60 * 1000);

    await query(
      `
      INSERT INTO user_sessions (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
      `,
      [userId, tokenHash, expiresAt]
    );

    return token;
  }

  async function register({ username: rawUsername, password, display_name: rawDisplayName }) {
    await ensureSchema();

    const username = String(rawUsername || "").trim();
    console.log("[PROGRESSION_TRACE] register.start", JSON.stringify({
      username,
      is_developer: false,
      account_type: "normal",
      role: "normal",
      initial_gold: INITIAL_GOLD
    }));
    validateUsername(username);
    validatePassword(password);
    const displayName = normalizeDisplayName(rawDisplayName, username);
    const passwordHash = await hashPassword(password);

    let result;

    try {
      result = await query(
        `
        INSERT INTO users (username, password_hash, display_name, gold, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        RETURNING id, username, display_name, tutorial_completed, gold, role, is_developer, account_type
        `,
        [username, passwordHash, displayName, INITIAL_GOLD]
      );
    } catch (error) {
      if (error.code === "23505") {
        throw authError(409, "Username already exists.");
      }

      throw error;
    }

    let user = toPublicUser(result.rows[0]);
    if (initializeUserProgression) {
      await initializeUserProgression(user.id);
      user = await getPublicUserById(user.id) || user;
    }
    const ownedSummary = await getOwnedCardSummary(user.id);
    console.log("[PROGRESSION_TRACE] register.done", JSON.stringify({
      user_id: user.id,
      username: user.username,
      db_gold: user.gold,
      starter_grant_called: Boolean(initializeUserProgression),
      starter_grant_rows_count: ownedSummary.rows_count,
      total_owned_count: ownedSummary.total_owned_count,
      role: user.role,
      is_developer: user.is_developer,
      account_type: user.account_type
    }));
    const token = await createSession(user.id);

    return { user, token };
  }

  async function login({ username: rawUsername, password }) {
    await ensureSchema();

    const username = String(rawUsername || "").trim();
    const selectFields = hasLegacyPasswordColumn
      ? "id, username, display_name, tutorial_completed, gold, role, is_developer, account_type, password_hash, password"
      : "id, username, display_name, tutorial_completed, gold, role, is_developer, account_type, password_hash";
    const result = await query(
      `SELECT ${selectFields} FROM users WHERE username = $1 LIMIT 1`,
      [username]
    );

    if (result.rows.length <= 0) {
      throw authError(401, "Invalid username or password.");
    }

    const row = result.rows[0];
    let passwordValid = await verifyPassword(password, row.password_hash);

    if (!passwordValid && hasLegacyPasswordColumn && row.password_hash == null) {
      passwordValid = String(row.password || "") === String(password || "");

      if (passwordValid) {
        const upgradedHash = await hashPassword(password);
        await query(
          `
          UPDATE users
          SET password_hash = $1, password = NULL,
              display_name = COALESCE(NULLIF(BTRIM(display_name), ''), username),
              updated_at = NOW()
          WHERE id = $2
          `,
          [upgradedHash, row.id]
        );
      }
    }

    if (!passwordValid) {
      throw authError(401, "Invalid username or password.");
    }

    let user = toPublicUser(row);
    if (initializeUserProgression) {
      await initializeUserProgression(user.id);
      user = await getPublicUserById(user.id) || user;
    }
    const ownedSummary = await getOwnedCardSummary(user.id);
    console.log("[PROGRESSION_TRACE] login.response", JSON.stringify({
      user_id: user.id,
      username: user.username,
      db_gold: user.gold,
      role: user.role,
      is_developer: user.is_developer,
      account_type: user.account_type,
      user_cards_rows_count: ownedSummary.rows_count,
      total_owned_count: ownedSummary.total_owned_count,
      response_includes_gold: Object.prototype.hasOwnProperty.call(user, "gold")
    }));
    const token = await createSession(user.id);

    return { user, token };
  }

  async function getUserBySessionToken(token) {
    if (!String(token || "").trim()) {
      return null;
    }

    await ensureSchema();

    const result = await query(
      `
      SELECT users.id, users.username, users.display_name, users.tutorial_completed,
             users.gold, users.role, users.is_developer, users.account_type
      FROM user_sessions
      INNER JOIN users ON users.id = user_sessions.user_id
      WHERE user_sessions.token_hash = $1
        AND user_sessions.revoked_at IS NULL
        AND user_sessions.expires_at > NOW()
      LIMIT 1
      `,
      [hashSessionToken(token)]
    );

    if (result.rows.length <= 0) {
      return null;
    }

    return toPublicUser(result.rows[0]);
  }

  async function revokeSession(token) {
    if (!String(token || "").trim()) {
      return;
    }

    await ensureSchema();
    await query(
      `
      UPDATE user_sessions
      SET revoked_at = COALESCE(revoked_at, NOW())
      WHERE token_hash = $1
      `,
      [hashSessionToken(token)]
    );
  }

  async function completeTutorial(userId) {
    await ensureSchema();

    const result = await query(
      `
      UPDATE users
      SET tutorial_completed = TRUE, updated_at = NOW()
      WHERE id = $1
      RETURNING id, username, display_name, tutorial_completed, gold, role, is_developer, account_type
      `,
      [userId]
    );

    if (result.rows.length <= 0) {
      throw authError(404, "User not found.");
    }

    return toPublicUser(result.rows[0]);
  }

  async function seedDeveloperAccount({ username, password, display_name = "" }) {
    await ensureSchema();
    validateUsername(username);
    validatePassword(password);
    const displayName = normalizeDisplayName(display_name, username);
    const passwordHash = await hashPassword(password);
    const result = await query(
      `INSERT INTO users
        (username, password_hash, display_name, role, is_developer, account_type, gold, updated_at)
       VALUES ($1, $2, $3, 'developer', TRUE, 'developer', 1000, NOW())
       ON CONFLICT (username)
       DO UPDATE SET password_hash = EXCLUDED.password_hash,
                     display_name = EXCLUDED.display_name,
                     role = 'developer', is_developer = TRUE, account_type = 'developer',
                     updated_at = NOW()
       RETURNING id, username, display_name, tutorial_completed, gold, role, is_developer, account_type`,
      [username, passwordHash, displayName]
    );
    return toPublicUser(result.rows[0]);
  }

  return {
    ensureSchema,
    validateUsername,
    validatePassword,
    hashPassword,
    verifyPassword,
    generateSessionToken,
    hashSessionToken,
    createSession,
    register,
    login,
    revokeSession,
    getUserBySessionToken,
    completeTutorial,
    seedDeveloperAccount
  };
}

module.exports = {
  createAuthService
};
