/* ==========================================================================
   Rice World — 短代码示例

   ricenote 的短代码分工：内核只提供解析引擎与注册 API，语义由主题定义。
   主题侧约定：正文容器必须带 data-rn-shortcodes，本文件才会被引擎扫描到。

   已定义的标记：
     [note title="说明"]…[/note]            左侧细线的提示块
     [note title="注意" tone="alert"]…[/note]  同上，用文字色强调
     [figure src="/media/12" alt="说明" wide]…[/figure]  带图注的图片
     [gallery]…[/gallery]                   多图并置（内含 <img>）

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
})();
