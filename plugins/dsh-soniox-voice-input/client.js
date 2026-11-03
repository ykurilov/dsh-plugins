window.__ModuleLoader__.load({
  id: 'dsh-soniox-voice-input',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Locale namespace owned by this bundle. */
    const NS = 'sonioxVoice';

    const STATUS_URL = '/soniox-voice/status';
    const TEMPORARY_KEY_URL = '/soniox-voice/temporary-key';
    const SONIOX_SOCKET_URL = 'wss://stt-rt.soniox.com/transcribe-websocket';
    const DEFAULT_MODEL = 'stt-rt-v5';

    const EN = {
      title: 'Dictate with Soniox',
      starting: 'Connecting to Soniox…',
      recording: 'Listening…',
      finishing: 'Finishing transcript…',
      stop: 'Stop dictation',
      stopSend: 'Stop and send',
      send: 'Send',
      cancel: 'Cancel dictation',
      insert: 'Insert text',
      dismiss: 'Dismiss',
      empty: 'No speech recognized',
      conflict: 'The draft changed — the rest of the transcript is kept for explicit insertion',
      denied: 'Microphone access was denied',
      unavailable: 'Soniox voice input is unavailable',
      connectionFailed: 'Could not reach Soniox',
      notConfigured: 'No Soniox API key. Save it to {file}',
    };

    const RU = {
      title: 'Голосовой ввод (Soniox)',
      starting: 'Подключаю Soniox…',
      recording: 'Говорите…',
      finishing: 'Собираю текст…',
      stop: 'Закончить диктовку',
      stopSend: 'Закончить и отправить',
      send: 'Отправить',
      cancel: 'Отменить диктовку',
      insert: 'Вставить текст',
      dismiss: 'Закрыть',
      empty: 'Речь не распознана',
      conflict: 'Черновик изменился — остаток текста сохранён, вставьте его кнопкой',
      denied: 'Нет доступа к микрофону',
      unavailable: 'Голосовой ввод Soniox недоступен',
      connectionFailed: 'Не удалось связаться с Soniox',
      notConfigured: 'Нет ключа Soniox. Сохраните его в {file}',
    };

    const CSS = [
      '.dsh-soniox-voice__mic{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background-color .12s ease,color .12s ease}',
      '.dsh-soniox-voice__mic:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.dsh-soniox-voice__mic:focus-visible{outline:2px solid var(--dsw-alias-button-info-fill);outline-offset:1px}',
      '.dsh-soniox-voice__mic:disabled{opacity:.45;cursor:default}',
      '.dsh-soniox-voice__bar{box-sizing:border-box;display:flex;align-items:center;gap:8px;flex:1 1 auto;min-width:0;height:28px;padding:0 2px 0 6px}',
      '.dsh-soniox-voice__dot{flex:none;width:7px;height:7px;border-radius:999px;background:var(--dsw-alias-state-idle-primary)}',
      '.dsh-soniox-voice__dot.is-live{background:var(--dsw-alias-state-error-primary);animation:dsh-soniox-voice-pulse 1.4s ease-in-out infinite}',
      '@keyframes dsh-soniox-voice-pulse{0%,100%{opacity:1}50%{opacity:.35}}',
      '.dsh-soniox-voice__level{flex:none;display:flex;align-items:center;gap:2px;height:16px;width:26px}',
      '.dsh-soniox-voice__level span{display:block;width:3px;height:16px;border-radius:2px;background:var(--dsw-alias-button-info-fill);transform-origin:center;transform:scaleY(.2);transition:transform .08s linear}',
      '.dsh-soniox-voice__text{flex:1 1 auto;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-soniox-voice__text.is-error{color:var(--dsw-alias-state-error-primary)}',
      '.dsh-soniox-voice__time{flex:none;font-size:12px;line-height:18px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary)}',
      '.dsh-soniox-voice__action{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;flex:none;height:24px;min-width:24px;padding:0 6px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:16px;cursor:pointer}',
      '.dsh-soniox-voice__action:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.dsh-soniox-voice__action:focus-visible{outline:2px solid var(--dsw-alias-button-info-fill);outline-offset:1px}',
      '.dsh-soniox-voice__action.is-strong{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}',
      '.dsh-soniox-voice__action.is-send{gap:6px;height:26px;border:0;border-radius:999px;background:var(--dsw-alias-button-info-fill);color:#fff;padding:0 10px 0 9px;font-weight:500}',
      '.dsh-soniox-voice__action.is-send:hover{background:var(--dsw-alias-button-info-fill);color:#fff;filter:brightness(1.08)}',
      '.dsh-soniox-voice__spinner{flex:none;width:12px;height:12px;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-button-info-fill);border-radius:999px;animation:dsh-soniox-voice-spin .9s linear infinite}',
      '@keyframes dsh-soniox-voice-spin{to{transform:rotate(360deg)}}',
      '.dsh-soniox-sidechat{position:fixed;z-index:60;pointer-events:auto;display:flex;align-items:center;justify-content:center;width:28px;height:28px;box-sizing:border-box}',
      '.dsh-soniox-sidechat.is-bar{width:auto;height:auto;justify-content:flex-start;padding:3px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-soft, 0 4px 14px rgba(0,0,0,.12))}',
    ].join('');

    function icon(paths, size) {
      return h(
        'svg',
        {
          viewBox: '0 0 20 20',
          width: size,
          height: size,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
          focusable: 'false',
        },
        paths.map((d, index) =>
          typeof d === 'string'
            ? h('path', { key: index, d })
            : h(d.tag, Object.assign({ key: index }, d.attrs)),
        ),
      );
    }

    const MIC_ICON = [
      { tag: 'rect', attrs: { x: 7.4, y: 2.6, width: 5.2, height: 9, rx: 2.6 } },
      'M4.6 9.2a5.4 5.4 0 0 0 10.8 0',
      'M10 14.6v2.8',
      'M7.2 17.4h5.6',
    ];
    const STOP_ICON = [{ tag: 'rect', attrs: { x: 6.2, y: 6.2, width: 7.6, height: 7.6, rx: 1.6, fill: 'currentColor', stroke: 'none' } }];
    const CLOSE_ICON = ['M6.4 6.4l7.2 7.2', 'M13.6 6.4l-7.2 7.2'];
    const SEND_ICON = ['M10 16V4.6', 'M5.4 9.2 10 4.6l4.6 4.6'];

    function translateOf(props) {
      return typeof props.t === 'function' ? props.t : (key) => EN[key] || key;
    }

    function delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function formatSeconds(total) {
      const minutes = Math.floor(total / 60);
      const seconds = total % 60;
      return minutes + ':' + String(seconds).padStart(2, '0');
    }

    /** Soniox emits control tokens such as `<end>`; they are not dictated text. */
    function isControlToken(text) {
      return /^<[a-z_]+>$/i.test(text);
    }

    /** Stop microphone tracks and tear down the Web Audio graph; safe to call twice. */
    function releaseCapture(session) {
      if (session.rafId) {
        cancelAnimationFrame(session.rafId);
        session.rafId = 0;
      }
      if (session.tickId) {
        clearInterval(session.tickId);
        session.tickId = 0;
      }
      if (session.proc) {
        session.proc.onaudioprocess = null;
        try {
          session.proc.disconnect();
        } catch (_error) {}
        session.proc = null;
      }
      if (session.analyser) {
        try {
          session.analyser.disconnect();
        } catch (_error) {}
        session.analyser = null;
      }
      if (session.source) {
        try {
          session.source.disconnect();
        } catch (_error) {}
        session.source = null;
      }
      if (session.stream) {
        for (const track of session.stream.getTracks()) track.stop();
        session.stream = null;
      }
      if (session.ac) {
        const ac = session.ac;
        session.ac = null;
        ac.close().catch(() => {});
      }
    }

    /** Close the socket without waiting for the server. */
    function closeSocket(session) {
      const ws = session.ws;
      session.ws = null;
      if (!ws) return;
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      try {
        ws.close();
      } catch (_error) {}
    }

    function releaseSession(session) {
      releaseCapture(session);
      closeSocket(session);
      if (session.resolveFinished) session.resolveFinished();
    }

    /**
     * Live dictation control for the composer tool row.
     *
     * Finalized Soniox tokens are written straight into the session draft, so the
     * composer's own Send button always holds the dictated text and stays usable
     * while the microphone is open. This row therefore only offers stop and cancel.
     * @param props - draft insertion actions, the activity contract and input hooks.
     */
    function SonioxVoiceInput(props) {
      const t = translateOf(props);
      const inputActions = props.inputActions;
      const locked = props.locked === true;
      const onActiveChange = props.onActiveChange;
      const useInput = props.useInput;

      // Presence of the hook is stable for one slot registration, so the
      // conditional call keeps the hook order fixed across renders.
      const draftText =
        typeof useInput === 'function'
          ? useInput((state) => (state && typeof state.draft === 'string' ? state.draft : ''))
          : '';
      const inputPhase =
        typeof useInput === 'function' ? useInput((state) => (state && state.phase) || 'inert') : 'inert';

      const [phase, setPhase] = React.useState('idle');
      const [statusInfo, setStatusInfo] = React.useState(null);
      const [level, setLevel] = React.useState(0);
      const [seconds, setSeconds] = React.useState(0);
      const [notice, setNotice] = React.useState('');
      const [pending, setPending] = React.useState('');

      const session = React.useRef(null);
      const stopRef = React.useRef(async () => {});
      const generation = React.useRef(0);
      const draftRef = React.useRef('');
      const expanded = phase !== 'idle';

      React.useEffect(() => {
        draftRef.current = typeof draftText === 'string' ? draftText : '';
      }, [draftText]);

      React.useLayoutEffect(() => {
        onActiveChange(expanded);
        return () => onActiveChange(false);
      }, [expanded, onActiveChange]);

      React.useEffect(() => {
        let alive = true;
        fetch(STATUS_URL, { headers: { accept: 'application/json' } })
          .then((response) => (response.ok ? response.json() : null))
          .then((body) => {
            if (alive && body) setStatusInfo(body);
          })
          .catch(() => {});
        return () => {
          alive = false;
        };
      }, []);

      React.useEffect(
        () => () => {
          generation.current += 1;
          const current = session.current;
          session.current = null;
          if (current) releaseSession(current);
        },
        [],
      );

      // A failure notice is informational: collapse it after a moment.
      React.useEffect(() => {
        if (phase !== 'error') return undefined;
        const timer = setTimeout(() => {
          setPhase('idle');
          setNotice('');
        }, 7000);
        return () => clearTimeout(timer);
      }, [phase]);

      const settle = React.useCallback(() => {
        session.current = null;
        setPhase('idle');
        setNotice('');
        setPending('');
        setSeconds(0);
        setLevel(0);
      }, []);

      const abort = React.useCallback(() => {
        generation.current += 1;
        const current = session.current;
        session.current = null;
        if (current) releaseSession(current);
        settle();
      }, [settle]);

      // The composer's own Send (or Enter) is the send path: the dictated text is
      // already in the draft, so a submission means this dictation is over. A
      // draft cleared after our own insertion is the same signal, which also
      // covers a submission the phase hook never rendered.
      React.useEffect(() => {
        const current = session.current;
        if (current === null) return;
        if (inputPhase === 'submitting' || inputPhase === 'adjudicating') {
          abort();
          return;
        }
        if (!current.insertedText || typeof draftText !== 'string') return;
        // A draft that held our own text and then emptied was submitted; the first
        // render after our write can still carry the old empty snapshot, so wait
        // until this session has once seen the draft with its text in it.
        if (draftText.trim() !== '') {
          current.sawDraft = true;
          return;
        }
        if (current.sawDraft) abort();
      }, [inputPhase, draftText, abort]);

      React.useEffect(() => {
        if (!expanded) return undefined;
        const onVisibility = () => {
          if (document.hidden) abort();
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
          document.removeEventListener('visibilitychange', onVisibility);
        };
      }, [expanded, abort]);

      /**
       * Keep the dictated text visible in the draft while the user is still
       * speaking. Soniox reports one growing hypothesis until it finalizes, so the
       * method rewrites only the tail it wrote last: committed words stay, the
       * hypothesis is replaced in place. Any foreign edit freezes live writing and
       * the not-yet-written tail is kept for the explicit insert action.
       */
      const writeLive = (finalized, hypothesis) => {
        const current = session.current;
        if (!current) return;
        if (typeof inputActions?.insertText !== 'function') {
          current.held += finalized;
          return;
        }
        if (current.conflict) {
          current.held += finalized;
          return;
        }
        if (finalized === '' && hypothesis === '' && current.tailText === '') return;
        if (current.tailStart !== null && finalized === '' && hypothesis === current.tailText) return;

        let caret = null;
        try {
          caret = inputActions.captureInsertion();
        } catch (_error) {
          caret = null;
        }
        const conflict = () => {
          current.conflict = true;
          current.held += finalized;
          setNotice(t('conflict'));
        };
        if (caret === null) {
          conflict();
          return;
        }
        if (current.expectedRev !== null && caret.draftRev !== current.expectedRev) {
          conflict();
          return;
        }

        let text;
        let span;
        if (current.tailStart === null) {
          const start = caret.start;
          const candidate = finalized + hypothesis;
          let prefix = '';
          const before = draftRef.current.slice(0, start);
          if (before !== '' && !/\s$/.test(before) && candidate !== '' && !/^\s/.test(candidate)) prefix = ' ';
          text = prefix + candidate;
          span = { start, end: start, draftRev: caret.draftRev };
          current.tailStart = start + prefix.length + finalized.length;
        } else {
          text = finalized + hypothesis;
          span = {
            start: current.tailStart,
            end: current.tailStart + current.tailText.length,
            draftRev: caret.draftRev,
          };
          current.tailStart = current.tailStart + finalized.length;
        }

        let applied = false;
        try {
          applied = inputActions.insertText(text, span);
        } catch (_error) {
          applied = false;
        }
        if (!applied) {
          conflict();
          return;
        }
        current.tailText = hypothesis;
        current.insertedText = true;
        try {
          current.expectedRev = inputActions.captureInsertion().draftRev;
        } catch (_error) {
          current.expectedRev = null;
        }
      };

      const begin = async () => {
        if (session.current || locked) return;
        setNotice('');
        setPending('');
        setSeconds(0);
        setLevel(0);
        setPhase('starting');

        const run = ++generation.current;
        const current = {
          phase: 'starting',
          finals: '',
          held: '',
          expectedRev: null,
          tailStart: null,
          tailText: '',
          insertedText: false,
          conflict: false,
          startedAt: Date.now(),
        };
        current.finished = new Promise((resolve) => {
          current.resolveFinished = resolve;
        });
        session.current = current;
        try {
          let readiness = statusInfo;
          if (readiness === null || readiness.configured === undefined) {
            const response = await fetch(STATUS_URL, { headers: { accept: 'application/json' } });
            readiness = response.ok ? await response.json() : null;
          }
          if (run !== generation.current) return;
          if (readiness === null || readiness.configured !== true) {
            throw new Error(
              t('notConfigured').replace('{file}', (readiness && readiness.keyFile) || '~/.codex/secrets/soniox-api-key.txt'),
            );
          }

          const keyResponse = await fetch(TEMPORARY_KEY_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
          });
          const keyBody = await keyResponse.json().catch(() => null);
          if (run !== generation.current) return;
          if (!keyResponse.ok || keyBody === null || typeof keyBody.apiKey !== 'string') {
            throw new Error((keyBody && typeof keyBody.message === 'string' && keyBody.message) || t('unavailable'));
          }

          let stream;
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            });
          } catch (_error) {
            throw new Error(t('denied'));
          }
          if (run !== generation.current) {
            for (const track of stream.getTracks()) track.stop();
            return;
          }
          current.stream = stream;

          const AudioCtor = window.AudioContext || window.webkitAudioContext;
          const ac = new AudioCtor({ sampleRate: 16000 });
          current.ac = ac;
          if (ac.state === 'suspended') await ac.resume();
          const source = ac.createMediaStreamSource(stream);
          current.source = source;
          const analyser = ac.createAnalyser();
          analyser.fftSize = 512;
          current.analyser = analyser;
          source.connect(analyser);

          const ws = new WebSocket(SONIOX_SOCKET_URL, ['soniox-api-key', keyBody.apiKey]);
          ws.binaryType = 'arraybuffer';
          current.ws = ws;

          const config = {
            model: typeof keyBody.model === 'string' && keyBody.model !== '' ? keyBody.model : DEFAULT_MODEL,
            audio_format: 'pcm_s16le',
            sample_rate: Math.round(ac.sampleRate),
            num_channels: 1,
            enable_endpoint_detection: true,
          };
          if (Array.isArray(keyBody.languageHints) && keyBody.languageHints.length > 0) {
            config.language_hints = keyBody.languageHints;
          }

          const fail = (error) => {
            if (run !== generation.current) return;
            const message = error && error.message ? error.message : t('unavailable');
            session.current = null;
            releaseSession(current);
            setNotice(message);
            setPhase('error');
          };

          ws.onopen = () => {
            if (run !== generation.current) return;
            try {
              ws.send(JSON.stringify(config));
            } catch (_error) {
              fail(new Error(t('connectionFailed')));
            }
          };

          ws.onmessage = (event) => {
            if (run !== generation.current || typeof event.data !== 'string') return;
            let message;
            try {
              message = JSON.parse(event.data);
            } catch (_error) {
              return;
            }
            if (typeof message.error_code === 'number') {
              fail(new Error(typeof message.error_message === 'string' ? message.error_message : t('connectionFailed')));
              return;
            }
            const tokens = Array.isArray(message.tokens) ? message.tokens : [];
            let finalized = '';
            let hypothesis = '';
            for (const token of tokens) {
              if (!token || typeof token.text !== 'string' || token.translation_status !== undefined) continue;
              if (isControlToken(token.text)) continue;
              if (token.is_final === true) finalized += token.text;
              else hypothesis += token.text;
            }
            if (finalized !== '') current.finals = (current.finals || '') + finalized;
            try {
              writeLive(finalized, hypothesis);
            } catch (error) {
              console.error('soniox-voice-input: live write failed', error);
              current.conflict = true;
              current.held += finalized;
              setNotice(t('conflict'));
            }
            if (message.finished === true && current.resolveFinished) current.resolveFinished();
          };

          ws.onerror = () => fail(new Error(t('connectionFailed')));
          ws.onclose = () => {
            if (current.resolveFinished) current.resolveFinished();
          };

          const proc = ac.createScriptProcessor(2048, 1, 1);
          current.proc = proc;
          proc.onaudioprocess = (event) => {
            if (run !== generation.current) return;
            if (!current.ws || current.ws.readyState !== 1) return;
            const channel = event.inputBuffer.getChannelData(0);
            const pcm = new DataView(new ArrayBuffer(channel.length * 2));
            for (let index = 0; index < channel.length; index += 1) {
              const sample = Math.max(-1, Math.min(1, channel[index]));
              pcm.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
            }
            try {
              current.ws.send(pcm.buffer);
            } catch (_error) {}
          };
          source.connect(proc);
          proc.connect(ac.destination);

          const samples = new Uint8Array(analyser.fftSize);
          const measure = () => {
            if (!current.analyser) return;
            analyser.getByteTimeDomainData(samples);
            let sum = 0;
            for (let index = 0; index < samples.length; index += 1) {
              const value = (samples[index] - 128) / 128;
              sum += value * value;
            }
            const rms = Math.sqrt(sum / samples.length);
            const next = Math.min(1, Math.max(0, (rms - 0.008) * 7));
            if (Math.abs(next - current.level) > 0.07) {
              current.level = next;
              setLevel(next);
            }
            current.rafId = requestAnimationFrame(measure);
          };
          current.rafId = requestAnimationFrame(measure);

          current.tickId = setInterval(() => {
            if (run !== generation.current) return;
            setSeconds(Math.floor((Date.now() - current.startedAt) / 1000));
          }, 500);

          current.phase = 'recording';
          setPhase('recording');
        } catch (error) {
          if (run !== generation.current) return;
          session.current = null;
          releaseSession(current);
          setNotice(error && error.message ? error.message : t('unavailable'));
          setPhase('error');
        }
      };

      /**
       * Close the stream, wait for the last audio to be transcribed, and — when
       * the user asked for it — hand the finished draft to the composer's own
       * submit. The wait is the point: Soniox finalizes the tail only after the
       * stream ends, and sending before that loses the last words.
       */
      const stop = async (send) => {
        const current = session.current;
        if (!current || current.phase !== 'recording') return;
        current.phase = 'finishing';
        setPhase('finishing');
        releaseCapture(current);
        try {
          if (current.ws) current.ws.send('');
        } catch (_error) {}
        await Promise.race([current.finished, delay(4000)]);
        closeSocket(current);
        if (session.current !== current) return;
        if (current.conflict && current.held.trim() !== '') {
          setPending(current.held.trim());
          setNotice(t('conflict'));
          setPhase('pending');
          return;
        }
        if ((current.finals || '').trim() === '' && current.held.trim() === '') {
          session.current = null;
          setNotice(t('empty'));
          setPhase('error');
          return;
        }
        if (send === true) {
          try {
            inputActions.submit();
          } catch (_error) {}
        }
        settle();
      };
      stopRef.current = stop;

      const insertPending = () => {
        const text = pending.trim();
        if (text === '') {
          settle();
          return;
        }
        let caret = null;
        try {
          caret = inputActions.captureInsertion();
        } catch (_error) {
          caret = null;
        }
        if (caret !== null) {
          let piece = text;
          const before = draftRef.current.slice(0, caret.start);
          if (before !== '' && !/\s$/.test(before) && !/^\s/.test(piece)) piece = ' ' + piece;
          let applied = false;
          try {
            applied = inputActions.insertText(piece, caret);
          } catch (_error) {
            applied = false;
          }
          if (applied) {
            settle();
            return;
          }
        }
        setNotice(t('unavailable'));
      };

      // Escape ends an active dictation (the transcript is already in the draft)
      // and dismisses a finished notice. It never discards recognized text.
      React.useEffect(() => {
        if (!expanded) return undefined;
        const onKey = (event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          const current = session.current;
          if (current !== null && current.phase === 'recording') void stopRef.current();
          else abort();
        };
        document.addEventListener('keydown', onKey);
        return () => {
          document.removeEventListener('keydown', onKey);
        };
      }, [expanded, abort]);

      if (!expanded) {
        return h(
          'button',
          {
            type: 'button',
            className: 'dsh-soniox-voice__mic',
            title: t('title'),
            'aria-label': t('title'),
            disabled: locked,
            onClick: begin,
          },
          icon(MIC_ICON, 18),
        );
      }

      const bars = [];
      if (phase === 'recording') {
        for (let index = 0; index < 5; index += 1) {
          const factor = 0.25 + level * (0.45 + 0.55 * Math.abs(Math.sin((index + 1) * 1.1 + level * 4)));
          bars.push(
            h('span', {
              key: index,
              style: { transform: 'scaleY(' + Math.max(0.18, Math.min(1, factor)).toFixed(3) + ')' },
            }),
          );
        }
      }

      let text;
      if (phase === 'recording') {
        text = notice === '' ? t('recording') : notice;
      } else if (phase === 'starting') {
        text = t('starting');
      } else if (phase === 'finishing') {
        text = t('finishing');
      } else if (phase === 'pending') {
        text = notice;
      } else {
        text = notice;
      }

      const controls = [];
      if (phase === 'recording') {
        controls.push(
          h('span', { key: 'time', className: 'dsh-soniox-voice__time' }, formatSeconds(seconds)),
          h(
            'button',
            {
              key: 'stop',
              type: 'button',
              className: 'dsh-soniox-voice__action is-strong',
              title: t('stop'),
              'aria-label': t('stop'),
              onClick: () => stop(false),
            },
            icon(STOP_ICON, 16),
          ),
          h(
            'button',
            {
              key: 'send',
              type: 'button',
              className: 'dsh-soniox-voice__action is-send',
              title: t('stopSend'),
              'aria-label': t('stopSend'),
              onClick: () => stop(true),
            },
            icon(SEND_ICON, 14),
            t('send'),
          ),
        );
      } else if (phase === 'pending') {
        controls.push(
          h(
            'button',
            {
              key: 'cancel',
              type: 'button',
              className: 'dsh-soniox-voice__action',
              title: t('cancel'),
              'aria-label': t('cancel'),
              onClick: abort,
            },
            icon(CLOSE_ICON, 16),
          ),
          h(
            'button',
            {
              key: 'insert',
              type: 'button',
              className: 'dsh-soniox-voice__action is-strong',
              title: t('insert'),
              onClick: insertPending,
            },
            t('insert'),
          ),
        );
      } else if (phase === 'starting' || phase === 'finishing') {
        controls.push(h('span', { key: 'spinner', className: 'dsh-soniox-voice__spinner', 'aria-hidden': 'true' }));
      } else {
        controls.push(
          h(
            'button',
            {
              key: 'dismiss',
              type: 'button',
              className: 'dsh-soniox-voice__action',
              title: t('dismiss'),
              'aria-label': t('dismiss'),
              onClick: abort,
            },
            icon(CLOSE_ICON, 16),
          ),
        );
      }

      return h(
        'div',
        {
          className: 'dsh-soniox-voice__bar',
          role: 'group',
          'aria-label': t('title'),
        },
        h('span', {
          className: 'dsh-soniox-voice__dot' + (phase === 'recording' ? ' is-live' : ''),
          'aria-hidden': 'true',
        }),
        phase === 'recording' ? h('span', { className: 'dsh-soniox-voice__level', 'aria-hidden': 'true' }, bars) : null,
        h('span', { className: 'dsh-soniox-voice__text' + (phase === 'error' ? ' is-error' : '') }, text),
        ...controls,
      );
    }

    /**
     * Side chat composer bridge.
     *
     * The third-party Side chat tab renders its own textarea instead of the shell
     * composer, so `conversation.input.activity` never reaches it. This adapter
     * exposes that textarea through the same `inputActions` + `useInput` contract
     * the composer row already consumes, so the very same dictation control can
     * write into it without duplicating the Soniox streaming code.
     */
    function createSideChatBridge() {
      const listeners = new Set();
      let state = { draft: '', rev: 0 };
      let element = null;
      let internal = false;
      let timer = 0;
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;

      const emit = () => {
        for (const listener of listeners) listener();
      };
      const subscribe = (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      };
      const snapshot = () => state;

      /** Write through the prototype setter so React's value tracker sees an edit. */
      const write = (next, caret) => {
        if (element === null) return false;
        internal = true;
        try {
          valueSetter.call(element, next);
          element.dispatchEvent(new Event('input', { bubbles: true }));
        } finally {
          internal = false;
        }
        state = { draft: next, rev: state.rev + 1 };
        emit();
        requestAnimationFrame(() => {
          if (element === null) return;
          try {
            element.selectionStart = caret;
            element.selectionEnd = caret;
          } catch (_error) {}
        });
        return true;
      };

      /** Pull a value the composer changed on its own, such as clearing after send. */
      const sync = () => {
        if (element === null || element.value === state.draft) return;
        state = { draft: element.value, rev: state.rev + 1 };
        emit();
      };

      const onInput = () => {
        if (internal) return;
        sync();
      };

      const adopt = (next) => {
        if (next === element) return;
        if (element !== null) element.removeEventListener('input', onInput);
        element = next;
        if (element !== null) element.addEventListener('input', onInput);
        state = { draft: element === null ? '' : element.value, rev: state.rev + 1 };
        emit();
      };

      const findTarget = () => {
        const nodes = document.querySelectorAll('textarea.sc-textarea');
        for (const node of nodes) {
          if (node.offsetParent !== null && node.closest('.sc-composer') !== null) return node;
        }
        return null;
      };

      const start = () => {
        if (timer !== 0) return;
        timer = setInterval(() => {
          const next = findTarget();
          if (next !== element) adopt(next);
          else sync();
        }, 300);
      };

      const useInput = (selector) => React.useSyncExternalStore(subscribe, () => selector(state));

      const inputActions = {
        captureInsertion() {
          if (element === null) throw new Error('side chat composer is not mounted');
          const length = element.value.length;
          const start = typeof element.selectionStart === 'number' ? element.selectionStart : length;
          const end = typeof element.selectionEnd === 'number' ? element.selectionEnd : start;
          return { start, end, draftRev: state.rev };
        },
        insertText(text, span) {
          if (element === null) return false;
          const value = element.value;
          const start = span !== undefined && span !== null && typeof span.start === 'number' ? span.start : value.length;
          const end = span !== undefined && span !== null && typeof span.end === 'number' ? span.end : start;
          return write(value.slice(0, start) + text + value.slice(end), start + text.length);
        },
        submit() {
          if (element === null) return;
          const composer = element.closest('.sc-composer');
          const send = composer === null ? null : composer.querySelector('button.sc-send');
          if (send !== null && send.disabled !== true) send.click();
        },
      };

      return { subscribe, snapshot, useInput, inputActions, start, target: () => element };
    }

    /**
     * The floating voice control for the Side chat tab.
     *
     * Side chat has no composer slot, so the control is placed over its composer
     * from the frame-wide overlay: a mic beside Send while idle, and the full
     * dictation bar just above the composer while a session is open.
     */
    function SideChatVoiceDock(props) {
      const t = translateOf(props);
      const bridge = props.bridge;
      const target = React.useSyncExternalStore(bridge.subscribe, bridge.target);
      const [expanded, setExpanded] = React.useState(false);
      const [box, setBox] = React.useState(null);

      React.useEffect(() => {
        bridge.start();
      }, [bridge]);

      React.useEffect(() => {
        if (target === null) {
          setBox(null);
          return undefined;
        }
        let raf = 0;
        const measure = () => {
          const composer = target.closest('.sc-composer');
          if (composer === null) {
            setBox(null);
            raf = requestAnimationFrame(measure);
            return;
          }
          const frame = composer.getBoundingClientRect();
          const send = composer.querySelector('button.sc-send');
          const sendFrame = send === null ? null : send.getBoundingClientRect();
          const next = expanded
            ? { left: Math.round(frame.left), top: Math.round(frame.top) - 40, width: Math.round(frame.width), bar: true }
            : {
                left: Math.round((sendFrame === null ? frame.right - 40 : sendFrame.left) - 34),
                top: Math.round((sendFrame === null ? frame.bottom - 36 : sendFrame.top) + 2),
                width: 28,
                bar: false,
              };
          setBox((current) =>
            current !== null &&
            current.left === next.left &&
            current.top === next.top &&
            current.width === next.width &&
            current.bar === next.bar
              ? current
              : next,
          );
          raf = requestAnimationFrame(measure);
        };
        measure();
        return () => {
          if (raf !== 0) cancelAnimationFrame(raf);
        };
      }, [target, expanded]);

      if (target === null || box === null) return null;

      return h(
        'div',
        {
          className: 'dsh-soniox-sidechat' + (box.bar ? ' is-bar' : ''),
          style: { left: box.left + 'px', top: box.top + 'px', width: box.width + 'px' },
        },
        h(SonioxVoiceInput, {
          t,
          inputActions: bridge.inputActions,
          useInput: bridge.useInput,
          locked: false,
          onActiveChange: setExpanded,
        }),
      );
    }

    /** A dock failure must hide the control, never take the page down with it. */
    class SideChatVoiceBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { failed: false };
      }
      static getDerivedStateFromError() {
        return { failed: true };
      }
      componentDidCatch(error) {
        console.warn('soniox-voice-input: side chat dock disabled', error);
      }
      render() {
        return this.state.failed ? null : this.props.children;
      }
    }

    const inject = ['slots', 'locale'];

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, 'en', EN), 'soniox-voice-input: en dictionary');
      ctx.effect(() => ctx.locale.register(NS, 'ru', RU), 'soniox-voice-input: ru dictionary');

      ctx.effect(() => {
        const tag = document.createElement('style');
        tag.dataset.plugin = 'dsh-soniox-voice-input';
        tag.textContent = CSS;
        document.head.appendChild(tag);
        return () => {
          tag.remove();
        };
      }, 'soniox-voice-input: styles');

      ctx.slots.inject('conversation.input.activity', () =>
        ctx.slots.register(
          {
            name: 'conversation.input.activity',
            locale: NS,
          },
          SonioxVoiceInput,
        ),
      );

      try {
        const bridge = createSideChatBridge();
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            {
              name: 'shell.overlay',
              id: 'soniox-sidechat-voice',
            },
            () =>
              h(
                SideChatVoiceBoundary,
                null,
                h(SideChatVoiceDock, { bridge, t: ctx.locale.bind(NS) }),
              ),
          ),
        );
      } catch (error) {
        console.warn('soniox-voice-input: side chat dock unavailable', error);
      }
    }

    return { inject, apply };
  },
});
