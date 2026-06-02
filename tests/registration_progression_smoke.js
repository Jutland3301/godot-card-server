"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { createAuthService } = require("../auth_service");

const queries = [];
let initializedUserId = 0;

async function query(sql, params = []) {
  const normalizedSql = String(sql).replace(/\s+/g, " ").trim();
  queries.push({ sql: normalizedSql, params });

  if (normalizedSql.includes("information_schema.columns")) {
    return { rows: [] };
  }

  if (normalizedSql.startsWith("INSERT INTO users (username, password_hash, display_name, gold, updated_at)")) {
    assert.strictEqual(params[0], "starter_user");
    assert.strictEqual(params[2], "Starter User");
    assert.strictEqual(params[3], 1000);
    return {
      rows: [{
        id: 42,
        username: params[0],
        display_name: params[2],
        tutorial_completed: false,
        gold: params[3],
        role: "normal",
        is_developer: false,
        account_type: "normal"
      }]
    };
  }

  return { rows: [] };
}

(async () => {
  const authService = createAuthService({
    query,
    initializeUserProgression: async (userId) => {
      initializedUserId = userId;
    }
  });

  const result = await authService.register({
    username: "starter_user",
    password: "starter_password",
    display_name: "Starter User"
  });

  assert.strictEqual(result.user.gold, 1000);
  assert.strictEqual(initializedUserId, 42);
  assert.ok(
    queries.some(({ sql }) => sql === "ALTER TABLE users ALTER COLUMN gold SET DEFAULT 1000"),
    "Existing databases must receive the corrected gold default."
  );
  assert.ok(
    queries.some(({ sql }) => sql.startsWith("INSERT INTO users (username, password_hash, display_name, gold, updated_at)")),
    "Registration must set initial gold explicitly instead of relying on a legacy database default."
  );

  const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.ok(
    serverSource.includes("DO UPDATE SET count = GREATEST(user_cards.count, EXCLUDED.count)"),
    "Starter cards must repair partial collections instead of skipping users who already own one card."
  );
  assert.ok(
    serverSource.includes("await ensureUserProgression(user.id);"),
    "Collection reads must repair starter progression before synchronizing the client."
  );
  assert.ok(
    serverSource.includes("NOT EXISTS (SELECT 1 FROM pack_logs WHERE pack_logs.user_id = users.id)"),
    "Unused zero-gold legacy accounts must be repaired without refunding accounts that spent gold."
  );

  console.log("[REGISTRATION_PROGRESSION_SMOKE] PASS");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
