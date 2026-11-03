/**
 * Host half of the Sidebar Browser DOM bridge.
 *
 * The right-Sidebar browser is an Electron `<webview>`: its page lives in
 * another renderer, so only the Client process holds a DOM handle. This module
 * therefore owns two things:
 *
 * 1. `sidebar_browser` — one model-facing tool with an `action` switch.
 * 2. A private HTTP endpoint the Client polls (`next`) and answers (`result`).
 *    The same path works for both carriers: Desktop forwards every unknown
 *    `dsh-app://app/...` request to the loopback Host, and Web serves it from
 *    the listener directly. Requests are admitted through `ctx.connection` so
 *    they carry the browser peer's authority.
 *
 * The shipped `ctx.connection.rpc.handle()` helper cannot be used here: it
 * registers its route through the Connection plugin's own context, which does
 * not declare the `webServer` service, so it throws for every consumer plugin.
 */

import { execFile } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CHANNEL = '/sidebar-browser-dom';

/** How long a recent Client poll keeps the bridge considered alive. */
const CLIENT_FRESH_MS = 8_000;

const ACTIONS = [
  'status',
  'snapshot',
  'read',
  'click',
  'type',
  'select',
  'press',
  'scroll',
  'eval',
  'wait',
  'navigate',
  'reload',
  'open',
  'screenshot',
];

const queue = [];
const waiters = [];
const pending = new Map();

let nextId = 1;
let lastContact = 0;

function touch() {
  lastContact = Date.now();
}

function publish() {
  while (waiters.length > 0 && queue.length > 0) {
    const waiter = waiters.shift();
    if (waiter.done) continue;
    waiter.done = true;
    clearTimeout(waiter.timer);
    waiter.resolve(queue.shift());
  }
}

/** Hand one queued command to a polling Client, waiting a bounded time when idle. */
function takeCommand(waitMs) {
  touch();
  if (queue.length > 0) return Promise.resolve(queue.shift());
  const bounded = Math.min(Math.max(Number(waitMs) || 8_000, 0), 20_000);
  return new Promise((resolve) => {
    const waiter = { done: false, resolve, timer: undefined };
    waiter.timer = setTimeout(() => {
      if (waiter.done) return;
      waiter.done = true;
      const index = waiters.indexOf(waiter);
      if (index >= 0) waiters.splice(index, 1);
      resolve(null);
    }, bounded);
    waiters.push(waiter);
  });
}

/** Queue one command for the Client and settle when it reports a result. */
function enqueue(command, timeoutMs) {
  if (Date.now() - lastContact > CLIENT_FRESH_MS) {
    throw new Error(
      'The right-Sidebar browser is not answering: this DSH window is not running the DOM bridge. Reload the window (the bridge reconnects on its own) and try again.',
    );
  }
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`sidebar browser did not answer "${command.action}" within ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    timer.unref?.();
    pending.set(id, { resolve, reject, timer });
    queue.push({ id, ...command });
    publish();
  });
}

/** Answer one bridge request. */
async function bridge(endpoint, payload) {
  if (endpoint === 'next') return takeCommand(payload?.waitMs);
  if (endpoint === 'result') {
    touch();
    const id = Number(payload?.id);
    const entry = pending.get(id);
    if (entry === undefined) return { accepted: false };
    pending.delete(id);
    clearTimeout(entry.timer);
    if (payload?.ok === true) {
      entry.resolve(payload.value);
    } else {
      const message = typeof payload?.error === 'string' && payload.error.length > 0 ? payload.error : 'sidebar browser command failed';
      entry.reject(new Error(message));
    }
    return { accepted: true };
  }
  throw new Error(`sidebar browser bridge: unknown endpoint ${JSON.stringify(endpoint)}`);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new Error('bridge request is too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    request.on('error', reject);
  });
}

function writeJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
  });
  response.end(body);
}

/** Serve one `/sidebar-browser-dom/<endpoint>` call from the Client. */
async function serve(ctx, request, response) {
  let admission;
  try {
    admission = ctx.connection.admit(request);
  } catch (error) {
    writeJson(response, 500, { error: String((error && error.message) || error) });
    return;
  }
  if (admission !== undefined && 'rejection' in admission) {
    response.writeHead(admission.rejection);
    response.end(admission.rejection === 401 ? 'unauthorized' : 'forbidden');
    return;
  }
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const endpoint = url.pathname.startsWith(`${CHANNEL}/`) ? url.pathname.slice(CHANNEL.length + 1) : '';
  if (request.method !== 'POST' || endpoint.length === 0 || endpoint.includes('/')) {
    response.writeHead(404);
    response.end('not found');
    return;
  }
  let body;
  try {
    body = JSON.parse(await readBody(request));
  } catch (_error) {
    response.writeHead(400);
    response.end('body is not JSON');
    return;
  }
  const rpcId = body !== null && typeof body === 'object' && typeof body.rpcId === 'string' ? body.rpcId : 'invalid';
  const fail = (code, message) => writeJson(response, 200, {
    type: 'server-response',
    rpcId,
    result: { ok: false, error: { code, message, details: {} } },
  });
  if (body === null || typeof body !== 'object' || body.type !== 'client-request' || body.method !== endpoint) {
    fail('gateway/bad-request', 'invalid client-request envelope');
    return;
  }
  try {
    const value = await bridge(endpoint, body.payload);
    writeJson(response, 200, { type: 'server-response', rpcId, result: { ok: true, value } });
  } catch (error) {
    fail('sidebar-browser/error', String((error && error.message) || error));
  }
}

const DESCRIPTION = [
  'Read and drive the page shown in the right-Sidebar Browser panel (the Browser tab beside the chat) through its DOM.',
  'Use it whenever the user points at a page in that panel, or asks you to open, inspect, fill, click, or debug something there: this is the same page the user is watching, and actions land live.',
  'Start with action "snapshot" to see the URL, title, numbered element refs and page text; then "click"/"type"/"select" by ref, or "eval" for page JavaScript.',
  'Use action "open" to create the panel tab when it is closed, and "navigate" to go to another URL.',
  'Prefer this over computer-use clicks for anything inside the panel. Use the separate Chrome/browser-control session instead when the site needs a full browser (stored logins, downloads, cross-origin popups) rather than the sandboxed panel.',
].join(' ');

const PARAMETERS = {
  type: 'object',
  additionalProperties: false,
  required: ['action'],
  properties: {
    action: {
      type: 'string',
      enum: ACTIONS,
      description: [
        'status: list the open browser pages with URL, title and size.',
        'snapshot: URL, title, numbered [eN] element refs and visible text of the active page.',
        'read: visible text (or outer HTML) of the page or of one selector.',
        'click: activate an element by ref, selector or visible text.',
        'type: focus a field (or the focused element) and enter text, optionally submitting.',
        'select: choose an <option> in a <select> by value or label.',
        'press: send one key to the focused element ("Enter", "Escape", "Tab", "ArrowDown", "a", ...); Tab/Enter/Space/Escape defaults are emulated when the page is closed.',
        'scroll: scroll the page or one element.',
        'eval: evaluate a JavaScript expression inside the page and return its JSON value.',
        'wait: sleep, or wait until a selector appears.',
        'navigate: go to another URL through the panel address bar when it is open, or by loading the guest when the panel is closed.',
        'reload: reload the active page.',
        'open: open a browser panel tab at a URL, creating the panel when needed.',
        'screenshot: capture the visible panel page as a PNG and attach it to the result.',
      ].join(' '),
    },
    ref: { type: 'string', description: 'Element ref from "snapshot" (for example "e12").' },
    selector: { type: 'string', description: 'CSS selector, used when no ref is given.' },
    text: { type: 'string', description: 'Visible text to match for click; or the text to type for "type".' },
    value: { type: 'string', description: 'Option value or label for "select".' },
    url: { type: 'string', description: 'HTTP(S) URL for "navigate" and "open".' },
    key: { type: 'string', description: 'Key name for "press", for example "Enter".' },
    shift: { type: 'boolean', description: 'For "press": hold Shift, for example keyboard focus traversal with Shift+Tab. Default false.' },
    code: { type: 'string', description: 'JavaScript expression for "eval". It may await; return JSON-serializable data.' },
    deltaX: { type: 'number', description: 'Horizontal scroll in CSS pixels for "scroll" (default 0).' },
    deltaY: { type: 'number', description: 'Vertical scroll in CSS pixels for "scroll" (default 600 when no selector is given).' },
    clear: { type: 'boolean', description: 'For "type": replace the field value instead of appending. Default true.' },
    submit: { type: 'boolean', description: 'For "type": press Enter afterwards. Default false.' },
    html: { type: 'boolean', description: 'For "read": return outerHTML instead of visible text.' },
    all: { type: 'boolean', description: 'For "read": return every matching node, not only the first.' },
    index: { type: 'number', description: 'Which open browser page to use when several are mounted. Default 0 (the first visible one).' },
    milliseconds: { type: 'number', description: 'For "wait": how long to sleep when no selector is given. Default 500.' },
    timeoutMs: { type: 'number', description: 'For "wait" with a selector, and for page load: upper bound in milliseconds.' },
  },
};

/** Run one OS command to completion. */
function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 20000 }, (error, _stdout, stderr) => {
      if (error) reject(new Error(`${command} failed: ${String(stderr || error.message).trim()}`));
      else resolve();
    });
  });
}

/**
 * Capture one on-screen rectangle into `path`.
 *
 * macOS uses the system `screencapture`, whose `-R` takes the same screen
 * points the Client measured. Windows has no such tool, so PowerShell's
 * System.Drawing copies the region itself; the Client also reports the device
 * pixel ratio, which turns those points into the physical pixels a DPI-aware
 * desktop capture expects.
 */
async function captureRect(path, { x, y, width, height, scale }) {
  if (process.platform === 'darwin') {
    await runCommand('/usr/sbin/screencapture', ['-x', '-R', `${x},${y},${width},${height}`, path]);
    return;
  }
  if (process.platform === 'win32') {
    const px = Math.round(x * scale);
    const py = Math.round(y * scale);
    const pw = Math.round(width * scale);
    const ph = Math.round(height * scale);
    const target = path.replace(/'/g, "''");
    const script = [
      'Add-Type -AssemblyName System.Drawing',
      "Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class DshDpi { [DllImport(\"user32.dll\")] public static extern bool SetProcessDPIAware(); }'",
      '[DshDpi]::SetProcessDPIAware() | Out-Null',
      `$bitmap = New-Object System.Drawing.Bitmap ${pw}, ${ph}`,
      '$graphics = [System.Drawing.Graphics]::FromImage($bitmap)',
      `$graphics.CopyFromScreen(${px}, ${py}, 0, 0, $bitmap.Size)`,
      `$bitmap.Save('${target}', [System.Drawing.Imaging.ImageFormat]::Png)`,
      '$graphics.Dispose()',
      '$bitmap.Dispose()',
    ].join('; ');
    await runCommand('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
    return;
  }
  throw new Error(`screenshot is not supported on ${process.platform}; use action "snapshot" or "read" instead`);
}

/**
 * Capture the panel's on-screen rectangle with the OS, then store the PNG as an
 * attachment so the result can carry the image itself.
 */
async function capturePanel(ctx, geometry) {
  const x = Math.round(Number(geometry?.x));
  const y = Math.round(Number(geometry?.y));
  const width = Math.round(Number(geometry?.width));
  const height = Math.round(Number(geometry?.height));
  if (![x, y, width, height].every(Number.isFinite) || width < 16 || height < 16) {
    throw new Error('the panel page has no measurable on-screen area; open the Browser panel and try again');
  }
  const scale = Number(geometry?.dpr) > 0 ? Number(geometry.dpr) : 1;
  const directory = join(homedir(), '.dsh', 'panel-shots');
  await mkdir(directory, { recursive: true });
  const path = join(directory, `panel-${Date.now()}.png`);
  await captureRect(path, { x, y, width, height, scale });
  const data = await readFile(path);
  const attachments = ctx.get('attachments');
  if (attachments === undefined) throw new Error('the attachment store is unavailable, so the screenshot cannot be attached');
  const image = await attachments.saveImage({ data, mediaType: 'image/png', name: 'sidebar-panel.png' });
  return {
    text: `Screenshot of the sidebar browser page (${width}x${height} pt). File: ${path}`,
    image,
  };
}

/** Default budget per action; navigation and page opens get more room. */
function budgetFor(action, args) {
  if (action === 'navigate' || action === 'open') return 45_000;
  if (action === 'wait') return Math.min(Number(args.timeoutMs) || Number(args.milliseconds) || 1_000, 30_000) + 10_000;
  return 30_000;
}

/**
 * Register the tool and the bridge route on the profile context.
 * @param ctx - Host plugin context carrying the tool registry, Connection and the HTTP server.
 */
export function apply(ctx) {
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'prefix',
      path: CHANNEL,
      handler: (request, response) => serve(ctx, request, response),
    }),
    'panel-dom: bridge route',
  );

  ctx.tools.register({
    name: 'sidebar_browser',
    description: DESCRIPTION,
    parameters: PARAMETERS,
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['text'],
        properties: {
          text: { type: 'string' },
          image: {
            type: 'object',
            additionalProperties: false,
            required: ['attachmentId', 'mediaType', 'bytes', 'width', 'height'],
            properties: {
              attachmentId: { type: 'string' },
              mediaType: { type: 'string' },
              bytes: { type: 'number' },
              width: { type: 'number' },
              height: { type: 'number' },
              name: { type: 'string' },
              originalDimensions: {
                type: 'object',
                additionalProperties: false,
                required: ['width', 'height'],
                properties: { width: { type: 'number' }, height: { type: 'number' } },
              },
            },
          },
        },
      },
      render(_args, value) {
        const content = [{ type: 'text', text: typeof value?.text === 'string' ? value.text : JSON.stringify(value) }];
        if (value !== null && typeof value === 'object' && value.image !== undefined) {
          content.push({ type: 'image', attachment: value.image });
        }
        return content;
      },
    },
    async execute(args) {
      if (args.action === 'screenshot') {
        const measured = await enqueue({ action: 'screenshot', index: args.index }, 20000);
        return capturePanel(ctx, measured && measured.geometry);
      }
      if (args.action === 'status' && Date.now() - lastContact > CLIENT_FRESH_MS) {
        const age = lastContact === 0 ? 'never' : `${Math.round((Date.now() - lastContact) / 1000)}s ago`;
        return {
          text: [
            'The DOM bridge has no live Client poll.',
            `Last Client contact: ${age}.`,
            `Queued commands: ${queue.length}; waiting pollers: ${waiters.length}; pending results: ${pending.size}.`,
            'The Client half of this plugin is not running in the DSH window, so the panel page cannot be reached. Reload the DSH window so the page picks up the plugin bundle.',
          ].join('\n'),
        };
      }
      const { action, ...rest } = args;
      const command = { action };
      for (const [key, value] of Object.entries(rest)) {
        if (value !== undefined && value !== null) command[key] = value;
      }
      const value = await enqueue(command, budgetFor(action, args));
      if (value === null || typeof value !== 'object' || typeof value.text !== 'string') {
        throw new Error('sidebar browser returned an unexpected result');
      }
      return value;
    },
    presentCall(args) {
      return {
        card: 'generic',
        title: `Sidebar browser: ${args.action}`,
        kind: 'other',
        rawInput: args.ref ?? args.selector ?? args.text ?? args.url ?? args.code ?? '',
      };
    },
  });
}
