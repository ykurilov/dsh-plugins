/**
 * Stable entry for the Sidebar Browser DOM bridge.
 *
 * The implementation loads through a query-busting URL on every activation so
 * an edited `impl.js` takes effect on the next recomposition instead of being
 * frozen by the ESM module cache.
 */

export const name = 'panel-dom';

export const inject = ['tools', 'connection', 'webServer', 'attachments'];

export async function apply(ctx) {
  const impl = await import(`./impl.js?t=${Date.now()}`);
  await impl.apply(ctx);
}
