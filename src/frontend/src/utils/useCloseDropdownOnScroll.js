import { useEffect } from 'react';

/**
 * Close an open dropdown when the SURROUNDING page/container scrolls.
 *
 * Ant Design renders a Select's popup in a portal (fixed-positioned), so when
 * the page (or a drawer body) is scrolled the popup stays floating, detached
 * from its field. This hook closes it on any scroll EXCEPT scrolling INSIDE a
 * dropdown popup itself — so the user can still wheel through a long list.
 *
 * Shared deliberately: applied once at the reusable Select level rather than
 * sprinkling window listeners across pages.
 *
 * @param {boolean} open  is the dropdown currently open
 * @param {() => void} onClose  called to close it
 */
export function useCloseDropdownOnScroll(open, onClose) {
  useEffect(() => {
    if (!open || typeof onClose !== 'function') return undefined;
    const handler = (e) => {
      const t = e && e.target;
      // Scrolling inside a popup (Select / Dropdown / DatePicker / Tooltip) must
      // NOT close it.
      if (t && typeof t.closest === 'function'
        && t.closest('.ant-select-dropdown, .ant-dropdown, .ant-picker-dropdown, .ant-tooltip')) {
        return;
      }
      onClose();
    };
    // Capture phase so a scroll on an inner scrollable container (drawer body,
    // table wrapper) is also caught, not just the window scroll.
    window.addEventListener('scroll', handler, true);
    return () => window.removeEventListener('scroll', handler, true);
  }, [open, onClose]);
}

export default useCloseDropdownOnScroll;
