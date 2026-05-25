"use strict";

const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const SESSION_LIFETIME_DAYS = 30;
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
const PASSWORD_MIN_LENGTH = 6;
const MAX_DISPLAY_NAME_LENGTH = 40;
const BCRYPT_ROUNDS = 10;

function authError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function createAuthService({ query }) {
  let schemaPromise = null;
  let hasLegacyPasswordColumn = false;

  async function ensureSchema() {
    if (schemaPromise) {
      return await schemaPromise;
    }

    schemaPromise = (async () => {
      await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT");
      await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT");
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
      display_name: String(row.display_name || row.username)
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
    validateUsername(username);
    validatePassword(password);
    const displayName = normalizeDisplayName(rawDisplayName, username);
    const passwordHash = await hashPassword(password);

    let result;

    try {
      result = await query(
        `
        INSERT INTO users (username, password_hash, display_name, updated_at)
        VALUES ($1, $2, $3, NOW())
        RETURNING id, username, display_name
        `,
        [username, passwordHash, displayName]
      );
    } catch (error) {
      if (error.code === "23505") {
        throw authError(409, "Username already exists.");
      }

      throw error;
    }

    const user = toPublicUser(result.rows[0]);
    const token = await createSession(user.id);

    return { user, token };
  }

  async function login({ username: rawUsername, password }) {
    await ensureSchema();

    const username = String(rawUsername || "").trim();
    const selectFields = hasLegacyPasswordColumn
      ? "id, username, display_name, password_hash, password"
      : "id, username, display_name, password_hash";
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

    const user = toPublicUser(row);
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
      SELECT users.id, users.username, users.display_name
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
    getUserBySessionToken
  };
}

module.exports = {
  createAuthService
};
