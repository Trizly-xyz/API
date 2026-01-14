const express = require('express');
const router = express.Router();
const logger = require('../src/utils/logger');
const crypto = require('crypto');

// Session store for OAuth state
const sessionStore = new Map();

// Helper functions
function jsonError(res, status, message, meta = {}) {
  logger.error('[oauth-error]', { message, status, ...meta });
  return res.status(status).json({ error: message, status });
}

function parseState(raw) {
  if (!raw) return { discordId: null, guildId: null, nonce: null, sessionId: null };
  const parts = raw.split(':');
  return {
    discordId: parts[0] || null,
    guildId: parts[1] || null,
    nonce: parts[2] || null,
    sessionId: parts[3] || null
  };
}

function normalizeWebhookUrl(url) {
  if (!url) return url;
  return url
    .replace('/api/verify/complete', '/lumi/verify/complete')
    .replace('/verify/complete', '/lumi/verify/complete');
}

// Discord OAuth callback (POST)
router.post('/verify/callback', async (req, res) => {
  try {
    const { code, state } = req.body;
    if (!code) return jsonError(res, 400, 'Missing Discord OAuth code');
    if (!state) return jsonError(res, 400, 'Missing state');

    const { discordId, guildId } = parseState(state);
    if (!discordId || !guildId) {
      return jsonError(res, 400, 'Invalid state format (expected discordId:guildId)', { state });
    }

    const discordIdRegex = /^\d{17,19}$/;
    if (!discordIdRegex.test(discordId) || !discordIdRegex.test(guildId)) {
      return jsonError(res, 400, 'Invalid Discord ID format');
    }

    let sessionId = null;
    try {
      const tokenForm = new URLSearchParams();
      tokenForm.append('client_id', process.env.DISCORD_CLIENT_ID);
      tokenForm.append('client_secret', process.env.DISCORD_CLIENT_SECRET);
      tokenForm.append('grant_type', 'authorization_code');
      tokenForm.append('code', code);
      tokenForm.append('redirect_uri', `${req.protocol}://${req.get('host')}/verify/callback`);

      const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenForm.toString()
      });

      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        if (tokenData.access_token) {
          sessionId = crypto.randomUUID();
          sessionStore.set(`token_${sessionId}`, JSON.stringify({
            discordId,
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            expiresIn: tokenData.expires_in,
            timestamp: Date.now()
          }));
          logger.info('[discord-callback] Stored OAuth tokens', { discordId, sessionId });
        }
      }
    } catch (err) {
      logger.error('[discord-callback] Token exchange failed:', err.message);
    }

    const nonce = crypto.randomUUID().slice(0, 8);
    const enrichedState = sessionId ? `${discordId}:${guildId}:${nonce}:${sessionId}` : `${discordId}:${guildId}:${nonce}`;
    const origin = `${req.protocol}://${req.get('host')}`;
    const nextRobloxStartUrl = `${origin}/verify/roblox/start?state=${encodeURIComponent(enrichedState)}`;
    const oldSessionId = crypto.randomUUID();
    sessionStore.set(oldSessionId, enrichedState);

    return res.json({ status: 'ok', session: oldSessionId, state: enrichedState, nextRobloxStartUrl });
  } catch (e) {
    logger.error('[discord-callback] UNHANDLED ERROR:', e);
    return jsonError(res, 500, 'Internal error processing Discord callback', { error: e.message });
  }
});

// Discord OAuth callback (GET)
router.get('/verify/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code) return jsonError(res, 400, 'Missing Discord OAuth code');
    if (!state) return jsonError(res, 400, 'Missing state');

    const { discordId, guildId } = parseState(state);
    if (!discordId || !guildId) {
      return jsonError(res, 400, 'Invalid state format (expected discordId:guildId)', { state });
    }

    const discordIdRegex = /^\d{17,19}$/;
    if (!discordIdRegex.test(discordId) || !discordIdRegex.test(guildId)) {
      logger.error('[discord-callback-GET] Invalid ID format:', { discordId, guildId });
      return jsonError(res, 400, 'Invalid Discord ID format');
    }

    const nonce = crypto.randomUUID().slice(0, 8);
    const enrichedState = `${discordId}:${guildId}:${nonce}`;
    const origin = `${req.protocol}://${req.get('host')}`;
    const nextRobloxStartUrl = `${origin}/verify/roblox/start?state=${encodeURIComponent(enrichedState)}`;

    return res.redirect(nextRobloxStartUrl);
  } catch (e) {
    logger.error('[discord-callback-GET] UNHANDLED ERROR:', e);
    return jsonError(res, 500, 'Internal error processing Discord callback (GET)', { error: e.message });
  }
});

// Roblox OAuth start
router.get('/verify/roblox/start', (req, res) => {
  let state = req.query.state || null;
  if (!state || state === 'undefined' || state === 'null' || state === 'NaN') state = null;
  
  if (!state) {
    const sessionParam = req.query.session;
    if (sessionParam && sessionParam !== 'undefined' && sessionParam !== 'null' && sessionParam !== 'NaN') {
      const mapped = sessionStore.get(sessionParam);
      if (mapped) state = mapped;
    }
  }

  if (!state) {
    logger.error('[roblox-start] missing state; user must start from Discord OAuth');
    return jsonError(res, 400, 'Missing state; start verification from Discord');
  }

  const parsed = parseState(state);
  if (!parsed.discordId || !parsed.guildId) {
    logger.error('[roblox-start] invalid state; user must start from Discord OAuth', { state, parsed });
    return jsonError(res, 400, 'Invalid state; start verification from Discord');
  }

  const params = new URLSearchParams({
    client_id: process.env.ROBLOX_CLIENT_ID,
    response_type: 'code',
    redirect_uri: process.env.ROBLOX_REDIRECT_URI,
    scope: 'openid profile',
    state
  });

  const redirectUrl = `https://apis.roblox.com/oauth/v1/authorize?${params}`;
  return res.redirect(redirectUrl);
});

// Roblox OAuth callback
router.get('/verify/roblox/callback', async (req, res) => {
  try {
    if (!process.env.VERIFY_WEBHOOK_URL) {
      logger.error("❌ VERIFY_WEBHOOK_URL missing");
    }
    if (!process.env.VERIFY_WEBHOOK_SECRET) {
      logger.error("❌ VERIFY_WEBHOOK_SECRET missing");
    }
    if (!process.env.ROBLOX_REDIRECT_URI) {
      logger.error("❌ ROBLOX_REDIRECT_URI missing");
    }

    const { code, state } = req.query;
    if (!code) return jsonError(res, 400, "Missing code");
    if (!state) return jsonError(res, 400, "Missing state");

    const { discordId, guildId, sessionId } = parseState(state);
    if (!discordId || !guildId) {
      return jsonError(res, 400, "Invalid state", { state });
    }

    const snowflake = /^\d{17,19}$/;
    if (!snowflake.test(discordId) || !snowflake.test(guildId)) {
      return jsonError(res, 400, "Invalid Discord ID");
    }

    let discordTokens = null;
    if (sessionId) {
      const tokenStr = sessionStore.get(`token_${sessionId}`);
      if (tokenStr) {
        try {
          discordTokens = JSON.parse(tokenStr);
          sessionStore.delete(`token_${sessionId}`);
          logger.info('[roblox-callback] Retrieved Discord OAuth tokens', { discordId, sessionId });
        } catch (e) {
          logger.error('[roblox-callback] Failed to parse token data:', e);
        }
      }
    }

    const form = new URLSearchParams();
    form.append("grant_type", "authorization_code");
    form.append("code", code);
    form.append("redirect_uri", process.env.ROBLOX_REDIRECT_URI);

    const basic = Buffer.from(`${process.env.ROBLOX_CLIENT_ID}:${process.env.ROBLOX_CLIENT_SECRET}`).toString('base64');

    const tokenRes = await fetch("https://apis.roblox.com/oauth/v1/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "Accept": "application/json",
        "Authorization": `Basic ${basic}`
      },
      body: form.toString()
    });

    const tokenBody = await tokenRes.text();
    if (!tokenRes.ok) return jsonError(res, 500, "Roblox OAuth token error");

    const tokenData = JSON.parse(tokenBody);
    if (!tokenData.access_token) {
      return jsonError(res, 500, "Missing access_token", { raw: tokenBody });
    }

    const userRes = await fetch("https://apis.roblox.com/oauth/v1/userinfo", {
      headers: { "Authorization": `Bearer ${tokenData.access_token}` }
    });

    const userText = await userRes.text();
    if (!userRes.ok) return jsonError(res, 500, "Roblox userinfo error");

    let user;
    try {
      user = JSON.parse(userText);
    } catch {
      return jsonError(res, 500, "Failed to parse userinfo", { raw: userText });
    }

    const payload = {
      discordId,
      guildId,
      robloxId: user.sub,
      robloxUsername: user.name,
      isSynthetic: false
    };

    if (discordTokens && discordTokens.accessToken) {
      payload.discordAccessToken = discordTokens.accessToken;
      payload.discordRefreshToken = discordTokens.refreshToken;
      payload.discordTokenExpiresIn = discordTokens.expiresIn;
      payload.discordTokenTimestamp = discordTokens.timestamp;
      logger.info('[roblox-callback] Including Discord OAuth tokens in webhook');
    }

    const lumiApiUrl = process.env.LUMI_API_URL || 'http://37.27.141.177:22028';
    const defaultWebhookUrl = `${lumiApiUrl}/lumi/verify/complete`;
    const rawWebhookUrl = process.env.VERIFY_WEBHOOK_URL;
    const webhookUrl = normalizeWebhookUrl(rawWebhookUrl) || defaultWebhookUrl;

    const bodyString = JSON.stringify(payload);

    let webhookRes;
    let fetchError = null;
    const webhookStartTime = Date.now();

    try {
      webhookRes = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
          'X-Verify-Secret': process.env.VERIFY_WEBHOOK_SECRET || 'TrizlyDEVKEY999'
        },
        body: bodyString,
        signal: AbortSignal.timeout(20000)
      });
    } catch (err) {
      fetchError = err;
      logger.error('[webhook] Fetch error:', err.message);
    }

    const webhookDuration = Date.now() - webhookStartTime;
    logger.info('[webhook] Completed', { duration: webhookDuration, url: webhookUrl });

    if (fetchError) {
      return res.redirect(`${req.protocol}://${req.get('host')}/verify/failure?error=webhook_timeout`);
    }

    if (!webhookRes || !webhookRes.ok) {
      const statusCode = webhookRes ? webhookRes.status : 500;
      logger.error('[webhook] Non-OK response', { status: statusCode, url: webhookUrl });
      return res.redirect(`${req.protocol}://${req.get('host')}/verify/failure?error=webhook_error&status=${statusCode}`);
    }

    let webhookData;
    try {
      webhookData = await webhookRes.json();
    } catch {
      logger.error('[webhook] Failed to parse JSON response');
      return res.redirect(`${req.protocol}://${req.get('host')}/verify/failure?error=invalid_response`);
    }

    logger.info('[verification] Success', { discordId, robloxId: user.sub });
    return res.redirect(`${req.protocol}://${req.get('host')}/verify/success`);

  } catch (e) {
    logger.error('[roblox-callback] UNHANDLED ERROR:', e);
    return jsonError(res, 500, 'Internal error processing Roblox callback', { error: e.message });
  }
});

// Unlink start
router.get('/unlink/start', (req, res) => {
  const discordId = req.query.discordId;
  if (!discordId) {
    return jsonError(res, 400, 'Missing discordId');
  }

  const snowflake = /^\d{17,19}$/;
  if (!snowflake.test(discordId)) {
    return jsonError(res, 400, 'Invalid Discord ID format');
  }

  const state = `unlink:${discordId}:${crypto.randomUUID().slice(0, 8)}`;
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    response_type: 'code',
    redirect_uri: `${req.protocol}://${req.get('host')}/unlink/callback`,
    scope: 'identify',
    state
  });

  const authUrl = `https://discord.com/oauth2/authorize?${params}`;
  return res.redirect(authUrl);
});

// Unlink callback
router.get('/unlink/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code) return jsonError(res, 400, 'Missing code');
    if (!state || !state.startsWith('unlink:')) {
      return jsonError(res, 400, 'Invalid state');
    }

    const parts = state.split(':');
    const discordId = parts[1];
    if (!discordId) return jsonError(res, 400, 'Invalid state format');

    const snowflake = /^\d{17,19}$/;
    if (!snowflake.test(discordId)) {
      return jsonError(res, 400, 'Invalid Discord ID');
    }

    const tokenForm = new URLSearchParams();
    tokenForm.append('client_id', process.env.DISCORD_CLIENT_ID);
    tokenForm.append('client_secret', process.env.DISCORD_CLIENT_SECRET);
    tokenForm.append('grant_type', 'authorization_code');
    tokenForm.append('code', code);
    tokenForm.append('redirect_uri', `${req.protocol}://${req.get('host')}/unlink/callback`);

    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenForm.toString()
    });

    if (!tokenRes.ok) {
      logger.error('[unlink] Token exchange failed:', await tokenRes.text());
      return res.redirect(`${req.protocol}://${req.get('host')}/unlink/failure?error=token_error`);
    }

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return res.redirect(`${req.protocol}://${req.get('host')}/unlink/failure?error=no_token`);
    }

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
    });

    if (!userRes.ok) {
      logger.error('[unlink] User fetch failed:', await userRes.text());
      return res.redirect(`${req.protocol}://${req.get('host')}/unlink/failure?error=user_error`);
    }

    const userData = await userRes.json();
    if (userData.id !== discordId) {
      logger.error('[unlink] Discord ID mismatch', { expected: discordId, actual: userData.id });
      return jsonError(res, 403, 'Discord ID mismatch');
    }

    const lumiApiUrl = process.env.LUMI_API_URL || 'http://37.27.141.177:22028';
    const unlinkUrl = `${lumiApiUrl}/lumi/unlink`;

    const unlinkRes = await fetch(unlinkUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Verify-Secret': process.env.VERIFY_WEBHOOK_SECRET || 'TrizlyDEVKEY999'
      },
      body: JSON.stringify({ discordId }),
      signal: AbortSignal.timeout(20000)
    });

    if (!unlinkRes.ok) {
      const errorText = await unlinkRes.text();
      logger.error('[unlink] Lumi API error:', { status: unlinkRes.status, error: errorText });
      return res.redirect(`${req.protocol}://${req.get('host')}/unlink/failure?error=api_error`);
    }

    logger.info('[unlink] Success', { discordId });
    return res.redirect(`${req.protocol}://${req.get('host')}/unlink/success`);

  } catch (e) {
    logger.error('[unlink-callback] UNHANDLED ERROR:', e);
    return res.redirect(`${req.protocol}://${req.get('host')}/unlink/failure?error=internal_error`);
  }
});

module.exports = router;
