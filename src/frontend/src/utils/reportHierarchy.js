// Pure PRESENTATION helpers for hierarchical reports (Profit & Loss, and any
// other report that renders an account tree).
//
// These functions never touch money. They only decide which rows are shown and
// in what order, using the tree produced by buildAccountTree() in
// utils/accounts.js, where each node carries:
//
//   node.amount        — the account's OWN direct postings
//   node.amountDisplay — direct + every descendant (the rollup)
//   node.children      — child nodes, linked strictly by account id
//
// The QuickBooks-style layout this produces is:
//
//   ▼ Parent              (group header — no amount while open)
//       Child             (indented; recurse for deeper levels)
//   Total Parent          (closes the group, re-using the parent's amountDisplay)
//
// Because the subtotal row RE-USES the already-computed rollup, it is never
// summed again: section totals, gross profit and net income are unchanged and
// nothing is double-counted. A parent's own direct activity is already inside
// amountDisplay, so it is neither lost nor counted twice.

/**
 * Flatten a tree into the rows a report table renders.
 *
 * @param {Array} nodes        the account tree (roots)
 * @param {Set<string>} expandedSet  keys of parents currently expanded
 * @returns {Array} rows with `rowKind` = 'leaf' | 'group' | 'subtotal'
 */
export const buildDisplayRows = (nodes, expandedSet) => {
  const out = [];
  const visit = (list, indent) => {
    (Array.isArray(list) ? list : []).forEach((n) => {
      const kids = n.children || [];
      if (!kids.length) {
        // A leaf account stays a normal row — no "Total <Leaf>" row.
        // `children: undefined` keeps antd's Table FLAT: a row that still
        // carried a `children` array would be auto-rendered as a nested tree,
        // duplicating the rows we already emitted here.
        out.push({ ...n, children: undefined, rowKind: 'leaf', indent });
        return;
      }
      const expanded = expandedSet.has(n.key);
      out.push({ ...n, children: undefined, rowKind: 'group', indent, expanded });
      if (expanded) {
        visit(kids, indent + 1);
        out.push({
          ...n,
          children: undefined,
          key: `${n.key}-total`,
          rowKind: 'subtotal',
          indent,
          // Budget matching is by account name; keep the parent name for that
          // lookup while the visible label becomes "Total <Parent>".
          budgetName: n.name,
          name: `Total ${n.name}`,
        });
      }
    });
  };
  visit(nodes, 0);
  return out;
};

/** Every key whose account has children (used by exports to ignore collapse). */
export const allGroupKeys = (nodes) => {
  const keys = [];
  const visit = (list) => (Array.isArray(list) ? list : []).forEach((n) => {
    if (n.children && n.children.length) { keys.push(n.key); visit(n.children); }
  });
  visit(nodes);
  return keys;
};
