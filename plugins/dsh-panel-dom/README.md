# dsh-panel-dom

Gives the agent DOM control over the right-Sidebar browser panel — the **Браузер / Browser**
tab beside the chat. One model-facing tool, `sidebar_browser`, replaces the accessibility and
pixel clicking that this panel used to require.

## Why it needs a bridge

The panel page is an Electron `<webview>`: a separate renderer the Host's Node process cannot
read. The Client half is the only process holding a live element, so:

- **Host** (`impl.js`) registers the `sidebar_browser` tool and a private endpoint,
  `/sidebar-browser-dom/*`, on the same web server every Remote call already uses.
- **Client** (`client.js`) long-polls that endpoint from the DSH window, executes one command in
  the guest through `webview.executeJavaScript`, and posts the result back.

Desktop carries the endpoint over its `dsh-app:` protocol bridge (every non-static path is
forwarded to the loopback Host with the session cookie), Web serves it directly. Requests are
admitted through `ctx.connection.admit`, so they run with the browser peer's authority.

`ctx.connection.rpc.handle()` is deliberately not used: it registers through the Connection
plugin's own context, which does not declare the `webServer` service, so it throws for every
consumer plugin.

`index.js` re-imports `impl.js` with a cache-busting query on each activation, because the ESM
module cache keeps a failed or earlier import for the life of the Host process. Edit `impl.js`,
then toggle the bundle (or restart) to apply.

## Actions

| action | what it does |
| --- | --- |
| `status` | mounts, URLs, titles and sizes of the panel pages |
| `snapshot` | URL, title, `[eN]` element refs and visible text of the active page |
| `read` | visible text or outerHTML of the page or one selector |
| `click` | pointer sequence plus `click()` on a ref, selector or visible text |
| `type` | focus a field and set its value with native setters and `input`/`change` events |
| `select` | pick an `<option>` by value or label |
| `press` | one key; native `sendInputEvent` (with Shift) while the panel is visible, otherwise DOM keys plus emulated Tab/Enter/Space/Escape/arrow defaults |
| `scroll` | scroll the page or one element |
| `eval` | evaluate a JavaScript expression in the page and return JSON |
| `wait` | sleep, or wait for a selector |
| `navigate` | go to another URL through the panel's own address bar when it is open (toolbar stays in sync), else load the guest directly |
| `reload` | reload the active page |
| `open` | open a panel tab through the sidebar, creating the panel when needed |
| `screenshot` | capture the visible page as a PNG (OS window capture cropped to the guest) and attach it to the result |

## Known limits

- Refs survive a re-render and even a navigation: the snapshot records each element's CSS path
  and accessible name, and a missing ref is re-resolved through that fingerprint before the tool
  asks for a new snapshot. A page that rebuilt its whole tree still needs `snapshot`.
- Keys: while the panel is visible, `press` sends real Chromium input (including `Shift+Tab`).
  A closed panel only gets DOM key events, so the helper emulates the browser defaults it can:
  `Tab`/`Shift+Tab` focus traversal, `Enter` form submit, `Space` on a checkbox or button,
  `Escape` blur, and arrow keys on a `<select>`. IME, native pickers and OS shortcuts are out of
  reach.
- `navigate` goes through the panel's address bar while it is open, so the toolbar and the React controller stay in sync. With the panel closed it falls back to loading the guest
  directly, and only then does the toolbar keep the previous address.
- Screenshots are OS-level: `<webview>` has no `capturePage`, and a native webview never paints
  into the page's canvas, so the Client measures the guest rectangle in screen points and the
  Host runs `screencapture -R` on it, then stores the PNG as an attachment. Consequences: the
  panel must be visible and on the active Space, macOS Screen Recording permission is required
  for the DSH app, the image is the visible viewport (no full-page stitch), and another window
  overlapping the panel is captured as-is.
- The panel stays a sandboxed guest: stored logins of the main browser, downloads, modal native
  dialogs and cross-origin browser APIs remain with Browser Control / Playwright.
- Popups, downloads, stored logins and cross-origin browser APIs stay outside the sandboxed
  panel; use Browser Control / Playwright for those.

## Development notes

- The page helper caches itself as `window.__dshPanelDom` for the life of the document and
  version-checks on every call: bump `VERSION` in `HELPER` when its API changes, otherwise the
  page keeps answering with the previous helper.
- `webview.executeJavaScript` runs in the page's main world. Values crossing back must be plain
  JSON; the helper returns `{ __error }` instead of throwing across the bridge.
- A failed Host import is cached by Node for the life of the process. `index.js` imports
  `impl.js` with `?t=Date.now()`, so edit `impl.js` and recompose the bundle; renaming the package
  is the only workaround for a change made inside `index.js` itself.

## Files

- `index.js` — stable loader entry (`inject`, cache-busting activation).
- `impl.js` — Host tool, command queue, bridge endpoint.
- `client.js` — Client half: page helper, command execution, long-poll loop.
- `cordis.patch.yml` — inserts the `panel-dom` row.
