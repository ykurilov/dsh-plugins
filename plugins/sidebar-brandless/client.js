/**
 * Client half of the sidebar-brandless bundle.
 *
 * Two small changes, both in the sidebar header:
 *
 * 1. The `sidebar.brand.mark` and `sidebar.brand.name` seats — the whale mark
 *    and the wordmark — render nothing. They are the shell's documented brand
 *    seats, so filling them keeps the rail geometry and removes the fallback
 *    mark at the same time.
 * 2. The row that held them collapses to whatever the shell still keeps in it.
 *    On the Desktop sidebar the row carries nothing else, so it shrinks to zero
 *    and "New session" moves up under the window controls; in a browser, where
 *    the same row also holds the collapse toggle, the row keeps just that
 *    toggle and no empty brand space.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-sidebar-brandless',
  factory() {
    /** A seat that stays empty. */
    const Empty = () => null;

    const styles = `
      /* Keep only the controls the brand row still carries. */
      [class*="logoRow"] {
        height: auto !important;
        min-height: 0 !important;
        margin-bottom: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
      }
      /* Nothing branding the top-left corner: the branded child of that row. */
      [class*="logoRow"] > :has([data-slot="sidebar.brand.name"]) {
        display: none !important;
      }
      /* The collapsed rail kept its only glyph in the emptied mark seat; show the
         panel icon it already swaps to on hover, so the button stays visible. */
      [class*="toggle"] [class*="panelIcon"] {
        display: inline !important;
      }
    `;

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.inject('sidebar.brand.name', function* () {
          yield ctx.slots.register({ name: 'sidebar.brand.mark' }, Empty);
          yield ctx.slots.register({ name: 'sidebar.brand.name' }, Empty);
        }));

        ctx.effect(() => {
          const style = document.createElement('style');
          style.dataset.dshPlugin = 'sidebar-brandless';
          style.textContent = styles;
          document.head.append(style);
          return () => {
            style.remove();
          };
        });
      },
    };
  },
});
