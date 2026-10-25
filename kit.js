/* 화면 부품 — DOM 도우미와 transitions.dev 전환(탭·알림·오류 흔들기·숫자) 조작. 앱 상태는 모른다. */
(function (root) {
  'use strict';

  const TOAST_MS = 2600;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ESC[c]);
  const cssMs = (name, fallback) => {
    const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
    return Number.isFinite(v) ? v : fallback;
  };
  let toastTimer = null;

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('is-open');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-open'), TOAST_MS);
  }

  function activeTab(bar) {
    return $('.t-tab[aria-selected="true"], .t-tab[aria-checked="true"]', bar);
  }

  function movePill(bar, animate) {
    const pill = $('.t-tabs-pill', bar);
    if (!pill) return;
    const tab = activeTab(bar);
    if (!tab) {
      pill.style.width = '0px';
      delete pill.dataset.placed;
      return;
    }
    if (tab.offsetWidth === 0) return;
    const place = () => {
      pill.style.transform = `translateX(${tab.offsetLeft}px)`;
      pill.style.width = `${tab.offsetWidth}px`;
    };
    if (!animate || !pill.dataset.placed) {
      const prev = pill.style.transition;
      pill.style.transition = 'none';
      place();
      void pill.offsetWidth;
      pill.style.transition = prev;
    } else {
      place();
    }
    pill.dataset.placed = '1';
  }

  function selectTab(bar, tab) {
    const attr = tab.getAttribute('role') === 'radio' ? 'aria-checked' : 'aria-selected';
    $$('.t-tab', bar).forEach((t) => t.setAttribute(attr, t === tab ? 'true' : 'false'));
    movePill(bar, true);
  }

  function syncPills(root = document) {
    $$('.t-tabs', root).forEach((bar) => movePill(bar, false));
  }

  function showError(wrap, msg, autoRevert) {
    if (!wrap) return;
    const input = $('.t-input', wrap);
    const msgEl = $('.t-error-msg', wrap);
    if (msgEl && msg) msgEl.textContent = msg;
    wrap.classList.add('is-error');
    input.classList.add('is-error');
    input.classList.remove('is-shaking');
    void input.offsetWidth;
    input.classList.add('is-shaking');
    const shakeMs = cssMs('--shake-dur-a', 80) * 2 + cssMs('--shake-dur-b', 60) * 2;
    setTimeout(() => input.classList.remove('is-shaking'), shakeMs + 20);
    clearTimeout(wrap._revertTimer);
    wrap._revertTimer = autoRevert ? setTimeout(() => clearError(wrap), shakeMs + cssMs('--revert-hold', 3000)) : null;
  }

  function clearError(wrap) {
    if (!wrap || !wrap.classList.contains('is-error')) return;
    clearTimeout(wrap._revertTimer);
    wrap.classList.remove('is-error');
    $('.t-input', wrap).classList.remove('is-error');
    const msgEl = $('.t-error-msg', wrap);
    setTimeout(() => {
      if (msgEl && !wrap.classList.contains('is-error')) msgEl.textContent = '';
    }, cssMs('--revert-dur', 280));
  }

  function digits(value, animate) {
    const chars = String(value).split('');
    const spans = chars.map((ch, i) => {
      const stagger = i === chars.length - 2 ? ' data-stagger="1"' : i === chars.length - 1 ? ' data-stagger="2"' : '';
      return `<span class="t-digit"${stagger}>${esc(ch)}</span>`;
    }).join('');
    return `<span class="t-digit-group${animate ? ' is-animating' : ''}">${spans}</span>`;
  }

  function selectText(el) {
    if (!el) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function copyText(btn) {
    const text = btn.dataset.copy;
    if (!navigator.clipboard) {
      selectText(btn.previousElementSibling);
      toast('글자를 선택해 두었어요. 길게 눌러 복사해 주세요');
      return;
    }
    navigator.clipboard.writeText(text)
      .then(() => toast('복사했어요'))
      .catch(() => {
        selectText(btn.previousElementSibling);
        toast('복사가 막혀 있어요. 글자를 선택해 두었으니 직접 복사해 주세요');
      });
  }

  root.MeetKit = { $, $$, esc, toast, movePill, selectTab, syncPills, showError, clearError, digits, copyText };
}(window));
