"use strict";

function getBearerToken(req) {
  const authorization = String(req.headers.authorization || "");

  if (!authorization.startsWith("Bearer ")) {
    return "";
  }

  return authorization.slice("Bearer ".length).trim();
}

function createAuthMiddleware({ authService, sendJson }) {
  async function getUserByRequest(req) {
    return await authService.getUserBySessionToken(getBearerToken(req));
  }

  async function requireAuth(req, res) {
    const user = await getUserByRequest(req);

    if (!user) {
      sendJson(res, 401, { ok: false, error: "Unauthorized" });
      return null;
    }

    req.user = user;
    return user;
  }

  return {
    getBearerToken,
    getUserByRequest,
    requireAuth
  };
}

module.exports = {
  createAuthMiddleware,
  getBearerToken
};
