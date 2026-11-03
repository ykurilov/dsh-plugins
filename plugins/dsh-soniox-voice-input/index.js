/**
 * Host half of the Soniox voice input bundle.
 *
 * The browser must never hold the long-lived Soniox key, so this half only
 * publishes two routes on the existing Web server: a readiness probe and a
 * minter for short-lived, single-use temporary API keys scoped to
 * `transcribe_websocket`. The Client module streams microphone audio straight
 * to Soniox with the temporary key.
 */
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Speech-to-text Web server is required; the plugin stays inactive without it. */
export const inject = ['webServer']

const SONIOX_TEMPORARY_KEY_URL = 'https://api.soniox.com/v1/auth/temporary-api-key'
const STATUS_PATH = '/soniox-voice/status'
const TEMPORARY_KEY_PATH = '/soniox-voice/temporary-key'
/** Checked in order when no explicit `apiKeyFile` is configured. */
const KEY_FILE_CANDIDATES = [
  join(homedir(), '.codex', 'secrets', 'soniox-api-key.txt'),
  join(homedir(), '.config', 'soniox', '.env'),
]
const DEFAULT_MODEL = 'stt-rt-v5'
const DEFAULT_LANGUAGE_HINTS = ['ru', 'en']
const DEFAULT_MAX_SESSION_SECONDS = 900

/** Resolve a `~/`-prefixed path against the host user's home directory. */
function expandHome(path) {
  if (typeof path !== 'string' || path === '') return undefined
  if (path === '~') return homedir()
  if (path.startsWith('~/')) return join(homedir(), path.slice(2))
  return path
}

/** Accept a bare key file or an `SONIOX_API_KEY=...` line in an env file. */
function keyFromFileContent(text) {
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?SONIOX_API_KEY\s*=\s*(.+?)\s*$/.exec(line)
    if (match !== null) return match[1].replace(/^["']|["']$/g, '').trim()
  }
  const bare = text.trim()
  return bare.includes('\n') || bare === '' ? undefined : bare
}

/** Read the resolver inputs once per activation; the key itself is read per request. */
function resolveSettings(config) {
  const source = config !== null && typeof config === 'object' ? config : {}
  const model = typeof source.model === 'string' && source.model.trim() !== '' ? source.model.trim() : DEFAULT_MODEL
  const hints = Array.isArray(source.languageHints)
    ? source.languageHints.filter((hint) => typeof hint === 'string' && hint.trim() !== '').map((hint) => hint.trim())
    : DEFAULT_LANGUAGE_HINTS
  const maxSessionDurationSeconds =
    Number.isFinite(source.maxSessionDurationSeconds) && source.maxSessionDurationSeconds >= 30
      ? Math.floor(source.maxSessionDurationSeconds)
      : DEFAULT_MAX_SESSION_SECONDS
  const configuredFile = expandHome(typeof source.apiKeyFile === 'string' ? source.apiKeyFile : undefined)
  const apiKeyFiles = configuredFile === undefined ? KEY_FILE_CANDIDATES : [configuredFile]
  const inlineApiKey = typeof source.apiKey === 'string' && source.apiKey.trim() !== '' ? source.apiKey.trim() : undefined
  return { model, languageHints: hints.length > 0 ? hints : DEFAULT_LANGUAGE_HINTS, maxSessionDurationSeconds, apiKeyFiles, inlineApiKey }
}

/** Answer a request that the connection's trust policy rejects; true when it did. */
function rejected(ctx, req, res) {
  const connection = ctx.get('connection')
  if (connection === undefined || typeof connection.requestRejection !== 'function') return false
  let rejection
  try {
    rejection = connection.requestRejection(req)
  } catch {
    return false
  }
  if (rejection === undefined) return false
  res.statusCode = typeof rejection === 'number' ? rejection : 401
  res.end()
  return true
}

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

/** First available key: explicit config, then the environment, then the secrets file. */
async function resolveApiKey(settings) {
  if (settings.inlineApiKey !== undefined) return { key: settings.inlineApiKey, source: 'config' }
  const fromEnv = process.env.SONIOX_API_KEY
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return { key: fromEnv.trim(), source: 'env' }
  for (const file of settings.apiKeyFiles) {
    try {
      const key = keyFromFileContent(await readFile(file, 'utf8'))
      if (key !== undefined && key !== '') return { key, source: 'file', file }
    } catch {
      // A missing file is the ordinary "not set up yet" state.
    }
  }
  return undefined
}

export function apply(ctx, config) {
  const settings = resolveSettings(config)

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: STATUS_PATH,
        handler: async (req, res) => {
          if (rejected(ctx, req, res)) return
          if (req.method !== 'GET') {
            res.statusCode = 405
            res.setHeader('allow', 'GET')
            res.end()
            return
          }
          const found = await resolveApiKey(settings)
          sendJson(res, 200, {
            configured: found !== undefined,
            source: found === undefined ? null : found.source,
            keyFile: found === undefined ? settings.apiKeyFiles[0] : found.file || settings.apiKeyFiles[0],
            model: settings.model,
            languageHints: settings.languageHints,
          })
        },
      }),
    `soniox-voice-input: GET ${STATUS_PATH}`,
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: TEMPORARY_KEY_PATH,
        handler: async (req, res) => {
          if (rejected(ctx, req, res)) return
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.setHeader('allow', 'POST')
            res.end()
            return
          }
          const found = await resolveApiKey(settings)
          if (found === undefined) {
            sendJson(res, 409, {
              code: 'not-configured',
              message: `No Soniox API key. Save it to ${settings.apiKeyFiles[0]} or set SONIOX_API_KEY.`,
            })
            return
          }
          let upstream
          try {
            upstream = await fetch(SONIOX_TEMPORARY_KEY_URL, {
              method: 'POST',
              headers: {
                authorization: `Bearer ${found.key}`,
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                usage_type: 'transcribe_websocket',
                expires_in_seconds: 120,
                single_use: true,
                max_session_duration_seconds: settings.maxSessionDurationSeconds,
                client_reference_id: 'dsh-soniox-voice-input',
              }),
              signal: AbortSignal.timeout(15000),
            })
          } catch (error) {
            console.error('soniox-voice-input: temporary key request failed', error)
            sendJson(res, 502, { code: 'upstream-unreachable', message: 'Could not reach Soniox.' })
            return
          }
          const body = await upstream.json().catch(() => null)
          if (!upstream.ok) {
            const message =
              body !== null && typeof body === 'object' && typeof body.message === 'string'
                ? body.message
                : `Soniox answered ${upstream.status}.`
            console.error('soniox-voice-input: temporary key rejected', upstream.status, message)
            sendJson(res, upstream.status === 401 || upstream.status === 403 ? 401 : 502, {
              code: upstream.status === 401 || upstream.status === 403 ? 'unauthorized' : 'upstream-error',
              message,
            })
            return
          }
          if (body === null || typeof body !== 'object' || typeof body.api_key !== 'string') {
            sendJson(res, 502, { code: 'upstream-shape', message: 'Soniox returned no temporary key.' })
            return
          }
          sendJson(res, 200, {
            apiKey: body.api_key,
            expiresAt: typeof body.expires_at === 'string' ? body.expires_at : null,
            model: settings.model,
            languageHints: settings.languageHints,
            maxSessionDurationSeconds: settings.maxSessionDurationSeconds,
          })
        },
      }),
    `soniox-voice-input: POST ${TEMPORARY_KEY_PATH}`,
  )
}
