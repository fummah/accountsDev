/**
 * drawerWidth.js — responsive width for WIDE detail drawers (vendor, statement…).
 *
 * The spec: ~80vw on large desktop, capped at 1400px, never narrower than 950px,
 * and never wider than the viewport (small screens use the full viewport).
 *
 *   1920 → 1400   (capped)
 *   1600 → 1280   (80vw)
 *   1366 → 1161   (85vw)
 *   1280 → 1152   (90vw)
 *   <1280 → 100vw (min 950)
 *
 * Computed from the Electron window width at open time (drawers do not need to
 * track resize). Only wide drawers use this — normal drawers keep their width.
 */
export const getWideDrawerWidth = () => {
  const w = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1400;
  let px;
  if (w >= 1920) px = Math.min(1400, w * 0.8);
  else if (w >= 1600) px = w * 0.8;
  else if (w >= 1366) px = w * 0.85;
  else if (w >= 1280) px = w * 0.9;
  else px = w; // 100vw
  return Math.round(Math.min(1400, Math.max(950, Math.min(px, w))));
};

export default getWideDrawerWidth;
