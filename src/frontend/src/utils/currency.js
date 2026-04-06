/**
 * Shared currency utility for the entire application.
 * Fetches the base currency from settings and provides formatting helpers.
 * 
 * Usage in any component:
 *   import { useCurrency, getCurrencySymbol, formatCurrency } from 'utils/currency';
 *   const { symbol, code, loading } = useCurrency();
 *   // or for non-hook contexts:
 *   const sym = getCurrencySymbol(); // returns cached symbol synchronously
 */
import { useState, useEffect, useCallback } from 'react';

// ─── Module-level cache (shared across all components) ─────────────────────
let _cachedSymbol = 'R';
let _cachedCode = 'ZAR';
let _cachedDecimals = 2;
let _loaded = false;
let _loading = false;
let _listeners = [];

const notifyListeners = () => {
  _listeners.forEach(fn => fn({ symbol: _cachedSymbol, code: _cachedCode, decimals: _cachedDecimals }));
};

/**
 * Fetch the base currency from the backend and cache it.
 * Safe to call multiple times — only the first call fetches.
 */
export const loadBaseCurrency = async () => {
  if (_loaded || _loading) return { symbol: _cachedSymbol, code: _cachedCode, decimals: _cachedDecimals };
  _loading = true;
  try {
    const base = await window.electronAPI?.currencyGetBase?.();
    if (base) {
      _cachedCode = base.code || _cachedCode;
      _cachedSymbol = base.symbol || _cachedCode;
      _cachedDecimals = typeof base.decimals === 'number' ? base.decimals : 2;
    }
  } catch (e) {
    console.warn('Failed to load base currency, using default:', e);
  }
  _loaded = true;
  _loading = false;
  notifyListeners();
  return { symbol: _cachedSymbol, code: _cachedCode, decimals: _cachedDecimals };
};

/**
 * Force-refresh the cached currency (e.g. after user changes base currency in settings).
 */
export const refreshBaseCurrency = async () => {
  _loaded = false;
  _loading = false;
  return loadBaseCurrency();
};

/**
 * Synchronous getter — returns the cached symbol immediately.
 * If not yet loaded, returns the default ('R').
 * Call loadBaseCurrency() early in your app to prime the cache.
 */
export const getCurrencySymbol = () => _cachedSymbol;
export const getCurrencyCode = () => _cachedCode;
export const getCurrencyDecimals = () => _cachedDecimals;

/**
 * Format a number as currency string: "R 1,234.56"
 */
export const formatCurrency = (value, opts = {}) => {
  const sym = opts.symbol || _cachedSymbol;
  const dec = typeof opts.decimals === 'number' ? opts.decimals : _cachedDecimals;
  const num = Number(value || 0);
  const formatted = num.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return `${sym} ${formatted}`;
};

/**
 * Format number only (no symbol): "1,234.56"
 */
export const formatNumber = (value, dec) => {
  const d = typeof dec === 'number' ? dec : _cachedDecimals;
  return Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
};

/**
 * React hook — returns { symbol, code, decimals, loading, fmt, fmtNum, refresh }.
 * Triggers a re-render when the currency loads or changes.
 */
export const useCurrency = () => {
  const [state, setState] = useState({
    symbol: _cachedSymbol,
    code: _cachedCode,
    decimals: _cachedDecimals,
    loading: !_loaded,
  });

  useEffect(() => {
    const handler = ({ symbol, code, decimals }) => {
      setState({ symbol, code, decimals, loading: false });
    };
    _listeners.push(handler);

    // Trigger load if not yet loaded
    if (!_loaded) {
      loadBaseCurrency();
    } else {
      setState({ symbol: _cachedSymbol, code: _cachedCode, decimals: _cachedDecimals, loading: false });
    }

    return () => {
      _listeners = _listeners.filter(fn => fn !== handler);
    };
  }, []);

  const fmt = useCallback((v) => formatCurrency(v, { symbol: state.symbol, decimals: state.decimals }), [state.symbol, state.decimals]);
  const fmtNum = useCallback((v) => formatNumber(v, state.decimals), [state.decimals]);

  return {
    symbol: state.symbol,
    code: state.code,
    decimals: state.decimals,
    loading: state.loading,
    fmt,
    fmtNum,
    refresh: refreshBaseCurrency,
  };
};

export default useCurrency;
