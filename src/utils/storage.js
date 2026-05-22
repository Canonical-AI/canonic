/**
 * Safe, robust localStorage wrapper that handles environments where:
 * - window is not defined (SSR or Node environments)
 * - localStorage is shadowed by Node 26+ built-in localStorage which throws errors without configuration
 * - window is stubbed in test environments and lacks standard properties
 */

const getLocalStorage = () => {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Gracefully handle security or context access exceptions
  }
  return null;
};

export const storage = {
  /**
   * Safely retrieve an item from localStorage.
   * @param {string} key
   * @param {string|null} fallback
   * @returns {string|null}
   */
  getItem(key, fallback = null) {
    const ls = getLocalStorage();
    if (!ls) return fallback;
    try {
      const val = ls.getItem(key);
      return val !== null ? val : fallback;
    } catch (e) {
      console.warn(`[Storage] Failed to read key "${key}":`, e.message);
      return fallback;
    }
  },

  /**
   * Safely write an item to localStorage.
   * @param {string} key
   * @param {string} value
   * @returns {boolean} True if successfully stored
   */
  setItem(key, value) {
    const ls = getLocalStorage();
    if (!ls) return false;
    try {
      ls.setItem(key, value);
      return true;
    } catch (e) {
      console.warn(`[Storage] Failed to write key "${key}":`, e.message);
      return false;
    }
  },

  /**
   * Safely delete an item from localStorage.
   * @param {string} key
   * @returns {boolean} True if successfully deleted
   */
  removeItem(key) {
    const ls = getLocalStorage();
    if (!ls) return false;
    try {
      ls.removeItem(key);
      return true;
    } catch (e) {
      console.warn(`[Storage] Failed to remove key "${key}":`, e.message);
      return false;
    }
  }
};
