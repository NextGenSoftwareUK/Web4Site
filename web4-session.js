(function (root) {
  'use strict';
  const guid = value => typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
  function tokenDetails(avatar, now) {
    if (!guid(avatar?.id) || typeof avatar.jwtToken !== 'string') throw Error('Incomplete authenticated avatar.');
    const parts = avatar.jwtToken.split('.');
    if (parts.length !== 3) throw Error('Invalid access token.');
    const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(encoded), value => value.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes));
    if (claims.sub !== avatar.id || !Number.isSafeInteger(claims.exp) || claims.exp * 1000 <= now)
      throw Error('Access token identity or expiry differs.');
    return { token: avatar.jwtToken, expiresAt: claims.exp * 1000, avatarId: avatar.id };
  }

  function create({ getBase, fetch: send = root.fetch.bind(root), now = () => Date.now(), onToken = () => {},
    renewalWindowMs = 60000, timeoutMs = 15000 }) {
    let current = null, generation = 0, pending = null, renewalFailure = null;
    const same = snapshot => current && snapshot.generation === current.generation &&
      snapshot.base === getBase() && snapshot.avatarId === current.avatarId;
    function clear() { generation++; current = null; renewalFailure = null; onToken(null); }
    function install(avatar, base, expectedGeneration) {
      if (base !== getBase() || expectedGeneration !== generation) throw Error('Session changed during authentication.');
      const details = tokenDetails(avatar, now());
      current = { ...details, base, generation: ++generation };
      renewalFailure = null; onToken(current.token);
      return avatar;
    }
    function serialize(action) {
      if (pending) return pending.then(() => serialize(action));
      const operation = Promise.resolve().then(action);
      const observed = operation.finally(() => { if (pending === observed) pending = null; });
      pending = observed;
      return observed;
    }
    async function authRequest(base, route, body, token) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await send(`${base}/api/${route}`, {
          method: 'POST', credentials: 'include', redirect: 'error', cache: 'no-store', signal: controller.signal,
          headers: { Accept: 'application/json', 'Content-Type': 'application/json',
            ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body)
        });
        const payload = await response.json();
        const result = route === 'sandbox/session' ? payload : payload?.result;
        if (!response.ok || !result || result.isError !== false) throw Error('Authentication request was not acknowledged.');
        return result.result;
      } finally { clearTimeout(timeout); }
    }
    async function renew(snapshot) {
      if (!same(snapshot)) throw Error('Session changed before renewal.');
      if (renewalFailure) throw renewalFailure;
      try {
        const avatar = await authRequest(snapshot.base, 'avatar/refresh-token', {});
        const details = tokenDetails(avatar, now());
        if (!same(snapshot) || details.avatarId !== snapshot.avatarId) throw Error('Session identity changed during renewal.');
        current = { ...current, ...details };
        onToken(current.token);
        return current.token;
      } catch (error) {
        const failure = Error('Session renewal could not be verified. Sign in again; the original request was not sent.', { cause: error });
        if (same(snapshot)) renewalFailure = failure;
        throw failure;
      }
    }
    async function ensureAccessToken() {
      const snapshot = current;
      if (!snapshot || snapshot.base !== getBase()) throw Error('Sign in to the selected environment first.');
      if (pending) {
        await pending;
        if (!same(snapshot)) throw Error('Session changed; the original request was not sent.');
      }
      if (renewalFailure) throw renewalFailure;
      if (current.expiresAt - now() > renewalWindowMs) return current.token;
      return serialize(() => renew(current));
    }
    function assertContext(context, requestKey = null, operationId = null) {
      const identity = current ? `${current.base}:${current.avatarId}:${current.generation}` : null;
      if (!context.identity || context.identity !== identity || context.base !== getBase())
        throw Error('Session changed; the previous response was not shown.' +
          (requestKey ? ` Retain request key: ${requestKey}.` : '') +
          (operationId ? ` Operation: ${operationId}.` : ''));
    }
    async function accessContext() {
      const identity = current ? `${current.base}:${current.avatarId}:${current.generation}` : null;
      const base = getBase();
      const token = await ensureAccessToken();
      const context = { identity, base, token };
      assertContext(context);
      return context;
    }
    function authenticate(route, body) {
      const base = getBase();
      return serialize(async () => {
        const before = generation;
        const avatar = await authRequest(base, route, body);
        return install(avatar, base, before);
      });
    }
    async function signOut() {
      const signingOutGeneration = current?.generation;
      try { return await serialize(async () => {
        const snapshot = current;
        if (!snapshot) return;
        if (snapshot.base !== getBase()) { clear(); return; }
        try {
          if (current.expiresAt - now() <= renewalWindowMs) await renew(snapshot);
          await authRequest(snapshot.base, 'avatar/revoke-token', {}, current.token);
        } finally { if (same(snapshot)) clear(); }
      }); } finally {
        if (current && current.generation === signingOutGeneration) clear();
      }
    }
    return {
      token: () => current?.token ?? null,
      identity: () => current ? `${current.base}:${current.avatarId}:${current.generation}` : null,
      signIn: credentials => authenticate('avatar/authenticate', credentials),
      startDemo: () => authenticate('sandbox/session', {}),
      ensureAccessToken, accessContext, assertContext, signOut, clear
    };
  }
  const api = { create, tokenDetails };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Web4Session = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
