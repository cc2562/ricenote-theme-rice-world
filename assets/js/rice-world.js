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
    /* 让悬浮 INDEX 淡出：抽屉与它抢同一条视线（CSS 只看这个类，不认抽屉名） */
    document.documentElement.classList.add('drawer-open');
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
    document.documentElement.classList.remove('drawer-open');
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

    /* 评论：回复 / 取消回复（表单标记由 rice.comments 插件提供） */
    var replyBtn = event.target.closest('[data-rn-reply]');
    if (replyBtn) {
      var replyBox = commentRootOf(replyBtn);
      if (replyBox) {
        setCommentReply(replyBox, replyBtn.getAttribute('data-comment-id'), replyBtn.getAttribute('data-author'));
      }
      return;
    }
    if (event.target.closest('[data-rn-cancel-reply]')) {
      var cancelBox = commentRootOf(event.target);
      if (cancelBox) { clearCommentReply(cancelBox); }
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

  /* 评论表单：接管提交（插件约定用 JSON 提交，原生提交会丢 postId） */
  document.addEventListener('submit', function (event) {
    var form = event.target && event.target.closest ? event.target.closest('[data-rn-comment-form]') : null;
    if (!form) { return; }
    event.preventDefault();
    submitCommentForm(form);
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

  /* ── 评论表单：JSON 提交、回复状态与结果提示 ──────────────────────────
     插件给出的表单只带 data-post-id（没有 postId 隐藏字段），原生提交会让服务端
     收到 NaN：文章标识非法 → 重定向回首页并附一个通用 error，而首页没有评论区，
     于是「点了提交什么都没发生」。主题按插件约定改成 fetch JSON 提交，并把返回的
     结果显示在表单下方的提示条里；同时补一个隐藏的 postId 字段作为无脚本兜底。 */
  function commentRootOf(node) {
    return node && node.closest ? node.closest('[data-rn-comments]') : null;
  }

  function commentFeedback(root, text, tone) {
    var box = root && root.querySelector('[data-rn-comment-message]');
    if (!box) { return; }
    box.textContent = text;
    box.className = 'rn-comments__message' + (tone ? ' is-' + tone : '');
    box.hidden = false;
  }

  function setCommentReply(root, id, author) {
    var holder = root.querySelector('[data-rn-parent-id]');
    var bar = root.querySelector('[data-rn-replying]');
    var label = root.querySelector('[data-rn-replying-text]');
    if (holder) { holder.value = id || ''; }
    if (label) { label.textContent = author ? '正在回复 ' + author : '正在回复'; }
    if (bar) { bar.hidden = false; }
    var content = root.querySelector('[name="content"]');
    if (content) { content.focus(); }
  }

  function clearCommentReply(root) {
    var holder = root.querySelector('[data-rn-parent-id]');
    var bar = root.querySelector('[data-rn-replying]');
    if (holder) { holder.value = ''; }
    if (bar) { bar.hidden = true; }
  }

  function commentField(form, name) {
    var field = form.querySelector('[name="' + name + '"]');
    return field ? field.value : '';
  }

  /** 直发模式才需要刷新评论区（审核制下新评论不会立刻出现） */
  function refreshComments(message) {
    if (typeof window.fetch !== 'function' || typeof window.DOMParser !== 'function') { return; }
    window.fetch(window.location.pathname + window.location.search, { headers: { accept: 'text/html' } })
      .then(function (response) { return response.ok ? response.text() : null; })
      .then(function (html) {
        if (!html) { return; }
        var fresh = new window.DOMParser().parseFromString(html, 'text/html')
          .querySelector('[data-rn-comments]');
        var current = document.querySelector('[data-rn-comments]');
        if (!fresh || !current) { return; }
        current.replaceWith(fresh);
        ensureCommentPostId();
        initCommentAvatars();
        if (message) { commentFeedback(fresh, message, 'ok'); }
      })
      .catch(function () { /* 刷新失败不影响已经给出的提示 */ });
  }

  function submitCommentForm(form) {
    var root = commentRootOf(form);
    if (!root || typeof window.fetch !== 'function') { return; }
    var button = form.querySelector('.rn-comments__submit');
    if (button) { button.disabled = true; }
    commentFeedback(root, '正在提交…', null);

    window.fetch(form.getAttribute('action') || '/comments/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        postId: form.getAttribute('data-post-id') || '',
        parentId: commentField(form, 'parentId'),
        authorName: commentField(form, 'authorName'),
        authorEmail: commentField(form, 'authorEmail'),
        authorUrl: commentField(form, 'authorUrl'),
        content: commentField(form, 'content'),
        website: commentField(form, 'website')
      })
    }).then(function (response) {
      return response.json().catch(function () { return null; }).then(function (payload) {
        return { ok: response.ok, payload: payload };
      });
    }).then(function (result) {
      var reason = result.payload && result.payload.error ? result.payload.error.message : '';
      if (!result.ok) {
        commentFeedback(root, reason || '提交失败，请稍后再试。', 'error');
        return;
      }
      var status = result.payload && result.payload.data ? result.payload.data.status : '';
      var content = form.querySelector('[name="content"]');
      if (content) { content.value = ''; }
      clearCommentReply(root);
      if (status === 'pending') {
        commentFeedback(root, '评论已提交，审核通过后将会公开显示。', 'ok');
      } else {
        refreshComments('评论已发布，感谢参与讨论。');
      }
    }).catch(function () {
      commentFeedback(root, '网络异常，提交失败，请稍后再试。', 'error');
    }).then(function () {
      if (button) { button.disabled = false; }
    });
  }

  /** 给插件的表单补 postId 隐藏字段：脚本不可用时，原生提交也能落在正确的文章上 */
  function ensureCommentPostId() {
    Array.prototype.forEach.call(document.querySelectorAll('.rn-comments__form[data-post-id]'), function (form) {
      if (form.querySelector('input[name="postId"]')) { return; }
      var hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.name = 'postId';
      hidden.value = form.getAttribute('data-post-id') || '';
      form.insertBefore(hidden, form.firstChild);
    });
  }

  /* ── 评论头像：由昵称与作者网址派生（插件不提供邮箱） ──────────────────
     rice.comments 为隐私刻意不输出评论者邮箱（公开接口 GET /api/comments 也只给
     id / authorName / authorUrl），而 Gravatar / weavatar 这类服务必须用邮箱哈希，
     因此邮箱方案在这套契约下永远拿不到头像。主题改用标记里现成的两项：
       · letter（默认）：昵称首字 + 由昵称决定的低饱和底色，离线、零外部请求；
       · site：优先用评论者站点图标，本站作者（网址与站点同源）用站点 LOGO。
     两种模式都退回首字，取不到图时不会留下坏图。头像纯装饰（aria-hidden），
     作者名仍是文本；脚本不可用时评论完全可读，只是没有头像。 */
  var AVATAR_TONES = 4;

  /** 取昵称首个字形：按码点切分，避免把代理对（emoji）切成半个字符 */
  function firstGlyph(name) {
    var text = String(name || '').replace(/^\s+|\s+$/g, '');
    if (!text) { return '?'; }
    var chars = typeof Array.from === 'function' ? Array.from(text) : text.split('');
    var head = chars[0] || '?';
    return head.toUpperCase ? head.toUpperCase() : head;
  }

  /** 由昵称派生的稳定色号：同一个人每次都落在同一档 */
  function toneOf(name) {
    var text = String(name || '');
    var hash = 0;
    for (var i = 0; i < text.length; i += 1) {
      hash = (hash * 31 + text.charCodeAt(i)) % 100003;
    }
    return hash % AVATAR_TONES;
  }

  /** 取 URL 的来源部分；非法地址返回空串（不抛错） */
  function originOf(url) {
    try {
      return new URL(url, window.location.href).origin;
    } catch (error) {
      return '';
    }
  }

  function avatarNode(name, url) {
    var box = document.createElement('span');
    box.className = 'rn-comment__avatar is-letter';
    box.setAttribute('data-rn-avatar', '');
    box.setAttribute('aria-hidden', 'true');
    box.setAttribute('data-tone', String(toneOf(name)));
    box.textContent = firstGlyph(name);

    var siteOrigin = originOf(attr('data-site-origin', ''));
    var logo = attr('data-site-logo', '');
    var origin = url ? originOf(url) : '';
    var source = '';
    if (origin && siteOrigin && origin === siteOrigin) {
      source = logo;                              // 本站作者：用站点 LOGO，不请求外部
    } else if (origin && attr('data-avatar-style', 'letter') === 'site') {
      source = origin + '/favicon.ico';           // 评论者自己的站点图标
    }
    if (!source) { return box; }

    var image = document.createElement('img');
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.width = 44;
    image.height = 44;
    image.src = source;
    image.onerror = function () {                 // 取不到：退回昵称首字，不留坏图
      image.remove();
      box.textContent = firstGlyph(name);
      box.classList.add('is-letter');
    };
    box.classList.remove('is-letter');
    box.appendChild(image);
    return box;
  }

  function initCommentAvatars() {
    var root = document.querySelector('[data-rn-comments]');
    if (!root || attr('data-avatar', 'on') === 'off') { return; }
    Array.prototype.forEach.call(root.querySelectorAll('.rn-comment[id^="comment-"]'), function (item) {
      /* 幂等：Swup 换页后标记会重建，只有重建的才缺头像；已注入的直接跳过 */
      if (item.querySelector('[data-rn-avatar]')) { return; }
      var author = item.querySelector('.rn-comment__author');
      var reply = item.querySelector('[data-rn-reply]');
      var name = (author && author.textContent) || (reply && reply.getAttribute('data-author')) || '';
      var link = author && author.tagName === 'A' ? author.getAttribute('href') : '';
      item.insertBefore(avatarNode(name, link), item.firstChild);
      item.classList.add('has-avatar');
    });
  }

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
    ensureCommentPostId();
    initCommentAvatars();
    scanImages();
    measureProse();
    buildToc();
    updateProgress();
  }

  /* ── 页面级 <html> 属性同步 ──────────────────────────────────────────
     Swup 只替换容器的内容，从不更新 <html> 上的属性，因此 data-page 之类的页面级
     标记会一直停在「进入站点时那一页」。而页面级 CSS 差异正是挂在它们上面的
     （例如悬浮 INDEX：首页对齐刊头首行、文章页对齐页头），不刷新就会错位。
     只同步模板会在每页输出的属性；data-theme / data-size 是访客在本地的选择，
     由脚本按 localStorage 维护，不在同步范围内（否则换页会把访客的选择改掉）。 */
  var HTML_ATTRS = ['lang', 'data-page', 'data-font', 'data-default-theme', 'data-default-size',
    'data-motion', 'data-lazy', 'data-ph-fit', 'data-fade', 'data-eager',
    'data-ratio-single', 'data-ratio-cover', 'data-avatar', 'data-avatar-style',
    'data-site-origin', 'data-site-logo', 'data-index-pos'];

  /**
   * source 可以是已经解析好的 Document（有 documentElement），
   * 也可以是 swup 的 Page 对象（形如 `{ url, html }`）。
   */
  function syncHtmlAttributes(source) {
    if (!source) { return; }
    var next = source.documentElement || null;
    if (!next && source.html) {
      if (typeof window.DOMParser !== 'function') { return; }
      try { next = new window.DOMParser().parseFromString(source.html, 'text/html').documentElement; }
      catch (error) { return; }
    }
    if (!next) { return; }
    var current = document.documentElement;
    HTML_ATTRS.forEach(function (name) {
      var value = next.getAttribute(name);
      if (value === null) { current.removeAttribute(name); return; }
      if (current.getAttribute(name) !== value) { current.setAttribute(name, value); }
    });
  }

  /* ── Swup 4：站内导航的唯一负责人 ─────────────────────────────────── */
  function bootSwup() {
    if (!window.Swup || !document.querySelector('#swup')) { return null; }
    var swup;
    try {
      /* #index-nav 是抽屉里的导航列表：它必须一起被替换，
         否则「当前页」标记会停留在首屏那一份（抽屉在 #swup 之外）。
         插件在服务端按精确路径判定当前项，这里只负责让它的结果保持最新。 */
      swup = new window.Swup({ containers: ['#swup', '#index-nav'] });
    } catch (error) {
      /* Swup 起不来就退回原生导航，页面功能不受影响 */
      if (window.console && window.console.warn) { window.console.warn('[rice.world] Swup 初始化失败，已回退原生导航', error); }
      return null;
    }
    root.classList.add('rw-swup');
    /* 内容刚被替换时同步页面级属性：早于过渡与首屏呈现，不会闪一下。
       swup 4 用 `(visit, { page })` 调用回调（page 形如 `{ url, html }`），
       `visit.to` 指向同一份目标页面；两条路都认，避免依赖单一内部字段。 */
    swup.hooks.on('content:replace', function (visit, payload) {
      syncHtmlAttributes((payload && payload.page) || (visit && visit.to));
    });
    if (window.SwupHeadPlugin) {
      /* 单独挂载：Head 插件（同步 title/OG）出错时不能连带把页面过渡一起废掉 */
      try { swup.use(new window.SwupHeadPlugin()); }
      catch (error) {
        if (window.console && window.console.warn) { window.console.warn('[rice.world] Head 插件挂载失败，页面过渡继续可用', error); }
      }
    }
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
