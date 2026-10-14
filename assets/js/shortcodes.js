/* ==========================================================================
   Rice World — 短代码示例

   ricenote 的短代码分工：内核只提供解析引擎与注册 API，语义由主题定义。
   主题侧约定：正文容器必须带 data-rn-shortcodes，本文件才会被引擎扫描到。

   已定义的标记：
     [note title="说明"]…[/note]            左侧细线的提示块
     [note title="注意" tone="alert"]…[/note]  同上，用文字色强调
     [figure src="/media/12" alt="说明" wide]…[/figure]  带图注的图片
     [gallery]…[/gallery]                   多图并置（内含 <img>）
     [photos]描述,地址###描述,地址[/photos]   瀑布流相册（见文件末尾的说明）

   引擎不支持嵌套，因此这些标记内部不要再放其它短代码。
   ========================================================================== */
(function () {
  'use strict';

  var runtime = window.RiceNoteShortcodes;
  /* 主题没有引入引擎时（未调用 shortcode_runtime()）直接退出，标记原样显示为文字 */
  if (!runtime || typeof runtime.define !== 'function') { return; }

  /** 只接受 http(s) 绝对地址与站点相对路径，阻断 javascript: 之类的伪协议 */
  function safeUrl(value) {
    var url = String(value == null ? '' : value).trim();
    if (/^https?:\/\//i.test(url)) { return url; }
    if (url.charAt(0) === '/' || url.indexOf('./') === 0) { return url; }
    return '';
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (text != null) { node.textContent = text; }
    return node;
  }

  runtime.define({
    name: 'note',
    render: function (context) {
      var attributes = context.attributes || {};
      var tone = attributes.tone === 'alert' ? ' rw-note-alert' : '';
      var box = element('div', 'rw-note' + tone);
      if (attributes.title) {
        box.appendChild(element('span', 'rw-note-title', attributes.title));
      }
      var body = element('div', 'rw-note-body');
      body.innerHTML = context.bodyHtml || '';
      box.appendChild(body);
      return box;
    }
  });

  runtime.define({
    name: 'figure',
    render: function (context) {
      var attributes = context.attributes || {};
      var src = safeUrl(attributes.src);
      if (!src) { return null; }
      var wide = attributes.wide === 'wide' ? ' rw-figure-wide' : '';
      var figure = element('figure', 'rw-figure' + wide);
      var img = element('img');
      img.src = src;
      img.alt = attributes.alt || '';
      img.loading = 'lazy';
      img.decoding = 'async';
      figure.appendChild(img);
      var caption = context.bodyText || attributes.caption || '';
      if (caption) { figure.appendChild(element('figcaption', null, caption)); }
      return figure;
    }
  });

  runtime.define({
    name: 'gallery',
    render: function (context) {
      var wrap = element('div', 'rw-gallery');
      wrap.innerHTML = context.bodyHtml || '';
      Array.prototype.forEach.call(wrap.querySelectorAll('img'), function (img) {
        img.loading = 'lazy';
        img.decoding = 'async';
      });
      return wrap;
    }
  });

  /* ── [photos] 瀑布流相册 ────────────────────────────────────────────────
     [photos] 描述,图片地址###描述,图片地址###… [/photos]

     · `###` 分隔每张照片；每张里逗号前是描述、逗号后是地址（描述可以省略，只写地址也行）；
     · 从「块」入手解析：引擎交给主题的是服务端 Markdown 渲染后的 HTML，行首的 `###` 会被
       Markdown 当成三级标题（变成 <h3>），所以「每个块内部再按 ### 切分」才能同时兼容
       「一行写完」与「每张一行」两种写法；
     · 一个地址都认不出来时返回 null —— 标记原样保留，作者立刻能看出写法没生效，
       而不是得到一个静默的空相册。 */

  /** 相册里认得出的地址：http(s) 绝对地址、/media 与 /uploads 受管路径、./ 相对路径 */
  function photoUrl(value) {
    var url = String(value == null ? '' : value).trim();
    if (/^https?:\/\/\S+$/i.test(url)) { return url; }
    if (/^\/(?:media|uploads|assets|theme-assets)\/\S+$/i.test(url)) { return url; }
    if (/^\.\/\S+$/.test(url)) { return url; }
    return '';
  }

  /** 「描述,地址」→ { caption, src }；取不出地址就返回 null */
  function photoItem(chunk) {
    var text = String(chunk == null ? '' : chunk).replace(/\s+/g, ' ').trim();
    if (!text) { return null; }

    /* 先按逗号切：描述自身带逗号时（「海边的黄昏, 拍糊了」），
       第一个「像地址的片段」才是地址，因此从右往左不影响结果 */
    var pieces = text.split(/[,，]/);
    var src = '';
    var index = -1;
    for (var i = 0; i < pieces.length; i += 1) {
      src = photoUrl(pieces[i]);
      if (src) { index = i; break; }
    }
    var caption = '';
    if (index !== -1) {
      caption = pieces.slice(0, index).join(',').trim();
    } else {
      /* 兼容「描述 地址」这种用空格分隔的写法 */
      var words = text.split(' ');
      for (var j = 0; j < words.length; j += 1) {
        src = photoUrl(words[j]);
        if (src) { index = j; break; }
      }
      if (index === -1) { return null; }
      caption = words.slice(0, index).join(' ').trim();
    }
    src = safeUrl(src);
    if (!src) { return null; }
    return { caption: caption, src: src };
  }

  runtime.define({
    name: 'photos',
    render: function (context) {
      var template = document.createElement('template');
      template.innerHTML = context.bodyHtml || '';
      /* 没有块级元素（纯文字）时整体当一块处理 */
      var blocks = Array.prototype.slice.call(template.content.children);
      if (!blocks.length) { blocks = [template.content]; }

      var items = [];
      blocks.forEach(function (block) {
        String(block.textContent || '').split('###').forEach(function (chunk) {
          var item = photoItem(chunk);
          if (item) { items.push(item); }
        });
      });
      if (!items.length) { return null; }

      var wrap = element('div', 'rw-photos');
      items.forEach(function (item) {
        var figure = element('figure', 'rw-photo');
        var img = element('img');
        /* 先挂 onerror 再设 src：地址命中的是缓存里的 404 时，错误可能在同一任务内就派发，
           晚挂一步就会漏掉这次失败，表现为失效图片照样显示坏图图标 */
        img.onerror = function () { figure.classList.add('is-failed'); };
        img.src = item.src;
        img.alt = item.caption || '';
        img.loading = 'lazy';
        img.decoding = 'async';
        /* 与主题灯箱同一套契约：点击与回车都由 rice-world.js 的事件委托接管，
           所以这些动态插入的图片同样能打开查看器 */
        img.setAttribute('data-zoomable', '');
        img.setAttribute('data-zoom-src', item.src);
        img.setAttribute('data-caption', item.caption || '');
        img.setAttribute('tabindex', '0');
        img.setAttribute('role', 'button');
        img.setAttribute('aria-label', (item.caption || '照片') + '，点击放大');
        /* 标记已就绪：rice-world.js 的 initProseImages 只增强没有这个属性的图片，避免重复处理 */
        img.setAttribute('data-rw-ready', '');
        img.className = 'content-img';
        figure.appendChild(img);
        if (item.caption) { figure.appendChild(element('figcaption', null, item.caption)); }
        wrap.appendChild(figure);
      });
      return wrap;
    }
  });
})();
