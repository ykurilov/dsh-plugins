window.__ModuleLoader__.load({
  id: '@local/sidebar-balance',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Dictionary namespace owned by this plugin. */
    const NS = 'sidebar-balance';
    /** Identity sent with every Platform wallet read; only the locale matters for the wire. */
    const CLIENT_VERSION = '1.0.0';
    /** How often the account state is re-read (cheap, local to the Host). */
    const STATE_POLL_MS = 15_000;
    /** How long a wallet read stays fresh before the next Platform request. */
    const WALLET_TTL_MS = 60_000;

    const IDLE = Object.freeze({ phase: 'idle', wallets: [], bonusWallets: [] });

    /** One observable snapshot of the account balance for the footer row. */
    function createBalanceStore() {
      let snapshot = IDLE;
      const listeners = new Set();
      return {
        getSnapshot: () => snapshot,
        subscribe(listener) {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        publish(next) {
          if (
            next.phase === snapshot.phase &&
            sameWallets(next.wallets, snapshot.wallets) &&
            sameWallets(next.bonusWallets, snapshot.bonusWallets)
          ) {
            return;
          }
          snapshot = next;
          for (const listener of listeners) listener();
        },
      };
    }

    /** Compare two wallet lists by currency and amount. */
    function sameWallets(left, right) {
      if (left === right) return true;
      if (left.length !== right.length) return false;
      for (let index = 0; index < left.length; index += 1) {
        if (left[index].currency !== right[index].currency) return false;
        if (left[index].balance !== right[index].balance) return false;
      }
      return true;
    }

    /**
     * Format a balance using the Platform Web display rules: grouped integer part,
     * two truncated decimals, and a visible marker below one cent.
     * @param raw - decimal balance string as Platform returns it.
     * @param symbol - currency symbol.
     * @returns signed currency text.
     */
    function formatMoney(raw, symbol) {
      const text = String(raw ?? '').trim();
      const value = Number(text);
      if (!Number.isFinite(value)) return `${symbol}${text}`;
      const sign = value < 0 ? '-' : '';
      const absolute = Math.abs(value);
      if (absolute === 0) return `${sign}${symbol}0.00`;
      if (absolute < 0.01) return value < 0 ? `-${symbol}0.01` : `<${symbol}0.01`;
      const body = text.replace(/^[-+]/, '');
      const [integerRaw = '0', fractionRaw = ''] = body.split('.');
      const integer = integerRaw.replace(/^0+(?=\d)/, '') || '0';
      const fraction = `${fractionRaw}00`.slice(0, 2);
      return `${sign}${symbol}${Number(integer).toLocaleString()}.${fraction}`;
    }

    /** Currency symbol Platform Web pairs with each wallet currency. */
    function symbolOf(currency) {
      return currency === 'CNY' ? '¥' : '$';
    }

    const ROW_BASE = {
      boxSizing: 'border-box',
      display: 'flex',
      alignItems: 'baseline',
      minWidth: 0,
      whiteSpace: 'nowrap',
    };
    const LABEL_STYLE = {
      flex: '1 1 auto',
      minWidth: 0,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      fontSize: 12,
      lineHeight: '18px',
      fontWeight: 400,
      color: 'var(--dsw-alias-label-secondary)',
    };
    const AMOUNT_STYLE = {
      flex: 'none',
      fontSize: 13,
      lineHeight: '18px',
      fontWeight: 500,
      color: 'var(--dsw-alias-label-primary)',
      fontVariantNumeric: 'tabular-nums',
      letterSpacing: 0,
    };
    const BONUS_STYLE = {
      flex: 'none',
      marginLeft: 6,
      fontSize: 12,
      lineHeight: '18px',
      fontWeight: 400,
      color: 'var(--dsw-alias-label-secondary)',
      fontVariantNumeric: 'tabular-nums',
    };

    /**
     * Balance line above the sidebar account row.
     * @param props - owner column state, the balance hook and the bound translator.
     * @returns the row, or nothing while signed out or before the first read.
     */
    function BalanceRow({ wide, useBalance, t }) {
      const state = useBalance((value) => value);
      if (state.phase !== 'ready') return null;
      const wallets = state.wallets ?? [];
      const bonus = (state.bonusWallets ?? []).filter((wallet) => Number(wallet.balance) > 0);
      if (wallets.length === 0 && bonus.length === 0) return null;
      const label = t('label');
      const main = wallets.map((wallet) => formatMoney(wallet.balance, symbolOf(wallet.currency)));
      const granted = bonus.map((wallet) => `+${formatMoney(wallet.balance, symbolOf(wallet.currency))}`);
      const balanceText = main.join(' + ');
      const grantedText = granted.join(' + ');
      const summary =
        grantedText === '' ? `${label}: ${balanceText}` : `${label}: ${balanceText}, ${t('bonus')} ${grantedText}`;
      if (!wide) return null;
      return h(
        'div',
        {
          'data-sidebar-balance': true,
          'aria-label': summary,
          title: summary,
          style: { ...ROW_BASE, justifyContent: 'space-between', gap: 8, padding: '3px 8px 5px', flex: '1 1 auto' },
        },
        h('span', { style: LABEL_STYLE }, label),
        h(
          'span',
          { style: { flex: 'none', display: 'inline-flex', alignItems: 'baseline', minWidth: 0 } },
          balanceText !== '' && h('span', { style: AMOUNT_STYLE }, balanceText),
          grantedText !== '' && h('span', { style: BONUS_STYLE }, `(${grantedText})`),
        ),
      );
    }

    return {
      inject: ['slots', 'locale', 'remote', 'remote.account'],
      apply(ctx) {
        ctx.effect(
          () =>
            ctx.locale.register(NS, {
              en: { label: 'Balance', bonus: 'bonus' },
              ru: { label: 'Баланс', bonus: 'бонус' },
              zh: { label: '余额', bonus: '赠金' },
            }),
          'balance: dictionaries',
        );

        const store = createBalanceStore();
        let disposed = false;
        let reading = false;
        let lastWalletRead = 0;

        /** Client identity for one wallet read, carrying the locale in effect now. */
        const clientMetadata = () => ({
          version: CLIENT_VERSION,
          locale: ctx.locale.getSnapshot().active,
          timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
        });

        /** Read the account state and, while signed in, refresh a stale wallet read. */
        const tick = async (force) => {
          if (disposed || reading) return;
          reading = true;
          try {
            const state = await ctx.remote.account.getState();
            if (disposed || !state.ok) return;
            const view = state.value;
            if (view === undefined || view === null || view.status !== 'credential-stored') {
              lastWalletRead = 0;
              store.publish(IDLE);
              return;
            }
            const fresh = Date.now() - lastWalletRead < WALLET_TTL_MS && store.getSnapshot().phase === 'ready';
            if (!force && fresh) return;
            const result = await ctx.remote.account.getBalance(clientMetadata());
            if (disposed || !result.ok) return;
            const balance = result.value;
            if (balance === null) {
              lastWalletRead = 0;
              store.publish(IDLE);
              return;
            }
            if (balance.status !== 'ready') return;
            lastWalletRead = Date.now();
            store.publish({
              phase: 'ready',
              wallets: balance.value ?? [],
              bonusWallets: balance.bonusWallets ?? [],
            });
          } catch (_error) {
            /* A failed read keeps the last settled balance on screen. */
          } finally {
            reading = false;
          }
        };

        ctx.effect(() => {
          let stopped = false;
          void tick(true);
          const timer = setInterval(() => {
            if (!stopped && document.visibilityState !== 'hidden') void tick(false);
          }, STATE_POLL_MS);
          const onFocus = () => {
            if (!stopped) void tick(true);
          };
          const onVisibility = () => {
            if (!stopped && document.visibilityState === 'visible') void tick(true);
          };
          window.addEventListener('focus', onFocus);
          document.addEventListener('visibilitychange', onVisibility);
          return () => {
            stopped = true;
            clearInterval(timer);
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onVisibility);
          };
        }, 'balance: refresh loop');

        ctx.effect(
          () => () => {
            disposed = true;
            store.publish(IDLE);
          },
          'balance: snapshot lifetime',
        );

        ctx.slots.inject('sidebar.footer.action', () =>
          ctx.slots.register(
            {
              name: 'sidebar.footer.action',
              id: 'balance',
              order: -10,
              locale: NS,
              inject: () => ({ hooks: { balance: store } }),
            },
            BalanceRow,
          ),
        );
      },
    };
  },
});
