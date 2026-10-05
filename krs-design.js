/* KRS design contract v1. Presentation only; never authorizes a user. */
(() => {
  'use strict';
  const key = 'krs_design_v2';
  const listeners = new Set();
  let enabled = false, embedded = false, parentOrigin = null;
  try { enabled = localStorage.getItem(key) === '1'; } catch (_) {}
  const requestId = Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16)).join('-');
  const allowed = new Set([location.origin, 'https://kurpfalz-realschule.github.io']);
  try { ((window.T && window.T('hub.allowedOrigins', [])) || []).forEach(o => { if (typeof o === 'string') allowed.add(o); }); } catch (_) {}
  function apply(value, persist) {
    enabled = value === true;
    if (persist) { try { localStorage.setItem(key, enabled ? '1' : '0'); } catch (_) {} }
    document.documentElement.classList.toggle('krs-design-v2', enabled);
    document.documentElement.classList.toggle('krs-design-embedded', embedded);
    listeners.forEach(fn => fn(enabled));
  }
  window.KRSDesign = {
    version: 1,
    get enabled() { return enabled; },
    get embedded() { return embedded; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    setEnabled(value) {
      if (typeof value !== 'boolean') return;
      if (embedded) window.parent.postMessage({ type: 'KRS_DESIGN_CHANGE', version: 1, requestId, enabled: value }, parentOrigin);
      else apply(value, true);
    }
  };
  addEventListener('storage', e => { if (e.key === key && !embedded) apply(e.newValue === '1', false); });
  addEventListener('message', event => {
    const d = event.data;
    if (window.parent === window || event.source !== window.parent || !allowed.has(event.origin)) return;
    if (!d || d.type !== 'KRS_DESIGN_STATE' || d.version !== 1 || d.requestId !== requestId || typeof d.enabled !== 'boolean') return;
    embedded = true; parentOrigin = event.origin;
    apply(d.enabled, false);
    window.parent.postMessage({ type: 'KRS_DESIGN_READY', version: 1, requestId }, parentOrigin);
  });
  apply(enabled, false);
  if (window.parent !== window) {
    // No reply leaves the standalone navigation intact. Retry for a loading shell.
    const request = () => allowed.forEach(origin => window.parent.postMessage({ type: 'KRS_DESIGN_REQUEST', version: 1, requestId }, origin));
    request(); [300, 1200, 3000].forEach(ms => setTimeout(() => { if (!embedded) request(); }, ms));
  }
})();
