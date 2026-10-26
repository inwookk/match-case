/* Apps Script 웹 앱과 주고받기. 링크의 # 뒤(c=초대, t=개인, h=주최자)는 서버 로그나 Referer에 남지 않는다. */
(function (root) {
  'use strict';

  const API_URL = String((root.MEET_CONFIG || {}).apiUrl || '').trim();
  const STAGE = (root.MEET_CONFIG || {}).stage === 'signup' ? 'signup' : 'party';
  const TIMEOUT_MS = 30000;

  // uncertain: 응답을 못 받아서 서버가 처리했는지 알 수 없는 경우(끊김·시간 초과)
  class ApiError extends Error {
    constructor(message, uncertain) {
      super(message);
      this.uncertain = Boolean(uncertain);
    }
  }

  function readLink() {
    const params = new URLSearchParams(root.location.hash.slice(1));
    return { code: params.get('c') || '', token: params.get('t') || '', hostKey: params.get('h') || '' };
  }

  function linkFor(kind, value) {
    return `${root.location.origin}${root.location.pathname}#${kind}=${encodeURIComponent(value)}`;
  }

  // 본문을 text/plain으로 보내면 브라우저가 사전 확인(preflight) 없이 바로 보낸다. Apps Script는 그것만 받는다.
  async function call(action, payload) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({ action, ...payload }),
        signal: ctrl.signal,
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (!body.ok) throw new ApiError(body.error || '요청을 처리하지 못했어요');
      return body.data;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError('연결이 안 돼요. 잠시 후 다시 시도해 주세요', true);
    } finally {
      clearTimeout(timer);
    }
  }

  root.MeetApi = { live: Boolean(API_URL), stage: STAGE, readLink, linkFor, call, ApiError };
}(window));
