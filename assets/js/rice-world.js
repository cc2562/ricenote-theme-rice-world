/* ==========================================================================
   Rice World — 前端交互（原生 JS，零依赖）

   继承原型的脚本约束：
   1. 单一事件委托 + 幂等 boot()：禁止逐元素绑定，Swup 多次换页后不得重复监听；
   2. 滚动与目录定位只用 window.scrollTo()，禁止 scrollIntoView()；
   3. 关闭 JavaScript 时全部内容仍可读，导航仍是普通 <a>；
   4. 不使用 IntersectionObserver：懒加载交给浏览器原生 loading="lazy"，
      本文件只负责「加载完成淡入」与「加载失败回落底色」，
      因此页面切换时没有任何观察器需要销毁。
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  var STORE = { theme: 'riceworld.theme', size: 'riceworld.fontSize' };
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

  /* ── 配置与偏好 ─────────────────────────────────────────────────────── */
  function attr(name, fallback) {
    var value = root.getAttribute(name);
    return value === null || value === '' ? fallback : value;
  }
  function read(key, fallback) {
    try {
      var value = window.localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* 隐私模式下静默降级 */ }
  }
  /** 动效总开关与系统偏好任一关闭即视为「减弱动效」 */
  function motionOff() {
    return reduceMotion.matches || attr('data-motion', 'on') === 'off';
  }
  function defaultThemeMode() { return attr('data-default-theme', 'system'); }
  function defaultFontSize() { return attr('data-default-size', 'm'); }

  var darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

  function applyTheme(mode) {
    var resolved = mode === 'system' ? (darkQuery.matches ? 'dark' : 'light') : mode;
    root.setAttribute('data-theme', resolved);
    document.querySelectorAll('[data-theme-set]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-theme-set') === mode));
    });
  }
  function applySize(size) {
    if (size === 's' || size === 'l') { root.setAttribute('data-size', size); }
    else { root.removeAttribute('data-size'); }
    document.querySelectorAll('[data-size-set]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-size-set') === size));
    });
  }

  darkQuery.addEventListener('change', function () {
    if (read(STORE.theme, defaultThemeMode()) === 'system') { applyTheme('system'); }
  });

  /* ── 抽屉（INDEX / 目录 / 阅读设置） ────────────────────────────────── */
  var lastTrigger = null;
  var lockY = 0;

  function lockScroll() {
    lockY = window.pageYOffset;
    document.body.style.top = '-' + lockY + 'px';
    document.body.classList.add('is-locked');
  }
  function unlockScroll() {
    if (!document.body.classList.contains('is-locked')) { return; }
    document.body.classList.remove('is-locked');
    document.body.style.top = '';
    window.scrollTo(0, lockY);
  }
  function drawerEl(name) { return document.querySelector('[data-drawer="' + name + '"]'); }

  function openDrawer(name, trigger) {
    var el = drawerEl(name);
    if (!el) { return; }
    closeDrawers(true);
    lastTrigger = trigger || null;
    el.classList.add('is-open');
    el.removeAttribute('inert');
    var scrim = document.querySelector('[data-scrim]');
    if (scrim) { scrim.classList.add('is-open'); }
    lockScroll();
    var triggerBtn = document.querySelector('[data-drawer-open="' + name + '"]');
    if (triggerBtn) { triggerBtn.setAttribute('aria-expanded', 'true'); }
    var first = el.querySelector(FOCUSABLE);
    if (first) { first.focus(); }
  }

  function closeDrawers(silent) {
    var any = false;
    document.querySelectorAll('.drawer.is-open').forEach(function (el) {
      el.classList.remove('is-open');
      el.setAttribute('inert', '');
      any = true;
    });
    var scrim = document.querySelector('[data-scrim]');
    if (scrim) { scrim.classList.remove('is-open'); }
    document.querySelectorAll('[data-drawer-open]').forEach(function (btn) {
      btn.setAttribute('aria-expanded', 'false');
    });
    if (any) { unlockScroll(); }
    if (any && !silent && lastTrigger && document.contains(lastTrigger)) { lastTrigger.focus(); }
    if (!silent) { lastTrigger = null; }
  }

  /* ── 遮罩（抽屉与灯箱共用） ─────────────────────────────────────────── */
  function ensureScrim() {
    if (document.querySelector('[data-scrim]')) { return; }
    var scrim = document.createElement('div');
    scrim.className = 'scrim';
    scrim.setAttribute('data-scrim', '');
    scrim.setAttribute('aria-hidden', 'true');
    document.body.appendChild(scrim);
  }

  /* ── 灯箱 ───────────────────────────────────────────────────────────── */
  function lightboxEl() { return document.querySelector('[data-lightbox]'); }

  function openLightbox(node) {
    var box = lightboxEl();
    if (!box) { return; }
    var target = box.querySelector('[data-lightbox-img]');
    var caption = box.querySelector('[data-lightbox-caption]');
    var src = node.getAttribute('data-zoom-src') || node.currentSrc || node.src || '';
    if (!src) { return; }
    if (target) {
      target.src = src;
      target.alt = node.getAttribute('data-caption') || node.getAttribute('alt') || '';
    }
    if (caption) { caption.textContent = node.getAttribute('data-caption') || ''; }
    box.classList.add('is-open');
    lockScroll();
    lastTrigger = node;
    var close = box.querySelector('[data-lightbox-close]');
    if (close) { close.focus(); }
  }
  function closeLightbox() {
    var box = lightboxEl();
    if (!box || !box.classList.contains('is-open')) { return; }
    box.classList.remove('is-open');
    unlockScroll();
    if (lastTrigger && document.contains(lastTrigger)) { lastTrigger.focus(); }
  }

  /* ── 正文进度与文章目录（每次 boot 都重新定位，兼容 Swup 换页） ───── */
  var state = { prose: null, bar: null, headings: [], proseTop: 0, proseHeight: 0, tocBuiltFor: null };

  function measureProse() {
    if (!state.prose) { return; }
    var rect = state.prose.getBoundingClientRect();
    state.proseTop = rect.top + window.pageYOffset;
    state.proseHeight = rect.height;
  }

  function updateProgress() {
    if (!state.bar || !state.prose) { return; }
    var head = document.querySelector('.reader-head');
    var offset = head ? head.getBoundingClientRect().height : 0;
    var total = state.proseHeight - (window.innerHeight - offset);
    var value;
    if (total <= 0) { value = state.proseTop <= window.pageYOffset + offset ? 1 : 0; }
    else { value = (window.pageYOffset + offset - state.proseTop) / total; }
    value = Math.min(1, Math.max(0, value));
    state.bar.style.width = (value * 100).toFixed(2) + '%';
    state.bar.setAttribute('aria-valuenow', String(Math.round(value * 100)));
    updateTocCurrent(offset);
  }

  function buildToc() {
    var list = document.querySelector('[data-toc-list]');
    var trigger = document.querySelector('[data-drawer-open="toc"]');
    if (!list || !state.prose) { return; }
    if (!state.headings.length) {
      list.innerHTML = '';
      var empty = document.createElement('p');
      empty.className = 'tool-note';
      empty.textContent = '这篇文章很短，没有分节标题。';
      list.appendChild(empty);
      if (trigger) { trigger.setAttribute('disabled', 'disabled'); trigger.setAttribute('title', '本文没有分节标题'); }
      return;
    }
    if (trigger) { trigger.removeAttribute('disabled'); trigger.removeAttribute('title'); }
    if (state.tocBuiltFor === state.prose) { return; }
    state.tocBuiltFor = state.prose;
    list.innerHTML = '';
    state.headings.forEach(function (head, index) {
      if (!head.id) { head.id = 'section-' + (index + 1); }
      var link = document.createElement('a');
      link.href = '#' + head.id;
      link.textContent = head.textContent;
      if (head.tagName === 'H3') { link.className = 'lv3'; }
      link.setAttribute('data-toc-link', head.id);
      list.appendChild(link);
    });
  }

  function updateTocCurrent(headerHeight) {
    if (!state.headings.length) { return; }
    var links = document.querySelectorAll('[data-toc-link]');
    if (!links.length) { return; }
    var limit = window.pageYOffset + headerHeight + 24;
    var currentId = null;
    for (var i = 0; i < state.headings.length; i++) {
      if (state.headings[i].getBoundingClientRect().top + window.pageYOffset <= limit) {
        currentId = state.headings[i].id;
      }
    }
    Array.prototype.forEach.call(links, function (link) {
      var on = link.getAttribute('data-toc-link') === currentId;
      link.classList.toggle('is-current', on);
      if (on) { link.setAttribute('aria-current', 'true'); } else { link.removeAttribute('aria-current'); }
    });
  }

  /* ── 图片：加载完成淡入 / 加载失败回落底色 ─────────────────────────── */
  function markFailed(img) {
    var slot = img.closest ? img.closest('.slot') : null;
    if (slot) { slot.classList.add('is-failed'); }
  }

  function scanImages() {
    document.querySelectorAll('img.slot-img').forEach(function (img) {
      if (!img.complete) { return; }
      if (img.naturalWidth > 0) { img.classList.add('is-loaded'); }
      else { markFailed(img); }
    });
  }

  document.addEventListener('load', function (event) {
    var img = event.target;
    if (img && img.tagName === 'IMG' && img.classList.contains('slot-img')) {
      img.classList.add('is-loaded');
    }
  }, true);

  document.addEventListener('error', function (event) {
    var img = event.target;
    if (!img || img.tagName !== 'IMG') { return; }
    if (img.classList.contains('slot-img')) { markFailed(img); }
    if (img.classList.contains('link-avatar')) { img.classList.add('is-failed'); }
  }, true);

  /* ── 正文增强：图片可放大、代码块可复制 ─────────────────────────────
     作者正文是服务端渲染的受信 HTML，主题无法要求它带 data 属性，
     因此这里做一次幂等的结构增强（只加属性和薄壳，不改内容）。 */
  function initProseImages() {
    document.querySelectorAll('.prose img:not([data-rw-ready])').forEach(function (img) {
      img.setAttribute('data-rw-ready', '');
      img.classList.add('content-img');
      img.setAttribute('data-zoomable', '');
      img.setAttribute('data-zoom-src', img.getAttribute('src') || '');
      img.setAttribute('tabindex', '0');
      img.setAttribute('role', 'button');
      var figure = img.closest('figure');
      var captionEl = figure ? figure.querySelector('figcaption') : null;
      var caption = captionEl ? captionEl.textContent.trim() : '';
      if (!caption) { caption = img.getAttribute('alt') || ''; }
      img.setAttribute('data-caption', caption);
      img.setAttribute('aria-label', (caption || '图片') + '，点击放大');
      img.setAttribute('loading', 'lazy');
      img.setAttribute('decoding', 'async');
    });
  }

  function initCodeBlocks() {
    document.querySelectorAll('.prose pre:not([data-rw-ready])').forEach(function (pre) {
      pre.setAttribute('data-rw-ready', '');
      var code = pre.querySelector('code');
      var lang = '';
      if (code && code.className) {
        var matched = /language-([\w-]+)/.exec(code.className);
        if (matched) { lang = matched[1]; }
      }
      var wrap = document.createElement('div');
      wrap.className = 'code-block';
      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(pre);
      var head = document.createElement('div');
      head.className = 'code-head';
      var label = document.createElement('span');
      label.textContent = lang || 'code';
      var button = document.createElement('button');
      button.className = 'copy-code';
      button.type = 'button';
      button.setAttribute('data-copy-code', '');
      button.textContent = '复制';
      head.appendChild(label);
      head.appendChild(button);
      wrap.insertBefore(head, pre);
    });
  }

  /* ── 复制（链接 / 代码） ───────────────────────────────────────────── */
  function flash(button, doneText) {
    var original = button.getAttribute('data-label') || button.textContent.trim();
    button.setAttribute('data-label', original);
    button.setAttribute('data-state', 'done');
    button.textContent = doneText;
    window.setTimeout(function () {
      button.removeAttribute('data-state');
      button.textContent = original;
    }, 1800);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; });
    }
    return Promise.resolve(false);
  }

  /* ── 统一事件委托（只绑定一次） ────────────────────────────────────── */
  document.addEventListener('click', function (event) {
    var opener = event.target.closest('[data-drawer-open]');
    if (opener) {
      event.preventDefault();
      var name = opener.getAttribute('data-drawer-open');
      var el = drawerEl(name);
      if (el && el.classList.contains('is-open')) { closeDrawers(); } else { openDrawer(name, opener); }
      return;
    }
    if (event.target.closest('[data-drawer-close]') || event.target.closest('[data-scrim]')) {
      event.preventDefault();
      closeDrawers();
      return;
    }

    var themeBtn = event.target.closest('[data-theme-set]');
    if (themeBtn) {
      var mode = themeBtn.getAttribute('data-theme-set');
      write(STORE.theme, mode);
      applyTheme(mode);
      return;
    }

    var sizeBtn = event.target.closest('[data-size-set]');
    if (sizeBtn) {
      var size = sizeBtn.getAttribute('data-size-set');
      write(STORE.size, size);
      applySize(size);
      return;
    }

    var copyLink = event.target.closest('[data-copy-link]');
    if (copyLink) {
      event.preventDefault();
      var url = window.location.href;
      copyText(url).then(function (ok) {
        if (ok) { flash(copyLink, '已复制'); }
        else { window.prompt('复制文章链接：', url); }
      });
      return;
    }

    var copyCode = event.target.closest('[data-copy-code]');
    if (copyCode) {
      var block = copyCode.closest('.code-block');
      var code = block ? block.querySelector('code') : null;
      if (!code) { return; }
      var text = code.textContent;
      copyText(text).then(function (ok) {
        if (ok) { flash(copyCode, '已复制'); }
        else { window.prompt('复制代码：', text); }
      });
      return;
    }

    var zoomable = event.target.closest('[data-zoomable]');
    if (zoomable && !event.target.closest('a')) { openLightbox(zoomable); return; }

    var box = lightboxEl();
    if (box && (event.target.closest('[data-lightbox-close]') || event.target === box)) {
      closeLightbox();
      return;
    }

    var toTop = event.target.closest('[data-to-top]');
    if (toTop) {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: motionOff() ? 'auto' : 'smooth' });
      return;
    }

    /* 目录跳转：考虑 sticky Header 的偏移，并同步地址栏 */
    var tocLink = event.target.closest('[data-toc-link]');
    if (tocLink) {
      var id = tocLink.getAttribute('data-toc-link');
      var heading = document.getElementById(id);
      if (!heading) { return; }
      event.preventDefault();
      /* 必须先关闭抽屉：unlockScroll() 会恢复锁定前的滚动位置，
         放在滚动之后会把这次跳转直接覆盖掉。 */
      closeDrawers(true);
      var head = document.querySelector('.reader-head');
      var offset = (head ? head.getBoundingClientRect().height : 0) + 16;
      var top = heading.getBoundingClientRect().top + window.pageYOffset - offset;
      window.scrollTo({ top: top, behavior: motionOff() ? 'auto' : 'smooth' });
      history.replaceState(null, '', '#' + id);
      updateProgress();
      return;
    }

    /* 抽屉内的站内导航：先关闭抽屉再交给 Swup / 浏览器 */
    var navLink = event.target.closest('.drawer a[href]');
    if (navLink && navLink.getAttribute('href').charAt(0) !== '#') {
      closeDrawers(true);
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      var box = lightboxEl();
      if (box && box.classList.contains('is-open')) { closeLightbox(); return; }
      if (document.querySelector('.drawer.is-open')) { closeDrawers(); }
      return;
    }
    if (event.key !== 'Tab') { return; }
    var open = document.querySelector('.drawer.is-open');
    if (!open) { return; }
    var items = Array.prototype.filter.call(open.querySelectorAll(FOCUSABLE), function (el) {
      return el.offsetParent !== null;
    });
    if (!items.length) { return; }
    var first = items[0];
    var last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' && event.key !== ' ') { return; }
    var node = event.target.closest ? event.target.closest('[data-zoomable]') : null;
    if (!node) { return; }
    event.preventDefault();
    openLightbox(node);
  });

  /* ── 滚动 ──────────────────────────────────────────────────────────── */
  var ticking = false;
  function onScroll() {
    if (ticking) { return; }
    ticking = true;
    window.requestAnimationFrame(function () {
      updateProgress();
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () { measureProse(); onScroll(); }, { passive: true });
  window.addEventListener('hashchange', onScroll);

  /* ── 启动（可重复调用：首次加载与 Swup 每次替换后都走这里） ─────────── */
  function boot() {
    ensureScrim();
    applyTheme(read(STORE.theme, defaultThemeMode()));
    applySize(read(STORE.size, defaultFontSize()));

    state.prose = document.querySelector('[data-prose]');
    state.bar = document.querySelector('[data-progress]');
    state.headings = state.prose
      ? Array.prototype.slice.call(state.prose.querySelectorAll('h2, h3'))
      : [];
    state.tocBuiltFor = null;

    initProseImages();
    initCodeBlocks();
    scanImages();
    measureProse();
    buildToc();
    updateProgress();
  }

  /* ── Swup 4：站内导航的唯一负责人 ─────────────────────────────────── */
  function bootSwup() {
    if (!window.Swup || !document.querySelector('#swup')) { return null; }
    var options = { containers: ['#swup'] };
    if (window.SwupHeadPlugin) { options.plugins = [new window.SwupHeadPlugin()]; }
    var swup = new window.Swup(options);
    root.classList.add('rw-swup');
    /* 页面进入后重新初始化页面模块；boot() 幂等，且监听器只有一套 */
    swup.hooks.on('page:view', function () {
      closeDrawers(true);
      boot();
    });
    return swup;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { boot(); bootSwup(); });
  } else {
    boot();
    bootSwup();
  }

  /* 字体加载完成后正文高度会变，重新测量一次 */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { measureProse(); updateProgress(); });
  }

  /* 供外部（Swup 钩子 / 调试）复用 */
  window.RiceWorld = { init: boot, closeDrawers: closeDrawers };
})();
