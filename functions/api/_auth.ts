// Shared auth utilities for Agent Debugger
// Password hashing using Web Crypto API (PBKDF2)

const SESSION_COOKIE = 'ad_session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

function getHeaders(cors = true) {
  const h = { 'Content-Type': 'application/json' };
  if (cors) h['Access-Control-Allow-Origin'] = '*';
  return h;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie',
    'Access-Control-Allow-Credentials': 'true',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: getHeaders(),
  });
}

function error(msg, status = 400) {
  return json({ error: msg }, status);
}

// Handle OPTIONS preflight
function handleOptions() {
  return new Response(null, {
    headers: { ...corsHeaders(), 'Access-Control-Max-Age': '86400' },
  });
}

// Generate random bytes as hex
function randomHex(length = 32) {
  const chars = 'abcdef0123456789';
  let result = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    result += chars[array[i] % 16];
  }
  return result;
}

// Hash password with PBKDF2
async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    KEY_LENGTH * 8
  );
  const hash = Array.from(new Uint8Array(bits))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `${salt}:${hash}`;
}

// Verify password against stored hash
async function verifyPassword(password, stored) {
  const [salt] = stored.split(':');
  const computed = await hashPassword(password, salt);
  return computed === stored;
}

// Create a session for a user
async function createSession(DB, userId) {
  const sessionId = randomHex(32);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString();

  await DB.prepare(
    'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)'
  ).bind(sessionId, userId, expiresAt).run();

  return sessionId;
}

// Get session cookie string
function sessionCookie(sessionId) {
  const expires = new Date(Date.now() + SESSION_MAX_AGE * 1000).toUTCString();
  return `${SESSION_COOKIE}=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Expires=${expires}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

// Get session ID from request
function getSessionId(request) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match ? match[1] : null;
}

// Get API key from request
function getApiKey(request) {
  const auth = request.headers.get('Authorization') || '';
  return auth.replace('Bearer ', '');
}

// Validate session and return user
async function validateSession(DB, sessionId) {
  if (!sessionId) return null;

  const session = await DB.prepare(
    `SELECT s.*, u.email, u.name, u.plan
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > datetime('now')`
  ).bind(sessionId).first();

  if (!session) return null;

  // Update last active
  await DB.prepare(
    'UPDATE sessions SET last_active_at = datetime(\'now\') WHERE id = ?'
  ).bind(sessionId).run();

  return {
    id: session.user_id,
    email: session.email,
    name: session.name,
    plan: session.plan,
    session_id: sessionId,
  };
}

// Validate API key and return user/project
async function validateApiKey(DB, key) {
  if (!key) return null;

  const result = await DB.prepare(
    `SELECT ak.user_id, ak.project_id, u.email, u.name, u.plan
     FROM api_keys ak
     JOIN users u ON u.id = ak.user_id
     WHERE ak.id = ?`
  ).bind(key).first();

  if (!result) return null;

  // Update last used
  await DB.prepare(
    'UPDATE api_keys SET last_used_at = datetime(\'now\') WHERE id = ?'
  ).bind(key).run();

  return result;
}

// Authenticate request: try session first, then API key
async function authenticate(DB, request) {
  // Try session cookie
  const sessionId = getSessionId(request);
  if (sessionId) {
    const user = await validateSession(DB, sessionId);
    if (user) return { type: 'session', user };
  }

  // Try API key
  const apiKey = getApiKey(request);
  if (apiKey) {
    const result = await validateApiKey(DB, apiKey);
    if (result) {
      return {
        type: 'api_key',
        user: { id: result.user_id, email: result.email, name: result.name, plan: result.plan },
        project_id: result.project_id,
      };
    }
  }

  return null;
}

export {
  getHeaders,
  corsHeaders,
  handleOptions,
  json,
  error,
  randomHex,
  hashPassword,
  verifyPassword,
  createSession,
  sessionCookie,
  clearSessionCookie,
  getSessionId,
  getApiKey,
  validateSession,
  validateApiKey,
  authenticate,
  SESSION_COOKIE,
};
