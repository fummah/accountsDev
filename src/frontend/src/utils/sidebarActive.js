/**
 * sidebarActive.js — route-based active-state resolution for the sidebar.
 *
 * The active menu item is derived ENTIRELY from the current route (never from a
 * click handler), so refresh, back/forward, deep links and programmatic
 * navigation all resolve correctly.
 *
 * Each menu entry has a canonical `key` (its route, without the leading slash)
 * plus optional `aliases` (related nested routes that should keep the same item
 * highlighted — e.g. an invoice DETAIL page keeps "Invoices" active).
 *
 * `resolveActiveMenuKey` returns the menu key whose route/alias is the LONGEST
 * prefix of the current path, which prevents a short route from stealing the
 * highlight from a more specific one.
 */

export const normalizePath = (p) => {
  const s = String(p == null ? '/' : p).split('?')[0].split('#')[0];
  const t = s.replace(/\/+$/, '');
  return t === '' ? '/' : t;
};

const toPath = (r) => {
  const s = normalizePath(r);
  return s.startsWith('/') ? s : `/${s}`;
};

/** Does `pathname` belong to `route` (exact or a nested child), or any alias? */
export const isRouteActive = (pathname, route, aliases = []) => {
  const path = toPath(pathname);
  return [route, ...aliases].filter(Boolean).map(toPath)
    .some((t) => path === t || path.startsWith(`${t}/`));
};

/** The best (longest-prefix) matching menu key for the current pathname. */
export const resolveActiveMenuKey = (pathname, entries = SIDEBAR_MENU) => {
  const path = toPath(pathname);
  let best = null;
  let bestLen = -1;
  for (const entry of entries) {
    for (const target of [entry.key, ...(entry.aliases || [])].map(toPath)) {
      if ((path === target || path.startsWith(`${target}/`)) && target.length > bestLen) {
        bestLen = target.length;
        best = entry.key;
      }
    }
  }
  return best;
};

/** The parent SubMenu key for a menu item (so it stays expanded). */
export const parentOf = (menuKey, entries = SIDEBAR_MENU) => {
  const e = entries.find((x) => x.key === menuKey);
  return e ? (e.parent || null) : null;
};

/**
 * THE sidebar model. `key` = route (no leading slash), `aliases` = nested routes
 * that keep the item active, `parent` = owning SubMenu key (null = top level).
 * Keep this in sync with the menu markup in containers/Sidebar/SidebarContent.js.
 */
export const SIDEBAR_MENU = [
  { key: 'main/dashboard/home-dash', parent: null },
  { key: 'main/dashboard/home', parent: null },

  { key: 'inner/sales', parent: 'sub-sales' },
  { key: 'main/customers/quotes/list', aliases: ['main/customers/quotes'], parent: 'sub-sales' },
  { key: 'main/customers/invoices/list', aliases: ['main/customers/invoices'], parent: 'sub-sales' },
  { key: 'main/customers/payments', aliases: ['main/customers/payment-history'], parent: 'sub-sales' },
  { key: 'main/customers/center', aliases: ['main/customers/details', 'main/customers/list'], parent: 'sub-sales' },
  { key: 'main/customers/leads', parent: 'sub-sales' },

  { key: 'main/vendors/purchasing/dashboard', parent: 'sub-expenses' },
  { key: 'main/vendors/purchasing/reports', parent: 'sub-expenses' },
  { key: 'main/vendors/bills/tracker', aliases: ['main/vendors/bills/edit'], parent: 'sub-expenses' },
  { key: 'main/vendors/bills/enter', aliases: ['main/vendors/bills/new'], parent: 'sub-expenses' },
  { key: 'main/vendors/purchasing/purchase-orders', parent: 'sub-expenses' },
  { key: 'main/vendors/bills/pay', parent: 'sub-expenses' },
  { key: 'main/expenses/credit-cards', parent: 'sub-expenses' },
  { key: 'main/accountant/check-printing', parent: 'sub-expenses' },
  { key: 'main/expenses/suppliers', aliases: ['main/vendors/details', 'main/vendors/list'], parent: 'sub-expenses' },

  { key: 'main/banking/reconcile', parent: 'sub-banking' },
  { key: 'main/bank-statements/list', parent: 'sub-banking' },
  { key: 'main/banking/deposits', parent: 'sub-banking' },

  { key: 'main/inventory/dashboard', parent: 'sub-inventory' },
  { key: 'main/inventory/reorder', parent: 'sub-inventory' },
  { key: 'main/inventory/movement-report', parent: 'sub-inventory' },
  { key: 'main/inventory/profitability', parent: 'sub-inventory' },
  { key: 'main/inventory/items', aliases: ['main/vendors/items'], parent: 'sub-inventory' },
  { key: 'main/inventory/stock', parent: 'sub-inventory' },
  { key: 'main/inventory/warehouses', parent: 'sub-inventory' },
  { key: 'main/inventory/bom', parent: 'sub-inventory' },
  { key: 'main/inventory/serials', parent: 'sub-inventory' },
  { key: 'main/inventory/barcodes', parent: 'sub-inventory' },
  { key: 'main/inventory/adjustments', parent: 'sub-inventory' },
  { key: 'main/inventory/pricing-rules', parent: 'sub-inventory' },
  { key: 'main/inventory/pick-pack-ship', parent: 'sub-inventory' },
  { key: 'main/inventory/alerts', parent: 'sub-inventory' },
  { key: 'main/inventory/reconciliation', parent: 'sub-inventory' },

  { key: 'inner/reports', parent: 'sub-accounting' },
  { key: 'inner/vat', parent: 'sub-accounting' },
  { key: 'main/accountant/chart-of-accounts', parent: 'sub-accounting' },
  { key: 'main/accountant/journal-entries', parent: 'sub-accounting' },
  { key: 'main/accountant/trial-balance', parent: 'sub-accounting' },
  { key: 'main/accountant/general-ledger', parent: 'sub-accounting' },
  { key: 'main/reports/sales', parent: 'sub-accounting' },

  { key: 'main/employees/center', parent: 'sub-more' },
  { key: 'main/projects/center', parent: 'sub-more' },
  { key: 'main/pos/session', parent: 'sub-more' },
  { key: 'main/analytics', parent: 'sub-more' },
  { key: 'inner/profile', parent: 'sub-more' },
  { key: 'main/dashboard/company', parent: 'sub-more' },
];
