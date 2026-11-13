/*
 * In-page editor for this static site.
 * Loaded only when the URL has ?edit or a token is saved in this browser (see site.js).
 * Saving writes the edited page back to GitHub through the REST API, so only someone
 * holding a GitHub token with write access to this repository can change the site.
 */
(function () {
  'use strict';

  var OWNER = 'DeokWooKim-ulpl';
  var REPO = 'deokwookim-ulpl.github.io';
  var BRANCH = 'main';
  var API = 'https://api.github.com/repos/' + OWNER + '/' + REPO;
  var TOKEN_KEY = 'ed_token';
  var START = '<!-- EDITABLE:START -->';
  var END = '<!-- EDITABLE:END -->';

  var EDIT_SEL = 'h1, h2, h3, p, li, .cv-item > div, .card h3, .card p, figcaption, .crumbs, .links a, .news li > span';
  var ITEM_SEL = 'li, .card, .cv-item, figure';     // repeatable items win over...
  var ITEM_SEL2 = 'p, .links a';                     // ...plain paragraphs and links

  var root = document.getElementById('content');
  if (!root) return;

  var editing = false, dirty = false, curItem = null, curSection = null;
  var bar, statusEl;

  // ------------------------------------------------------------ token
  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }
  function setToken(t, remember) {
    try {
      (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, t);
      (remember ? sessionStorage : localStorage).removeItem(TOKEN_KEY);
    } catch (e) {}
  }
  function clearToken() {
    try { localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY); } catch (e) {}
  }

  function gh(method, path, body) {
    return fetch(API + path, {
      method: method,
      headers: {
        'Authorization': 'Bearer ' + getToken(),
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.message || ('HTTP ' + r.status)); e.status = r.status; throw e; }
        return j;
      });
    });
  }

  // UTF-8 safe base64
  function b64encodeBytes(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function b64encodeText(t) { return b64encodeBytes(new TextEncoder().encode(t)); }
  function b64decodeText(b) {
    var bin = atob(b.replace(/\n/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function filePath() {
    var p = decodeURIComponent(location.pathname).replace(/^\/+/, '');
    if (p === '' || p.endsWith('/')) p += 'index.html';
    return p;
  }

  // ------------------------------------------------------------ UI helpers
  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    for (var k in (attrs || {})) e.setAttribute(k, attrs[k]);
    if (html != null) e.innerHTML = html;
    return e;
  }
  function status(msg, kind) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.className = 'ed-status' + (kind ? ' ed-' + kind : '');
  }

  // floating pencil button
  var fab = el('button', { 'class': 'ed-fab', title: '편집 모드' }, '&#9998; 편집');
  fab.addEventListener('click', function () { getToken() ? startEditing() : showLogin(); });
  document.body.appendChild(fab);

  function showLogin() {
    var wrap = el('div', { 'class': 'ed-modal' });
    wrap.innerHTML =
      '<div class="ed-dialog">' +
      '<h3>편집 로그인</h3>' +
      '<p>GitHub 토큰을 붙여넣으세요. 이 저장소에 쓰기 권한이 있는 토큰만 저장할 수 있습니다.</p>' +
      '<input type="password" class="ed-token" placeholder="github_pat_..." autocomplete="off">' +
      '<label><input type="checkbox" class="ed-remember" checked> 이 브라우저에 기억하기</label>' +
      '<p class="ed-err"></p>' +
      '<div class="ed-row"><button class="ed-ok">확인</button><button class="ed-cancel">취소</button></div>' +
      '</div>';
    document.body.appendChild(wrap);
    var input = wrap.querySelector('.ed-token');
    input.focus();
    wrap.querySelector('.ed-cancel').onclick = function () { wrap.remove(); };
    wrap.querySelector('.ed-ok').onclick = function () {
      var t = input.value.trim();
      if (!t) return;
      setToken(t, wrap.querySelector('.ed-remember').checked);
      gh('GET', '').then(function (repo) {
        if (repo.permissions && repo.permissions.push === false) throw new Error('이 토큰에는 쓰기 권한이 없습니다.');
        wrap.remove();
        startEditing();
      }).catch(function (e) {
        clearToken();
        wrap.querySelector('.ed-err').textContent = '로그인 실패: ' + e.message;
      });
    };
  }

  // ------------------------------------------------------------ edit mode
  function startEditing() {
    if (editing) return;
    editing = true;
    document.body.classList.add('ed-on');
    fab.style.display = 'none';
    buildBar();
    markEditable(root);
    status('편집 중: 글자를 클릭해서 수정하세요.');
  }

  function markEditable(scope) {
    scope.querySelectorAll(EDIT_SEL).forEach(function (n) {
      if (n.closest('.ed-bar')) return;
      if (n.parentElement && n.parentElement.closest('[contenteditable="true"]')) return;
      if (n.querySelector('iframe')) return;
      n.setAttribute('contenteditable', 'true');
    });
    scope.querySelectorAll('.avatar').forEach(function (a) { a.classList.add('ed-clickable'); a.title = '클릭해서 사진 바꾸기'; });
  }

  function buildBar() {
    bar = el('div', { 'class': 'ed-bar' });
    bar.innerHTML =
      '<div class="ed-group"><button data-a="save" class="ed-primary">저장</button><button data-a="exit">편집 종료</button></div>' +
      '<div class="ed-group"><span class="ed-lbl">글자</span><button data-a="bold"><b>B</b></button><button data-a="italic"><i>I</i></button><button data-a="link">링크</button><button data-a="unlink">링크 해제</button></div>' +
      '<div class="ed-group"><span class="ed-lbl">항목</span><button data-a="item-up">&uarr;</button><button data-a="item-down">&darr;</button><button data-a="item-dup">복제</button><button data-a="item-del">삭제</button></div>' +
      '<div class="ed-group"><span class="ed-lbl">섹션</span><button data-a="sec-up">&uarr;</button><button data-a="sec-down">&darr;</button><button data-a="sec-del">삭제</button></div>' +
      '<div class="ed-group"><span class="ed-lbl">추가</span><button data-a="add-p">문단</button><button data-a="add-sec">새 섹션</button><button data-a="add-img">이미지</button></div>' +
      '<div class="ed-group"><button data-a="logout">로그아웃</button></div>' +
      '<div class="ed-status"></div>';
    document.body.appendChild(bar);
    statusEl = bar.querySelector('.ed-status');
    // keep the text selection when pressing toolbar buttons
    bar.addEventListener('mousedown', function (e) { if (e.target.closest('button')) e.preventDefault(); });
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b) act(b.getAttribute('data-a'));
    });
  }

  function setCurrent(target) {
    if (curItem) curItem.classList.remove('ed-cur-item');
    if (curSection) curSection.classList.remove('ed-cur-sec');
    curItem = target ? (target.closest(ITEM_SEL) || target.closest(ITEM_SEL2)) : null;
    if (curItem && !root.contains(curItem)) curItem = null;
    curSection = target ? target.closest('section.block') : null;
    if (curSection && !root.contains(curSection)) curSection = null;
    if (curItem) curItem.classList.add('ed-cur-item');
    if (curSection) curSection.classList.add('ed-cur-sec');
  }

  // links do not navigate while editing; track the current item/section
  document.addEventListener('click', function (e) {
    if (!editing || e.target.closest('.ed-bar, .ed-modal')) return;
    if (root.contains(e.target)) {
      if (e.target.closest('a')) e.preventDefault();
      setCurrent(e.target);
      var av = e.target.closest('.avatar');
      if (av) pickImage(function (src, path) {
        var img = el('img', { 'class': 'avatar', src: src, 'data-ed-src': path, alt: 'Photo of ' + (document.querySelector('.brand') || {}).textContent });
        img.classList.add('ed-clickable');
        av.replaceWith(img);
        markDirty();
      });
    }
  }, true);

  root.addEventListener('input', markDirty);
  function markDirty() { dirty = true; status('저장하지 않은 변경 사항이 있습니다.', 'warn'); }

  // plain-text paste only
  root.addEventListener('paste', function (e) {
    if (!editing) return;
    e.preventDefault();
    var text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  });

  // Enter: new paragraph after a paragraph; Shift+Enter: line break elsewhere
  root.addEventListener('keydown', function (e) {
    if (!editing || e.key !== 'Enter' || e.isComposing) return;
    var host = e.target.closest('[contenteditable="true"]');
    if (!host) return;
    e.preventDefault();
    if (e.shiftKey) { document.execCommand('insertLineBreak'); return; }
    if (host.tagName === 'P') {
      var p = el('p', { contenteditable: 'true' }, '<br>');
      host.after(p); p.focus(); setCurrent(p); markDirty();
    }
  });

  window.addEventListener('beforeunload', function (e) {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  function need(x, msg) { if (!x) status(msg, 'warn'); return !!x; }

  function act(a) {
    switch (a) {
      case 'save': return save();
      case 'exit':
        if (dirty && !confirm('저장하지 않은 변경 사항을 버릴까요?')) return;
        dirty = false; location.reload(); return;
      case 'logout':
        if (dirty && !confirm('저장하지 않은 변경 사항을 버리고 로그아웃할까요?')) return;
        clearToken(); dirty = false; location.href = location.pathname; return;
      case 'bold': document.execCommand('bold'); return markDirty();
      case 'italic': document.execCommand('italic'); return markDirty();
      case 'link': {
        var sel = window.getSelection();
        var a0 = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement).closest('a');
        var cur = a0 ? a0.getAttribute('href') : (curItem && curItem.matches('a') ? curItem.getAttribute('href') : 'https://');
        var url = prompt('링크 주소 (URL)', cur || 'https://');
        if (!url) return;
        if (a0) a0.setAttribute('href', url);
        else if (sel.isCollapsed && curItem && curItem.matches('a')) curItem.setAttribute('href', url);
        else if (!sel.isCollapsed) document.execCommand('createLink', false, url);
        else { status('링크로 만들 글자를 먼저 드래그해서 선택하세요.', 'warn'); return; }
        return markDirty();
      }
      case 'unlink': document.execCommand('unlink'); return markDirty();
      case 'item-up':
        if (need(curItem, '움직일 항목을 먼저 클릭하세요.') && curItem.previousElementSibling) {
          curItem.previousElementSibling.before(curItem); markDirty(); curItem.scrollIntoView({ block: 'nearest' });
        } return;
      case 'item-down':
        if (need(curItem, '움직일 항목을 먼저 클릭하세요.') && curItem.nextElementSibling) {
          curItem.nextElementSibling.after(curItem); markDirty(); curItem.scrollIntoView({ block: 'nearest' });
        } return;
      case 'item-dup':
        if (need(curItem, '복제할 항목을 먼저 클릭하세요.')) {
          var c = curItem.cloneNode(true); c.classList.remove('ed-cur-item'); curItem.after(c); setCurrent(c); markDirty();
        } return;
      case 'item-del':
        if (need(curItem, '삭제할 항목을 먼저 클릭하세요.') && confirm('이 항목을 삭제할까요?')) {
          curItem.remove(); setCurrent(null); markDirty();
        } return;
      case 'sec-up':
        if (need(curSection, '섹션 안을 먼저 클릭하세요.')) {
          var prev = curSection.previousElementSibling;
          while (prev && !prev.matches('section.block')) prev = prev.previousElementSibling;
          if (prev) { prev.before(curSection); markDirty(); curSection.scrollIntoView({ block: 'nearest' }); }
        } return;
      case 'sec-down':
        if (need(curSection, '섹션 안을 먼저 클릭하세요.')) {
          var next = curSection.nextElementSibling;
          while (next && !next.matches('section.block')) next = next.nextElementSibling;
          if (next) { next.after(curSection); markDirty(); curSection.scrollIntoView({ block: 'nearest' }); }
        } return;
      case 'sec-del':
        if (need(curSection, '삭제할 섹션 안을 먼저 클릭하세요.') && confirm('이 섹션 전체를 삭제할까요?')) {
          curSection.remove(); setCurrent(null); markDirty();
        } return;
      case 'add-p': {
        var p = el('p', { contenteditable: 'true' }, '새 문단을 입력하세요.');
        insertNear(p); return;
      }
      case 'add-sec': {
        var s = el('section', { 'class': 'block' }, '<h2>New section</h2><p>Text</p>');
        if (curSection) curSection.after(s); else appendToRoot(s);
        markEditable(s); setCurrent(s.querySelector('p')); s.querySelector('h2').focus(); markDirty(); return;
      }
      case 'add-img':
        pickImage(function (src, path, name) {
          var f = el('figure', { 'class': 'img-block' });
          f.appendChild(el('img', { src: src, 'data-ed-src': path, alt: name }));
          f.appendChild(el('figcaption', { contenteditable: 'true' }, '그림 설명'));
          insertNear(f);
        });
        return;
    }
  }

  function insertNear(node) {
    if (curItem && curItem.matches('p, figure')) curItem.after(node);
    else if (curSection) curSection.appendChild(node);
    else appendToRoot(node);
    if (node.getAttribute('contenteditable')) node.focus();
    setCurrent(node); markDirty();
  }

  // keep new content inside the EDITABLE markers
  function appendToRoot(node) {
    var endMark = null;
    root.childNodes.forEach(function (n) { if (n.nodeType === 8 && n.nodeValue.trim() === 'EDITABLE:END') endMark = n; });
    if (endMark) root.insertBefore(node, endMark); else root.appendChild(node);
  }

  // ------------------------------------------------------------ images
  function pickImage(cb) {
    var inp = el('input', { type: 'file', accept: 'image/*' });
    inp.onchange = function () {
      var f = inp.files[0];
      if (!f) return;
      status('이미지 업로드 중...');
      prepareImage(f).then(function (img) {
        var path = 'assets/img/uploads/' + stamp() + '-' + img.name;
        return gh('PUT', '/contents/' + path, {
          message: 'Upload image ' + img.name + ' via site editor',
          content: img.b64, branch: BRANCH
        }).then(function () {
          cb(img.dataUrl, '/' + path, img.name.replace(/\.[a-z]+$/i, ''));
          status('이미지 업로드 완료. 페이지 저장을 눌러야 배치가 반영됩니다.', 'warn');
        });
      }).catch(function (e) { status('이미지 업로드 실패: ' + e.message, 'err'); });
    };
    inp.click();
  }

  function stamp() {
    var d = new Date(), z = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '-' + z(d.getHours()) + z(d.getMinutes()) + z(d.getSeconds());
  }

  // shrink large photos to at most 1600 px on the long side
  function prepareImage(file) {
    var base = file.name.toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onerror = reject;
      r.onload = function () {
        var dataUrl = r.result;
        var im = new Image();
        im.onerror = function () { reject(new Error('이미지를 읽을 수 없습니다.')); };
        im.onload = function () {
          var max = 1600, w = im.naturalWidth, h = im.naturalHeight;
          var keep = /svg|gif/.test(file.type) || (Math.max(w, h) <= max && file.size <= 800 * 1024);
          if (keep) {
            var ext = (file.name.match(/\.([a-z0-9]+)$/i) || [, 'png'])[1].toLowerCase();
            return resolve({ name: base + '.' + ext, dataUrl: dataUrl, b64: dataUrl.split(',')[1] });
          }
          var k = Math.min(1, max / Math.max(w, h));
          var c = document.createElement('canvas');
          c.width = Math.round(w * k); c.height = Math.round(h * k);
          var g = c.getContext('2d');
          g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
          g.drawImage(im, 0, 0, c.width, c.height);
          var out = c.toDataURL('image/jpeg', 0.85);
          resolve({ name: base + '.jpg', dataUrl: out, b64: out.split(',')[1] });
        };
        im.src = dataUrl;
      };
      r.readAsDataURL(file);
    });
  }

  // ------------------------------------------------------------ save
  function cleanHTML() {
    var c = root.cloneNode(true);
    c.querySelectorAll('[contenteditable]').forEach(function (n) { n.removeAttribute('contenteditable'); });
    c.querySelectorAll('[data-ed-src]').forEach(function (n) { n.setAttribute('src', n.getAttribute('data-ed-src')); n.removeAttribute('data-ed-src'); });
    c.querySelectorAll('.ed-cur-item, .ed-cur-sec, .ed-clickable').forEach(function (n) {
      n.classList.remove('ed-cur-item', 'ed-cur-sec', 'ed-clickable');
    });
    c.querySelectorAll('[class=""]').forEach(function (n) { n.removeAttribute('class'); });
    c.querySelectorAll('[style=""]').forEach(function (n) { n.removeAttribute('style'); });
    c.querySelectorAll('.avatar[title]').forEach(function (n) { n.removeAttribute('title'); });
    var h = c.innerHTML;
    var i = h.indexOf(START), j = h.lastIndexOf(END);
    if (i >= 0 && j > i) h = h.slice(i + START.length, j);
    return '\n' + h.replace(/^\s*\n/, '').replace(/\s+$/, '') + '\n';
  }

  function save() {
    var path = filePath();
    status('저장 중...');
    var newInner = cleanHTML();
    gh('GET', '/contents/' + path + '?ref=' + BRANCH).then(function (f) {
      var src = b64decodeText(f.content);
      var i = src.indexOf(START), j = src.indexOf(END);
      if (i < 0 || j < i) throw new Error('이 페이지에는 편집 영역 표시가 없습니다.');
      var out = src.slice(0, i + START.length) + newInner + src.slice(j);
      if (out === src) { dirty = false; status('바뀐 내용이 없습니다.'); return null; }
      return gh('PUT', '/contents/' + path, {
        message: 'Edit ' + path + ' via site editor',
        content: b64encodeText(out), sha: f.sha, branch: BRANCH
      });
    }).then(function (res) {
      if (res === null) return;
      dirty = false;
      status('저장 완료. 1~2분 뒤 사이트에 반영됩니다.', 'ok');
    }).catch(function (e) {
      var hint = (e.status === 401 || e.status === 403 || e.status === 404) ? ' (토큰 권한이나 만료일을 확인하세요)' : '';
      status('저장 실패: ' + e.message + hint, 'err');
    });
  }
})();
