window.__ModuleLoader__.load({
  id: '@local/session-spend',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Dictionary namespace owned by this plugin. */
    const NS = 'session-spend';
    /**
     * Estimated prices in USD per one million tokens, by model id.
     *
     * These are editable assumptions, not Platform billing: the Platform charges
     * the account wallet itself, and this row only turns the token counter into a
     * rough figure. `hit` is the cached-input price, `miss` the uncached input
     * price, `write` the cache-write price (DeepSeek does not bill writes), and
     * `output` the completion price. The `deepseek-v4-pro` row is a rough
     * multiplier for the stronger model, since the app only advertises it as
     * "higher cost".
     */
    const PRICES = {
      'deepseek-flash': { miss: 0.28, hit: 0.028, write: 0, output: 0.42 },
      'deepseek-v4-pro': { miss: 0.56, hit: 0.056, write: 0, output: 0.84 },
    };
    /** Tariff used before the Session reports a model and for unknown models. */
    const DEFAULT_PRICE = PRICES['deepseek-flash'];
    /** Human names of the models the price table knows. */
    const MODEL_NAMES = {
      'deepseek-flash': 'DeepSeek-V4.1-Flash',
      'deepseek-v4-pro': 'DeepSeek-V4-Pro',
    };

    const CURRENCY = '$';

    /** Tokens reported for one Session, most specific field names first. */
    function bucketsOf(usage) {
      return {
        miss: Number(usage?.uncachedInputTokens ?? 0),
        hit: Number(usage?.cacheReadTokens ?? 0),
        write: Number(usage?.cacheWriteTokens ?? 0),
        output: Number(usage?.outputTokens ?? 0),
      };
    }

    /** Estimated cost of one token bucket set under one price row. */
    function costOf(buckets, price) {
      return (
        (buckets.miss * price.miss + buckets.hit * price.hit + buckets.write * price.write + buckets.output * price.output) /
        1_000_000
      );
    }

    /**
     * Money text with resolution that follows the amount: cents once the figure is
     * worth reading that way, more digits while the Session is still cheap.
     * @param value - estimated cost in the row's currency.
     * @returns currencies sign and amount.
     */
    function formatMoney(value) {
      if (!(value > 0)) return `${CURRENCY}0.00`;
      const digits = value >= 0.1 ? 2 : value >= 0.01 ? 3 : 4;
      const [integer, fraction] = value.toFixed(digits).split('.');
      return `${CURRENCY}${Number(integer).toLocaleString()}.${fraction}`;
    }

    /** Grouped token count for the tooltip breakdown. */
    function formatTokens(value) {
      return Math.round(value).toLocaleString();
    }

    /** Shared pill geometry, copied from the host composer stats pills. */
    const ANCHOR_STYLE = {
      display: 'inline-flex',
      minWidth: 0,
      fontSize: 'calc(var(--dsh-content-font-size-secondary, 13px) - 1px)',
      lineHeight: 'calc(20px + var(--dsh-content-font-delta-secondary, 0px))',
    };
    const PILL_STYLE = {
      boxSizing: 'border-box',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '1px 8px',
      borderRadius: 'var(--dsw-radius-sm)',
      color: 'var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary))',
      fontVariantNumeric: 'tabular-nums',
      whiteSpace: 'nowrap',
      lineHeight: 'inherit',
    };
    const LABEL_STYLE = {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      minWidth: 0,
    };

    /** A banknote glyph in the host's 14px metric. */
    function SpendIcon() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 14, height: 14, fill: 'none', 'aria-hidden': true, style: { flex: 'none' } },
        h('rect', {
          x: 1.75,
          y: 3.75,
          width: 12.5,
          height: 8.5,
          rx: 2,
          stroke: 'currentColor',
          strokeWidth: 1.25,
        }),
        h('circle', { cx: 8, cy: 8, r: 1.9, stroke: 'currentColor', strokeWidth: 1.25 }),
        h('path', { d: 'M4.4 8h0.9M10.7 8h0.9', stroke: 'currentColor', strokeWidth: 1.25, strokeLinecap: 'round' }),
      );
    }

    /**
     * Estimated Session spend, appended to the composer stats line.
     * @param props - the session projection hooks and the bound translator.
     * @returns the pill, or nothing while the Session reports no tokens.
     */
    function SpendPill({ useProjection, t }) {
      const usage = useProjection('tokenUsage');
      const selection = useProjection('modelSelection');
      const buckets = bucketsOf(usage);
      const total = buckets.miss + buckets.hit + buckets.write + buckets.output;
      if (total === 0) return null;

      const model = selection?.lastUsed?.model;
      const price = (model !== undefined && PRICES[model]) || DEFAULT_PRICE;
      const modelName = MODEL_NAMES[model] ?? MODEL_NAMES['deepseek-flash'];
      const cost = costOf(buckets, price);
      const amount = formatMoney(cost);
      const label = t('label');

      const tooltip = [
        `${label} ${amount}`,
        `${t('inputMiss')}: ${formatTokens(buckets.miss)}`,
        `${t('inputHit')}: ${formatTokens(buckets.hit)}`,
        `${t('output')}: ${formatTokens(buckets.output)}`,
        t('rates', { model: modelName }),
        t('ratesDetail', {
          miss: `${CURRENCY}${price.miss}`,
          hit: `${CURRENCY}${price.hit}`,
          output: `${CURRENCY}${price.output}`,
        }),
      ].join('\n');

      return h(
        'span',
        { style: ANCHOR_STYLE, 'data-composer-stat': 'session-spend' },
        h(
          'span',
          { style: PILL_STYLE, title: tooltip, 'aria-label': `${label} ${amount}` },
          h(SpendIcon, null),
          h('span', { style: LABEL_STYLE }, `${label} ≈ ${amount}`),
        ),
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(
          () =>
            ctx.locale.register(NS, {
              en: {
                label: 'Spent',
                inputMiss: 'Uncached input',
                inputHit: 'Cached input',
                output: 'Output',
                rates: 'Estimated at {model} prices',
                ratesDetail: '{miss} uncached input, {hit} cached input, {output} output per 1M tokens',
              },
              ru: {
                label: 'Потрачено',
                inputMiss: 'Вход без кеша',
                inputHit: 'Вход из кеша',
                output: 'Выход',
                rates: 'Оценка по тарифам {model}',
                ratesDetail: '{miss} вход без кеша, {hit} вход из кеша, {output} выход за 1 млн токенов',
              },
              zh: {
                label: '已用',
                inputMiss: '未命中缓存的输入',
                inputHit: '命中缓存的输入',
                output: '输出',
                rates: '按 {model} 价格估算',
                ratesDetail: '每百万 token {miss} 未命中输入、{hit} 命中输入、{output} 输出',
              },
            }),
          'session-spend: dictionaries',
        );

        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register(
            {
              name: 'conversation.composer.dock',
              id: 'session-spend',
              order: 2,
              locale: NS,
            },
            SpendPill,
          ),
        );
      },
    };
  },
});
