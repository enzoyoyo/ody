/* state store */
(function (O) {
  'use strict';
  const listeners = new Set();
  const state = {
    mode: 'journey',
    book: 1,
    theme: 'night',
    filmOpen: false,
    layers: { route: true, places: true, legendary: true, particles: true, waves: true },
    playing: false,
    detailOpen: true,
  };

  function getState() {
    return state;
  }
  function setState(patch) {
    Object.assign(state, patch);
    listeners.forEach((fn) => fn(state));
  }
  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  O.Store = { getState, setState, subscribe };
})(window.ODY);
