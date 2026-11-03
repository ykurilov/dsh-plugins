window.__ModuleLoader__.load({
  id: "dsh-panel-dom",
  factory(require) {
    /** Private Connection channel shared with the Host half. */
    const CHANNEL = "/sidebar-browser-dom";

    /** The shipped Browser plugin marks every guest with this attribute. */
    const FRAME_SELECTOR = 'webview[data-sidebar-browser-frame="webview"]';

    /** Long-poll window: short enough for the desktop `dsh-app:` carrier. */
    const POLL_WAIT_MS = 8000;

    /** Page-side helper, invoked in the guest's main world on every command. */
    const HELPER = String.raw`(function () {
      var KEY = "__dshPanelDom";
      var VERSION = 6;
      var existing = window[KEY];
      if (existing && existing.version === VERSION) return existing;
      var seq = 0;
      var CANDIDATES = 'a[href],button,input,select,textarea,summary,label,[role],[onclick],[contenteditable=""],[contenteditable="true"],[tabindex]:not([tabindex="-1"])';

      function collapse(value) {
        return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
      }
      function visible(el) {
        if (!el || el.nodeType !== 1 || !el.isConnected) return false;
        var rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        var style = getComputedStyle(el);
        return style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0";
      }
      function accessibleName(el) {
        var aria = collapse(el.getAttribute("aria-label"));
        if (aria) return aria.slice(0, 160);
        var ids = el.getAttribute("aria-labelledby");
        if (ids) {
          var joined = collapse(ids.split(/\s+/).map(function (id) {
            var node = document.getElementById(id);
            return node ? collapse(node.innerText || node.textContent) : "";
          }).join(" "));
          if (joined) return joined.slice(0, 160);
        }
        var tag = el.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
          var label = el.labels && el.labels.length ? collapse(el.labels[0].innerText || el.labels[0].textContent) : "";
          var placeholder = collapse(el.getAttribute("placeholder"));
          var title = collapse(el.getAttribute("title"));
          var named = collapse(el.getAttribute("name"));
          return (label || placeholder || title || named || "").slice(0, 160);
        }
        var text = collapse(el.innerText || el.textContent);
        if (text) return text.slice(0, 160);
        var image = el.querySelector ? el.querySelector("img[alt]") : null;
        if (image) return collapse(image.getAttribute("alt")).slice(0, 160);
        return collapse(el.getAttribute("title")).slice(0, 160);
      }
      function roleOf(el) {
        var explicit = el.getAttribute("role");
        if (explicit) return explicit;
        var tag = el.tagName;
        if (tag === "A") return "link";
        if (tag === "BUTTON") return "button";
        if (tag === "INPUT") {
          var type = (el.getAttribute("type") || "text").toLowerCase();
          if (type === "submit" || type === "button" || type === "reset") return "button";
          if (type === "checkbox") return "checkbox";
          if (type === "radio") return "radio";
          return "input";
        }
        if (tag === "SELECT") return "combobox";
        if (tag === "TEXTAREA") return "textbox";
        if (el.isContentEditable) return "textbox";
        return tag.toLowerCase();
      }
      function refFor(el) {
        var ref = el.getAttribute("data-dsh-ref");
        if (!ref) {
          seq += 1;
          ref = "e" + seq;
          el.setAttribute("data-dsh-ref", ref);
        }
        return ref;
      }
      function byRef(ref) {
        return document.querySelector('[data-dsh-ref="' + String(ref).replace(/[^A-Za-z0-9_-]/g, "") + '"]');
      }
      var paths = {};
      function cssPath(el) {
        if (!el || el.nodeType !== 1) return "";
        if (el.id) return "#" + (window.CSS && CSS.escape ? CSS.escape(el.id) : el.id);
        var parts = [];
        var node = el;
        while (node && node.nodeType === 1 && node !== document.documentElement) {
          var tag = node.tagName.toLowerCase();
          var parent = node.parentElement;
          if (!parent) break;
          var index = 1;
          var sibling = node;
          while ((sibling = sibling.previousElementSibling)) {
            if (sibling.tagName === node.tagName) index += 1;
          }
          parts.unshift(tag + ":nth-of-type(" + index + ")");
          if (parent.id) {
            parts.unshift("#" + (window.CSS && CSS.escape ? CSS.escape(parent.id) : parent.id));
            break;
          }
          node = parent;
        }
        return parts.join(" > ");
      }
      function rememberPath(ref, el) {
        paths[ref] = cssPath(el);
      }
      function pathMap() {
        return paths;
      }
      function resolve(target) {
        target = target || {};
        if (target.ref) {
          var found = byRef(target.ref);
          if (found) return found;
          var known = paths[target.ref];
          if (known) {
            var knownNode = null;
            try { knownNode = document.querySelector(known); } catch (_error) { knownNode = null; }
            if (knownNode && visible(knownNode)) {
              knownNode.setAttribute("data-dsh-ref", target.ref);
              return knownNode;
            }
          }
          var hint = target.hint || {};
          if (hint.path) {
            var byPath = null;
            try { byPath = document.querySelector(hint.path); } catch (_error) { byPath = null; }
            if (byPath && visible(byPath)) {
              byPath.setAttribute("data-dsh-ref", target.ref);
              return byPath;
            }
          }
          if (hint.name) {
            var wanted = collapse(hint.name).toLowerCase();
            var candidates = Array.prototype.slice.call(document.querySelectorAll(CANDIDATES)).filter(visible);
            var named = candidates.filter(function (candidate) {
              return collapse(accessibleName(candidate)).toLowerCase() === wanted;
            });
            if (named.length === 1) {
              named[0].setAttribute("data-dsh-ref", target.ref);
              return named[0];
            }
          }
          throw new Error('ref "' + target.ref + '" no longer matches this document; take a new snapshot');
        }
        if (target.selector) {
          var node = document.querySelector(target.selector);
          if (!node) throw new Error('selector "' + target.selector + '" matches nothing');
          return node;
        }
        if (target.text) {
          var nodes = Array.prototype.slice.call(document.querySelectorAll(CANDIDATES)).filter(visible);
          var exact = nodes.filter(function (candidate) {
            return collapse(candidate.innerText || candidate.textContent) === collapse(target.text);
          });
          var partial = nodes.filter(function (candidate) {
            return collapse(candidate.innerText || candidate.textContent).toLowerCase().indexOf(collapse(target.text).toLowerCase()) !== -1;
          });
          var picked = exact[0] || partial[0];
          if (!picked) throw new Error('no visible element shows "' + target.text + '"');
          return picked;
        }
        var active = document.activeElement;
        return active && active !== document.body ? active : document.body;
      }
      function describe(el) {
        return "[" + refFor(el) + "] " + roleOf(el) + ' "' + accessibleName(el) + '"';
      }
      function point(el) {
        el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
        var rect = el.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }
      function fire(el, type, init) {
        var Ctor = type.indexOf("pointer") === 0 ? (window.PointerEvent || window.MouseEvent) : window.MouseEvent;
        el.dispatchEvent(new Ctor(type, Object.assign({
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window,
          button: 0,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true
        }, init)));
      }
      function click(target) {
        var el = resolve(target);
        var at = point(el);
        var order = [
          ["pointerover", 0], ["mouseover", 0], ["pointermove", 0], ["mousemove", 0],
          ["pointerdown", 1], ["mousedown", 1], ["pointerup", 0], ["mouseup", 0]
        ];
        order.forEach(function (pair) {
          fire(el, pair[0], { clientX: at.x, clientY: at.y, buttons: pair[1] });
        });
        try { if (typeof el.focus === "function") el.focus({ preventScroll: true }); } catch (_error) { /* focus is best effort */ }
        if (typeof el.click === "function") el.click();
        else fire(el, "click", { clientX: at.x, clientY: at.y });
        return describe(el);
      }
      function typeInto(target, value, clear) {
        var el = resolve(target);
        if (!el || el === document.body) throw new Error("no field is focused; pass a ref from snapshot");
        var text = String(value == null ? "" : value);
        try { if (typeof el.focus === "function") el.focus({ preventScroll: true }); } catch (_error) { /* focus is best effort */ }
        if (el.isContentEditable) {
          if (clear !== false) el.textContent = "";
          var inserted = false;
          try { inserted = document.execCommand("insertText", false, text); } catch (_error) { inserted = false; }
          if (!inserted) el.textContent = (clear === false ? el.textContent : "") + text;
          el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return describe(el);
        }
        if (!("value" in el)) throw new Error(describe(el) + " does not accept text");
        var proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        var descriptor = Object.getOwnPropertyDescriptor(proto, "value");
        var next = clear === false ? String(el.value || "") + text : text;
        if (descriptor && descriptor.set) descriptor.set.call(el, next);
        else el.value = next;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return describe(el);
      }
      function selectOption(target, wanted) {
        var el = resolve(target);
        if (el.tagName !== "SELECT") throw new Error(describe(el) + " is not a <select>");
        var options = Array.prototype.slice.call(el.options);
        var want = collapse(wanted).toLowerCase();
        var exact = options.filter(function (option) { return collapse(option.value).toLowerCase() === want; });
        var byLabel = options.filter(function (option) { return collapse(option.textContent).toLowerCase() === want; });
        var partial = options.filter(function (option) { return collapse(option.textContent).toLowerCase().indexOf(want) !== -1; });
        var match = exact[0] || byLabel[0] || partial[0];
        if (!match) {
          throw new Error('no option matches "' + wanted + '"; options: ' + options.map(function (option) { return collapse(option.textContent); }).join(" | ").slice(0, 400));
        }
        el.value = match.value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return describe(el) + ' set to "' + collapse(match.textContent) + '"';
      }
      function tabbables() {
        var selector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';
        return Array.prototype.slice.call(document.querySelectorAll(selector)).filter(function (el) {
          if (!visible(el)) return false;
          if (el.tagName === "INPUT" && el.type === "hidden") return false;
          return true;
        });
      }
      function focusNext(delta) {
        var list = tabbables();
        if (list.length === 0) return null;
        var index = list.indexOf(document.activeElement);
        var next = index === -1 ? (delta > 0 ? 0 : list.length - 1) : (index + delta + list.length) % list.length;
        var el = list[next];
        el.focus();
        if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest", inline: "nearest" });
        return el;
      }
      function emulateDefault(el, key, shift) {
        if (key === "Tab") {
          var next = focusNext(shift ? -1 : 1);
          return next ? "focused " + describe(next) : "nothing focusable";
        }
        if (key === "Enter" && el && el.form && typeof el.form.requestSubmit === "function") {
          try { el.form.requestSubmit(); return "submitted the form"; } catch (_error) { /* the page owns its submit handler */ }
        }
        if (key === " " || key === "Space") {
          if (el && (el.type === "checkbox" || el.type === "radio")) { el.click(); return (el.checked ? "checked " : "unchecked ") + describe(el); }
          if (el && el.tagName === "BUTTON") { el.click(); return "activated " + describe(el); }
        }
        if (key === "Escape") {
          if (document.activeElement && typeof document.activeElement.blur === "function") document.activeElement.blur();
          return "blurred the focused element";
        }
        if (el && el.tagName === "SELECT" && (key === "ArrowDown" || key === "ArrowUp")) {
          var options = Array.prototype.slice.call(el.options);
          var at = el.selectedIndex + (key === "ArrowDown" ? 1 : -1);
          if (at >= 0 && at < options.length) {
            el.selectedIndex = at;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
            return "selected " + collapse(options[at].textContent);
          }
          return "already at the edge";
        }
        return "";
      }
      function pressKey(key, target, shift) {
        var el = target && (target.ref || target.selector || target.text) ? resolve(target) : (document.activeElement || document.body);
        try { if (el && typeof el.focus === "function") el.focus({ preventScroll: true }); } catch (_error) { /* focus is best effort */ }
        var code = /^[A-Za-z]$/.test(key) ? "Key" + key.toUpperCase() : (/^[0-9]$/.test(key) ? "Digit" + key : key);
        var init = { key: key, code: code, bubbles: true, cancelable: true, composed: true, shiftKey: shift === true };
        var accepted = el.dispatchEvent(new KeyboardEvent("keydown", init));
        el.dispatchEvent(new KeyboardEvent("keypress", init));
        el.dispatchEvent(new KeyboardEvent("keyup", init));
        var note = accepted ? emulateDefault(el, key, shift === true) : "";
        return "pressed " + key + " on " + describe(el) + (note ? " (" + note + ")" : "");
      }
      function scrollBy(target, deltaX, deltaY) {
        var dx = Number(deltaX) || 0;
        var dy = Number(deltaY) || 0;
        if (target && (target.ref || target.selector || target.text)) {
          var el = resolve(target);
          if (typeof el.scrollBy === "function") el.scrollBy({ left: dx, top: dy, behavior: "instant" });
          else el.scrollTop = (el.scrollTop || 0) + dy;
          return "scrolled " + describe(el) + " by " + dx + "," + dy;
        }
        window.scrollBy({ left: dx, top: dy, behavior: "instant" });
        return "scrolled the page by " + dx + "," + dy + " (scrollY " + Math.round(window.scrollY) + " of " + Math.round(document.documentElement.scrollHeight) + ")";
      }
      function read(selector, all, html) {
        var nodes = selector ? Array.prototype.slice.call(document.querySelectorAll(selector)) : (document.body ? [document.body] : []);
        if (nodes.length === 0) throw new Error('selector "' + selector + '" matches nothing');
        var picked = all ? nodes.slice(0, 12) : nodes.slice(0, 1);
        return picked.map(function (node) {
          return html ? String(node.outerHTML || "").slice(0, 8000) : collapse(node.innerText || node.textContent).slice(0, 8000);
        }).join("\n\n---\n\n");
      }
      function snapshot() {
        var nodes = Array.prototype.slice.call(document.querySelectorAll(CANDIDATES)).filter(visible);
        var elements = [];
        for (var index = 0; index < nodes.length && elements.length < 180; index += 1) {
          var el = nodes[index];
          var ref = refFor(el);
          rememberPath(ref, el);
          var record = { ref: ref, role: roleOf(el), name: accessibleName(el) };
          if (el.tagName === "A") record.href = String(el.getAttribute("href") || "").slice(0, 300);
          if (el.tagName === "INPUT") {
            record.type = (el.getAttribute("type") || "text").toLowerCase();
            if (record.type === "checkbox" || record.type === "radio") record.checked = Boolean(el.checked);
          }
          if ("value" in el && typeof el.value === "string" && el.value && record.type !== "checkbox" && record.type !== "radio" && record.type !== "file") {
            record.value = el.value.slice(0, 120);
          }
          if (el.disabled || el.getAttribute("aria-disabled") === "true") record.disabled = true;
          elements.push(record);
        }
        var body = document.body;
        return {
          url: location.href,
          title: document.title,
          elements: elements,
          text: collapse(body ? body.innerText || body.textContent : "").slice(0, 6000)
        };
      }
      function exists(selector) {
        return document.querySelector(selector) !== null;
      }
      var api = {
        version: VERSION,
        snapshot: snapshot,
        click: click,
        typeInto: typeInto,
        selectOption: selectOption,
        pressKey: pressKey,
        scrollBy: scrollBy,
        read: read,
        exists: exists,
        pathMap: pathMap,
        resolve: resolve
      };
      window[KEY] = api;
      return api;
    })()`;

    /** Path/name fingerprints from the last snapshot, per mounted page. */
    const hintCache = new WeakMap();

    function hintFor(frame, ref) {
      if (typeof ref !== "string") return undefined;
      const map = hintCache.get(frame);
      return map === undefined ? undefined : map[ref];
    }

    /** Serialize one command's page-side arguments without letting them leak into code. */
    function argsOf(cmd, hint) {
      return JSON.stringify({
        hint: hint,
        ref: cmd.ref,
        selector: cmd.selector,
        text: cmd.text,
        value: cmd.value,
        key: cmd.key,
        html: cmd.html,
        all: cmd.all,
        clear: cmd.clear,
        submit: cmd.submit,
        shift: cmd.shift,
        deltaX: cmd.deltaX,
        deltaY: cmd.deltaY,
      });
    }

    /** Wrap one page-side body so a thrown page error comes back as data. */
    function pageScript(args, body) {
      return `(async () => {
        try {
          const api = ${HELPER};
          const args = ${args};
          ${body}
        } catch (error) {
          return { __error: String((error && error.stack) || error) };
        }
      })()`;
    }

    function sleep(ms) {
      return new Promise((resolve) => {
        setTimeout(resolve, ms);
      });
    }

    function collapse(value) {
      return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
    }

    function mountedFrames() {
      return Array.from(document.querySelectorAll(FRAME_SELECTOR)).filter((element) => element.isConnected);
    }

    function isShown(element) {
      const rect = element.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1;
    }

    /** Pick the page the user is looking at unless `index` names another. */
    function pickFrame(cmd) {
      const all = mountedFrames();
      if (all.length === 0) {
        throw new Error(
          "The right-Sidebar Browser panel has no page. Open it from the right Sidebar, or call sidebar_browser with action \"open\" and a url.",
        );
      }
      const shown = all.filter(isShown);
      const pool = shown.length > 0 ? shown : all;
      const index = Number.isInteger(cmd.index) ? cmd.index : 0;
      return pool[index] ?? pool[0];
    }

    function normalizeUrl(raw) {
      const text = collapse(raw);
      if (text.length === 0) throw new Error('a url is required, for example "https://example.com"');
      const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(text) ? text : `https://${text}`;
      let parsed;
      try {
        parsed = new URL(candidate);
      } catch (_error) {
        throw new Error(`"${raw}" is not a usable URL`);
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error(`only http and https pages open in the sidebar browser, got "${parsed.protocol}"`);
      }
      return parsed.href;
    }

    function formatSnapshot(data) {
      const lines = [`URL: ${data.url}`, `Title: ${data.title || "(untitled)"}`, "", `Elements (${data.elements.length}):`];
      for (const element of data.elements) {
        let line = `[${element.ref}] ${element.role}`;
        if (element.name) line += ` "${element.name}"`;
        if (element.type && element.type !== "text") line += ` (${element.type})`;
        if (element.checked !== undefined) line += element.checked ? " [checked]" : " [unchecked]";
        if (element.disabled) line += " [disabled]";
        if (element.value) line += ` = "${element.value}"`;
        if (element.href) line += ` -> ${element.href}`;
        lines.push(line);
      }
      lines.push("", "Text:", data.text || "(empty)");
      return lines.join("\n");
    }

    function formatValue(value) {
      if (typeof value === "string") return value;
      try {
        const text = JSON.stringify(value, null, 2);
        return text === undefined ? String(value) : text;
      } catch (_error) {
        return String(value);
      }
    }

    /** One page-level evaluation with a shared helper and shared argument object. */
    async function callPage(frame, cmd, body) {
      const script = pageScript(argsOf(cmd, hintFor(frame, cmd.ref)), body);
      const result = await frame.executeJavaScript(script, true);
      if (result && typeof result === "object" && typeof result.__error === "string") throw new Error(result.__error);
      return result;
    }

    function statusText() {
      const all = mountedFrames();
      const lines = [];
      if (all.length === 0) {
        lines.push("The right-Sidebar Browser panel has no page mounted.");
        lines.push('Call sidebar_browser with action "open" and a url to create one.');
        return lines.join("\n");
      }
      lines.push(`Mounted browser pages: ${all.length}`);
      all.forEach((frame, index) => {
        const rect = frame.getBoundingClientRect();
        let url = "";
        let title = "";
        try {
          url = frame.getURL();
        } catch (_error) {
          url = "";
        }
        try {
          title = frame.getTitle();
        } catch (_error) {
          title = "";
        }
        const size = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
        const input = isShown(frame) ? chromeAddressInput(frame) : null;
        const chrome = isShown(frame)
          ? input === null
            ? "no address bar"
            : `address bar: ${String(input.value).slice(0, 120)}`
          : "address bar n/a";
        lines.push(`[${index}] ${isShown(frame) ? "visible" : "hidden"} ${url || "(no url)"}${title ? ` — "${title}"` : ""} (${size}; ${chrome})`);
      });
      return lines.join("\n");
    }

    async function openInPanel(ctx, cmd) {
      const url = normalizeUrl(cmd.url);
      ctx.sidebarRight.openTab("browser", { params: { url } });
      const deadline = Date.now() + Math.min(Number(cmd.timeoutMs) || 20000, 40000);
      while (Date.now() < deadline) {
        await sleep(150);
        if (mountedFrames().length > 0) break;
      }
      if (mountedFrames().length === 0) {
        throw new Error("asked the right Sidebar to open a browser tab, but no page mounted within the timeout");
      }
      return `Opened ${url} in the right-Sidebar browser panel.`;
    }

    /** The address bar of the browser tab that owns this guest, when the panel is open. */
    function chromeAddressInput(frame) {
      let node = frame.parentElement;
      for (let depth = 0; node !== null && node !== document.body && depth < 6; depth += 1, node = node.parentElement) {
        const inputs = Array.from(node.querySelectorAll("input")).filter((input) => {
          const rect = input.getBoundingClientRect();
          return rect.width > 1 && rect.height > 1 && input.type !== "checkbox" && input.type !== "radio" && input.type !== "file";
        });
        if (inputs.length > 0) return inputs[0];
      }
      return null;
    }

    async function frameUrl(frame) {
      try {
        return frame.getURL();
      } catch (_error) {
        return "";
      }
    }

    /** Wait until the guest leaves the URL it had before the command. */
    async function waitForLanding(frame, before, timeout) {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        const current = await frameUrl(frame);
        if (current && current !== before) {
          await sleep(250);
          return true;
        }
        await sleep(150);
      }
      return false;
    }

    async function navigate(frame, cmd) {
      const url = normalizeUrl(cmd.url);
      const timeout = Math.min(Number(cmd.timeoutMs) || 20000, 40000);
      const before = await frameUrl(frame);
      const input = isShown(frame) ? chromeAddressInput(frame) : null;
      let chromeNote = isShown(frame) ? (input === null ? "no address bar" : "address bar found") : "panel hidden";
      if (input !== null) {
        try {
          input.focus();
          const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
          if (descriptor && descriptor.set) descriptor.set.call(input, url);
          else input.value = url;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          // React re-renders the controlled address field from its own state; the submit handler
          // reads that state, so give the commit a couple of frames before submitting the form.
          await new Promise((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 120)));
          });
          const form = input.form;
          chromeNote += form === null ? ", input has no form" : ", submitting the form";
          if (form !== null) {
            if (typeof form.requestSubmit === "function") form.requestSubmit();
            else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
          } else {
            const init = { key: "Enter", code: "Enter", bubbles: true, cancelable: true, composed: true };
            input.dispatchEvent(new KeyboardEvent("keydown", init));
            input.dispatchEvent(new KeyboardEvent("keypress", init));
            input.dispatchEvent(new KeyboardEvent("keyup", init));
          }
          if (await waitForLanding(frame, before, Math.min(timeout, 15000))) {
            return { text: `Navigated the sidebar browser to ${await frameUrl(frame)} through its own address bar.` };
          }
          chromeNote += ", no landing after submit";
        } catch (error) {
          chromeNote = `address bar failed: ${String((error && error.message) || error)}`;
        }
      }

      const settled = new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          frame.removeEventListener("did-finish-load", finish);
          frame.removeEventListener("did-fail-load", finish);
          resolve();
        };
        frame.addEventListener("did-finish-load", finish);
        frame.addEventListener("did-fail-load", finish);
        setTimeout(finish, timeout);
      });
      await frame.loadURL(url);
      await settled;
      const landed = (await frameUrl(frame)) || url;
      return {
        text: `Navigated the sidebar browser to ${landed} by loading the guest directly (${chromeNote}); the panel toolbar may keep the previous address until it refreshes.`,
      };
    }

    async function run(ctx, cmd) {
      if (cmd.action === "status") return { text: statusText() };
      if (cmd.action === "open") return { text: await openInPanel(ctx, cmd) };

      const frame = pickFrame(cmd);

      if (cmd.action === "screenshot") {
        if (!isShown(frame)) {
          throw new Error('The Browser panel is not visible, so its page is not painted. Open it (action "open") and capture again.');
        }
        const rect = frame.getBoundingClientRect();
        const chromeX = Math.max(0, (window.outerWidth - window.innerWidth) / 2);
        const chromeY = Math.max(0, window.outerHeight - window.innerHeight);
        return {
          geometry: {
            x: window.screenX + chromeX + rect.left,
            y: window.screenY + chromeY + rect.top,
            width: rect.width,
            height: rect.height,
            windowX: window.screenX,
            windowY: window.screenY,
            dpr: window.devicePixelRatio || 1,
          },
        };
      }

      if (cmd.action === "navigate") return navigate(frame, cmd);

      if (cmd.action === "reload") {
        const timeout = Math.min(Number(cmd.timeoutMs) || 20000, 40000);
        const settled = new Promise((resolve) => {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            frame.removeEventListener("did-finish-load", finish);
            frame.removeEventListener("did-fail-load", finish);
            resolve();
          };
          frame.addEventListener("did-finish-load", finish);
          frame.addEventListener("did-fail-load", finish);
          setTimeout(finish, timeout);
        });
        frame.reload();
        await settled;
        let url = "";
        try {
          url = frame.getURL();
        } catch (_error) {
          url = "";
        }
        return { text: `Reloaded the sidebar browser page${url ? ` at ${url}` : ""}.` };
      }

      if (cmd.action === "wait") {
        if (cmd.selector) {
          const deadline = Date.now() + Math.min(Number(cmd.timeoutMs) || 10000, 30000);
          while (Date.now() < deadline) {
            const found = await callPage(frame, cmd, "return { ok: true, found: api.exists(args.selector) };");
            if (found && found.found === true) break;
            await sleep(150);
          }
          const final = await callPage(frame, cmd, "return { ok: true, found: api.exists(args.selector) };");
          if (!final || final.found !== true) throw new Error(`"${cmd.selector}" did not appear in time`);
          return { text: `"${cmd.selector}" is present.` };
        }
        const ms = Math.min(Math.max(Number(cmd.milliseconds) || 500, 0), 30000);
        await sleep(ms);
        return { text: `Waited ${ms} ms.` };
      }

      if (cmd.action === "eval") {
        const code = typeof cmd.code === "string" ? cmd.code : "";
        if (code.trim().length === 0) throw new Error("eval needs a JavaScript expression in `code`");
        const result = await frame.executeJavaScript(
          `(async () => {
            try {
              const value = await (async () => (${code}))();
              try {
                return { ok: true, value: JSON.parse(JSON.stringify(value === undefined ? null : value)) };
              } catch (_error) {
                return { ok: true, value: String(value) };
              }
            } catch (error) {
              return { ok: false, error: String((error && error.stack) || error) };
            }
          })()`,
          true,
        );
        if (!result || result.ok !== true) throw new Error(result && result.error ? result.error : "page evaluation failed");
        return { text: formatValue(result.value) };
      }

      if (cmd.action === "snapshot") {
        const data = await callPage(frame, cmd, "return { ok: true, data: api.snapshot() };");
        if (!data || !data.data) throw new Error("the page returned no snapshot");
        try {
          const paths = await callPage(frame, {}, "return { ok: true, paths: api.pathMap() };");
          const hints = {};
          for (const element of data.data.elements) {
            const path = paths && paths.paths ? paths.paths[element.ref] : undefined;
            if (typeof path === "string") hints[element.ref] = { path, name: element.name, role: element.role };
          }
          hintCache.set(frame, hints);
        } catch (_error) {
          /* hints are an optimization; a failed read leaves the refs page-local */
        }
        return { text: formatSnapshot(data.data) };
      }

      if (cmd.action === "read") {
        const data = await callPage(
          frame,
          cmd,
          "return { ok: true, text: api.read(args.selector, args.all === true, args.html === true) };",
        );
        const text = data && typeof data.text === "string" ? data.text : "";
        return { text: text.length > 0 ? text : "(no text)" };
      }

      if (cmd.action === "click") {
        const data = await callPage(
          frame,
          cmd,
          "const what = api.click({ ref: args.ref, selector: args.selector, text: args.text, hint: args.hint }); return { ok: true, what: what, url: location.href };",
        );
        return { text: `Clicked ${data.what}${data.url ? ` (page now at ${data.url})` : ""}.` };
      }

      if (cmd.action === "type") {
        const data = await callPage(
          frame,
          cmd,
          `const what = api.typeInto({ ref: args.ref, selector: args.selector, hint: args.hint }, args.text == null ? "" : args.text, args.clear);
           let pressed = "";
           if (args.submit === true) {
             pressed = " Then " + api.pressKey("Enter", { ref: args.ref, selector: args.selector, hint: args.hint });
           }
           return { ok: true, what: what + "." + pressed };`,
        );
        return { text: `Typed into ${data.what}` };
      }

      if (cmd.action === "select") {
        const data = await callPage(
          frame,
          cmd,
          "return { ok: true, what: api.selectOption({ ref: args.ref, selector: args.selector, hint: args.hint }, args.value) };",
        );
        return { text: data.what };
      }

      if (cmd.action === "press") {
        const key = typeof cmd.key === "string" && cmd.key === " " ? "Space" : collapse(cmd.key);
        if (key.length === 0) throw new Error("press needs a key name such as Enter");
        let native = false;
        const shift = cmd.shift === true;
        if (isShown(frame) && typeof frame.sendInputEvent === "function") {
          try {
            const modifiers = shift ? ["shift"] : [];
            frame.sendInputEvent({ type: "keyDown", keyCode: key, modifiers });
            if (key.length === 1) frame.sendInputEvent({ type: "char", keyCode: key, modifiers });
            frame.sendInputEvent({ type: "keyUp", keyCode: key, modifiers });
            native = true;
          } catch (_error) {
            native = false;
          }
        }
        if (native) return { text: `Pressed ${key} in the page.` };
        const data = await callPage(
          frame,
          cmd,
          `return { ok: true, what: api.pressKey(${JSON.stringify(key)}, { ref: args.ref, selector: args.selector, hint: args.hint }, args.shift === true) };`,
        );
        return { text: `${data.what} (synthetic keys: the panel page is hidden, so the page only sees DOM key events)` };
      }

      if (cmd.action === "scroll") {
        const data = await callPage(
          frame,
          cmd,
          "return { ok: true, what: api.scrollBy({ ref: args.ref, selector: args.selector, hint: args.hint }, args.deltaX, args.deltaY == null ? 600 : args.deltaY) };",
        );
        return { text: data.what };
      }

      throw new Error(`sidebar browser: unsupported action ${JSON.stringify(cmd.action)}`);
    }

    /** One bridge call, unwrapping the Connection result envelope. */
    async function callHost(ctx, endpoint, payload) {
      const reply = await ctx.connection.rpc.call(CHANNEL, endpoint, payload);
      if (reply === null || typeof reply !== "object" || reply.ok !== true) {
        const message = reply && reply.error && typeof reply.error.message === "string"
          ? reply.error.message
          : "the sidebar browser bridge is unavailable";
        throw new Error(message);
      }
      return reply.value;
    }

    /** One long-poll loop; the returned stop ends it after the in-flight poll settles. */
    function bridgeLoop(ctx) {
      let stopped = false;
      const stop = () => {
        stopped = true;
      };
      const pump = async () => {
        let failures = 0;
        while (!stopped) {
          let cmd;
          try {
            cmd = await callHost(ctx, "next", { waitMs: POLL_WAIT_MS });
            failures = 0;
          } catch (_error) {
            failures += 1;
            await sleep(failures > 4 ? 5000 : 500);
            continue;
          }
          if (cmd === null || cmd === undefined) continue;
          let payload;
          try {
            const value = await run(ctx, cmd);
            payload = { id: cmd.id, ok: true, value };
          } catch (error) {
            payload = { id: cmd.id, ok: false, error: String((error && error.message) || error) };
          }
          try {
            await callHost(ctx, "result", payload);
          } catch (_error) {
            /* a failed report surfaces as the tool's own timeout */
          }
        }
      };
      void pump();
      return { stop };
    }

    const inject = ["connection", "sidebarRight"];

    /**
     * Start the bridge and hand the stop handle over from any previous instance: a Client HMR
     * replacement can apply the new module before the old effect disposes, so a
     * "already running" flag would leave the window with no loop at all.
     */
    function apply(ctx) {
      const previous = globalThis.__DSH_SIDEBAR_DOM_STOP__;
      if (typeof previous === "function") {
        try {
          previous();
        } catch (_error) {
          /* the previous loop is already gone */
        }
      }
      const loop = bridgeLoop(ctx);
      globalThis.__DSH_SIDEBAR_DOM_STOP__ = loop.stop;
      ctx.effect(
        () => () => {
          loop.stop();
          if (globalThis.__DSH_SIDEBAR_DOM_STOP__ === loop.stop) globalThis.__DSH_SIDEBAR_DOM_STOP__ = undefined;
        },
        "sidebar-browser-dom: bridge lifetime",
      );
    }

    return { inject, apply };
  },
});
