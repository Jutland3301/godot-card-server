"use strict";

const { getBearerToken } = require("./auth_middleware");

function createAuthRoutes({ authService, readJsonBody, sendJson }) {
  async function readBodyOrReject(req, res) {
    const body = await readJsonBody(req);

    if (body === null) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON" });
      return null;
    }

    return body;
  }

  function sendAuthFailure(res, error) {
    const statusCode = Number(error && error.statusCode) || 500;

    if (statusCode >= 500) {
      throw error;
    }

    sendJson(res, statusCode, { ok: false, error: error.message });
  }

  async function register(req, res) {
    const body = await readBodyOrReject(req, res);

    if (!body) {
      return;
    }

    try {
      const result = await authService.register(body);
      sendJson(res, 200, {
        ok: true,
        user: result.user,
        token: result.token,
        gold: result.user.gold,
        tutorial_completed: result.user.tutorial_completed
      });
    } catch (error) {
      sendAuthFailure(res, error);
    }
  }

  async function login(req, res) {
    const body = await readBodyOrReject(req, res);

    if (!body) {
      return;
    }

    try {
      const result = await authService.login(body);
      console.log("[PROGRESSION_TRACE] login.http_response", JSON.stringify({
        user_id: result.user.id,
        username: result.user.username,
        user_gold: result.user.gold,
        top_level_gold: result.user.gold,
        response_includes_gold: Object.prototype.hasOwnProperty.call(result.user, "gold")
      }));
      sendJson(res, 200, {
        ok: true,
        user: result.user,
        token: result.token,
        gold: result.user.gold,
        tutorial_completed: result.user.tutorial_completed
      });
    } catch (error) {
      sendAuthFailure(res, error);
    }
  }

  async function logout(req, res) {
    await authService.revokeSession(getBearerToken(req));
    sendJson(res, 200, { ok: true });
  }

  async function me(req, res, requireAuth) {
    const user = await requireAuth(req, res);

    if (!user) {
      return;
    }

    sendJson(res, 200, {
      ok: true,
      user,
      gold: user.gold,
      tutorial_completed: user.tutorial_completed
    });
  }

  async function completeTutorial(req, res, requireAuth) {
    const user = await requireAuth(req, res);

    if (!user) {
      return;
    }

    try {
      const updatedUser = await authService.completeTutorial(user.id);
      sendJson(res, 200, {
        ok: true,
        tutorial_completed: true,
        user: updatedUser
      });
    } catch (error) {
      sendAuthFailure(res, error);
    }
  }

  return {
    register,
    login,
    logout,
    me,
    completeTutorial
  };
}

module.exports = {
  createAuthRoutes
};
