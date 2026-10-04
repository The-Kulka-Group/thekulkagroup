/* LA-1489. The client comment layer on /b/<token>, built from the LA-1484
   frames. It runs only when the server put a reader's layer in #cm-data, which
   it does only for a valid reader cookie and never in print. It reads the page's
   own data-el ids and never changes budget-page.js or scrollcraft.js: markers,
   outlines and cards sit on top. Every string from the server is set as text,
   never as markup. */
(function () {
  'use strict';
  var doc = document, root = doc.documentElement;
  var source = doc.getElementById('cm-data');
  if (!source) return;
  var data;
  try { data = JSON.parse(source.textContent); } catch (e) { return; }

  var base = location.pathname.replace(/\/+$/, '');
  var phoneMQ = matchMedia('(max-width: 860px)');
  var phone = function () { return phoneMQ.matches; };
  var hdH = function () { return parseFloat(getComputedStyle(root).getPropertyValue('--hd-h')) || 96; };
  var hd = doc.querySelector('.hd');
  var toggle = doc.querySelector('[data-cm-toggle]');
  var KIND = { comment: 'Comment', question: 'Question', flag: 'Flag' };
  var PRIORITY = { answered: 0, open: 1, done: 2 };
  var STATE = { open: 'Open', answered: 'Answered' };
  var GONE = 'Removed at the Writer\u2019s Request';

  // --- Small helpers ------------------------------------------------------------

  /** An element with attributes and children. Strings become text nodes. */
  function h(tag, attrs, kids) {
    var el = doc.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (kid) {
      if (kid === null || kid === undefined || kid === false) return;
      el.appendChild(typeof kid === 'string' ? doc.createTextNode(kid) : kid);
    });
    return el;
  }
  var dot = function () { return h('i', { class: 'dot', 'aria-hidden': 'true' }); };
  var who = function (p) { return p.company ? p.name + ', ' + p.company : p.name; };
  var day = function (iso) {
    try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch (e) { return ''; }
  };
  var esc = function (s) { return window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&'); };
  function store(fn) { try { return fn(window.localStorage); } catch (e) { return null; } }
  /** A click handler that keeps the click from reaching the page or closing the card. */
  var only = function (fn) { return function (e) { e.stopPropagation(); fn(e); }; };

  // --- The data ---------------------------------------------------------------

  var els = {};
  var byEl = {};
  var earlier = [];
  function index() {
    els = {};
    data.elements.forEach(function (e) { els[e[0]] = { id: e[0], label: e[1], figure: e[2], text: e[3], flag: e[4] }; });
    byEl = {};
    earlier = [];
    data.threads.forEach(function (t) {
      if (t.on === null) earlier.push(t);
      else (byEl[t.on] = byEl[t.on] || []).push(t);
    });
  }

  function stateOf(t) { return t.status === 'closed' ? 'done' : t.status; }
  function stateWords(t) {
    if (t.status !== 'closed') return STATE[t.status];
    if (t.outcome === 'accepted') return t.carriedInto ? 'Carried Into Version ' + t.carriedInto : 'Accepted for Next Version';
    if (t.outcome === 'declined') return 'Declined';
    if (t.outcome === 'withdrawn') return 'Withdrawn';
    return 'Closed';
  }
  function stateLabel(t) { return h('span', { class: 'st st--' + stateOf(t) }, [dot(), stateWords(t)]); }
  /** The state that most needs the reader: an answer to read, then an open thread, then closed. */
  function lead(threads) {
    return threads.reduce(function (best, t) { return PRIORITY[stateOf(t)] < PRIORITY[best] ? stateOf(t) : best; }, 'done');
  }
  /** A thread's first line: a flag's correction, else the opening post. Null once the writer asked for removal. */
  function firstLine(t) {
    if (t.kind === 'flag') return t.proposed;
    var m = t.messages[0];
    return m ? m.body : null;
  }

  // --- Where each element is on the page ------------------------------------------

  /** The element that carries an id: the first outside the drawings and the PDF links. */
  function hostOf(id) {
    var all = doc.querySelectorAll('[data-el="' + esc(id) + '"]');
    for (var i = 0; i < all.length; i++) {
      if (!all[i].closest('svg, .dests')) return all[i];
    }
    return null;
  }
  /** Where a marker and an outline go: a schedule line's own button, or the element itself. */
  function targetOf(host) { return host.classList.contains('sov-line') ? host.querySelector('.sov-h') || host : host; }
  var inline = function (el) { return getComputedStyle(el).display === 'inline'; };
  var commentable = function (id) { return id.indexOf('section:') !== 0; };

  // --- Markers --------------------------------------------------------------------

  var watchers = [];
  function marker(threads, label, host) {
    var n = threads.length;
    var m = h('span', {
      class: 'cm cm--' + lead(threads),
      role: 'button',
      tabindex: '0',
      title: n + (n === 1 ? ' Thread, ' : ' Threads, ') + label,
      'aria-label': n + (n === 1 ? ' thread on ' : ' threads on ') + label,
    }, [dot(), String(n)]);
    var open = function (e) {
      e.preventDefault();
      e.stopPropagation();
      showThreads(threads, host, label);
    };
    m.addEventListener('click', open);
    m.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') open(e); });
    return m;
  }

  function drawMarkers() {
    Array.prototype.forEach.call(doc.querySelectorAll('.cm'), function (m) { m.remove(); });
    Array.prototype.forEach.call(doc.querySelectorAll('.cm-host'), function (m) { m.classList.remove('cm-host'); });
    watchers.forEach(function (w) { w.disconnect(); });
    watchers = [];

    // A closed schedule line carries the count of every thread on it and inside it
    // (Matt, 2026-10-02), so a reply on a line shows while its row is closed.
    var inside = new Map();
    Object.keys(byEl).forEach(function (id) {
      var host = hostOf(id);
      if (!host) return;
      var item = host.closest('.sov-line[data-el]');
      if (item === host) return;
      if (item) inside.set(item, (inside.get(item) || []).concat(byEl[id]));
      var target = targetOf(host);
      var label = (els[id] && els[id].label) || byEl[id][0].anchor.label || 'This Item';
      var m = marker(byEl[id], label, host);
      if (inline(target)) m.classList.add('cm--inline');
      else target.classList.add('cm-host');
      target.appendChild(m);
    });

    Array.prototype.forEach.call(doc.querySelectorAll('.sov > .sov-line[data-el]'), function (item) {
      var id = item.getAttribute('data-el');
      var own = byEl[id] || [];
      var all = own.concat(inside.get(item) || []);
      if (all.length === 0) return;
      var btn = item.querySelector('.sov-h');
      var label = (els[id] && els[id].label) || 'This Row';
      btn.classList.add('cm-host');
      var current = null;
      var draw = function () {
        if (current) current.remove();
        current = null;
        var list = item.getAttribute('data-open') === 'true' ? own : all;
        if (list.length === 0) return;
        current = marker(list, label, item);
        btn.appendChild(current);
      };
      draw();
      var w = new MutationObserver(draw);
      w.observe(item, { attributes: true, attributeFilter: ['data-open'] });
      watchers.push(w);
    });
  }

  // --- The header control and its badge ------------------------------------------

  var seenKey = 'kulka-cm-seen:' + base;
  /** Kulka's replies since this browser last opened the page. */
  function countNew() {
    var seen = store(function (s) { return s.getItem(seenKey); });
    store(function (s) { s.setItem(seenKey, new Date().toISOString()); });
    if (!seen) return 0;
    var n = 0;
    data.threads.forEach(function (t) { t.messages.forEach(function (m) { if (m.kulka && m.at > seen) n++; }); });
    return n;
  }
  function drawBadge(n) {
    var old = toggle.querySelector('.hd-badge');
    if (old) old.remove();
    if (n > 0) toggle.appendChild(h('b', { class: 'hd-badge', 'aria-label': n + (n === 1 ? ' New Reply' : ' New Replies') }, [String(n)]));
  }

  // --- Comment mode -------------------------------------------------------------

  var bar = null;
  function markCommentable() {
    Array.prototype.forEach.call(doc.querySelectorAll('[data-cm-able]'), function (el) { el.removeAttribute('data-cm-able'); });
    data.elements.forEach(function (e) {
      if (!commentable(e[0])) return;
      var host = hostOf(e[0]);
      if (host) host.setAttribute('data-cm-able', '');
    });
  }
  var modeOn = function () { return root.classList.contains('cmode'); };
  function setMode(on) {
    root.classList.toggle('cmode', on);
    toggle.classList.toggle('is-on', on);
    toggle.setAttribute('aria-pressed', String(on));
    toggle.querySelector('[data-cm-label]').textContent = on ? 'Done' : 'Comment';
    if (on) {
      markCommentable();
      if (!bar) bar = h('p', { class: 'cmode-bar', role: 'status' }, ['Tap any line, answer or figure to comment on it.']);
      hd.appendChild(bar);
      drawBadge(0);
    } else {
      if (bar) bar.remove();
      closeCard();
    }
  }

  /** The commentable id under a click, following a data-el-ref to the id it names. */
  function idAt(node) {
    if (node.closest('svg')) return null;
    for (var el = node; el && el !== doc.body; el = el.parentElement) {
      var id = el.getAttribute('data-el') || el.getAttribute('data-el-ref');
      if (id && els[id] && commentable(id)) return id;
    }
    return null;
  }

  // In comment mode a tap opens the composer and nothing else, so it never
  // fights the schedule's tap-to-open lines.
  doc.addEventListener('click', function (e) {
    if (!modeOn()) return;
    var t = e.target;
    if (!t.closest || t.closest('.cc, .hd, .cm, .earlier') || !t.closest('main')) return;
    var id = idAt(t);
    if (!id) return;
    e.preventDefault();
    e.stopPropagation();
    var sel = '[data-el="' + esc(id) + '"], [data-el-ref="' + esc(id) + '"]';
    composer(id, t.closest(sel) || hostOf(id));
  }, true);

  // --- The card -----------------------------------------------------------------

  var card = null, leadLine = null, onHost = null;
  function closeCard() {
    if (card) card.remove();
    if (leadLine) leadLine.remove();
    if (onHost) onHost.removeAttribute('data-cm-on');
    card = leadLine = onHost = null;
    root.classList.remove('has-sheet');
  }

  function openCard(host, kids, wide, focus) {
    closeCard();
    card = h('div', { class: 'cc' + (wide ? ' cc--wide' : ''), role: 'dialog', tabindex: '-1' },
      [h('i', { class: 'cc-grab', 'aria-hidden': 'true' })].concat(kids));
    doc.body.appendChild(card);
    if (host) { onHost = host; host.setAttribute('data-cm-on', ''); }
    place(host);
    var first = focus && !phone() ? card.querySelector('input, textarea') : null;
    (first || card).focus({ preventScroll: true });
    return card;
  }

  function place(host) {
    var target = host ? targetOf(host) : null;
    if (phone()) {
      root.classList.add('has-sheet');
      if (!target) return;
      // The page scrolls so the element sits just above the sheet.
      var top = card.getBoundingClientRect().top, r = target.getBoundingClientRect();
      var delta = r.bottom - (top - 12);
      if (r.top - delta < hdH() + 8) delta = r.top - hdH() - 8;
      if (delta > 0 || r.top < hdH()) window.scrollBy(0, delta);
      return;
    }
    var w = card.offsetWidth, sx = window.scrollX, sy = window.scrollY, gap = 28;
    if (!target) {
      card.style.left = Math.max(16, (innerWidth - w) / 2) + sx + 'px';
      card.style.top = sy + hdH() + 24 + 'px';
      return;
    }
    var rect = target.getBoundingClientRect();
    var x, y, beside = true;
    if (rect.right + gap + w <= innerWidth - 16) x = rect.right + gap;
    else if (rect.left - gap - w >= 16) x = rect.left - gap - w;
    else { beside = false; x = Math.min(Math.max(16, rect.left), innerWidth - w - 16); }
    y = beside ? Math.max(rect.top - 8, hdH() + 12) : rect.bottom + 10;
    card.style.left = x + sx + 'px';
    card.style.top = y + sy + 'px';
    if (beside) {
      var fromRight = x > rect.right;
      leadLine = h('i', { class: 'cc-lead', 'aria-hidden': 'true' });
      leadLine.style.top = rect.top + Math.min(rect.height / 2, 24) + sy + 'px';
      leadLine.style.left = (fromRight ? rect.right : x + w) + sx + 'px';
      leadLine.style.width = Math.max(0, fromRight ? x - rect.right : rect.left - x - w) + 'px';
      doc.body.appendChild(leadLine);
    }
  }

  doc.addEventListener('click', function (e) {
    if (!card || (e.target.closest && e.target.closest('.cc, .cm'))) return;
    closeCard();
  });
  doc.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (card) closeCard();
    else if (modeOn()) setMode(false);
  });
  window.addEventListener('resize', function () { if (card && !phone()) closeCard(); });

  function head(label, figure, state) {
    return h('div', { class: 'cc-hd' }, [
      h('div', { class: 'cc-on' }, [
        h('p', { class: 'cc-l' }, [label]),
        figure ? h('p', { class: 'cc-v' }, [h('span', { class: 'num' }, [figure])]) : null,
      ]),
      state,
      h('button', { class: 'cc-x', type: 'button', 'aria-label': 'Close', onclick: closeCard }, ['\u00d7']),
    ]);
  }

  function signedIn() {
    return h('p', { class: 'cc-as' }, [
      'Commenting As ',
      h('b', null, [who(data.reader)]),
      h('button', { type: 'button', onclick: notYou }, ['Not You?']),
    ]);
  }

  function notYou() {
    fetch('/b/r/clear', { method: 'POST', credentials: 'same-origin' })
      .catch(function () {})
      .then(function () { location.reload(); });
  }

  function errorWords(status) {
    if (status === 429) return 'You have reached today\u2019s limit. Try again tomorrow.';
    if (status === 404) return 'This version no longer takes new comments.';
    if (status === 409) return 'This thread was closed.';
    if (status === 403) return 'Your link no longer works here. Ask Kulka for a new one.';
    return 'That did not post. Try again.';
  }

  function post(path, body) {
    return fetch(base + path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (res) {
      if (!res.ok) throw res.status;
      return res.json();
    });
  }

  function refresh() {
    return fetch(base + '/threads', { credentials: 'same-origin' })
      .then(function (res) { if (!res.ok) throw res.status; return res.json(); })
      .then(function (next) { data = next; index(); drawMarkers(); drawEarlier(); if (modeOn()) markCommentable(); });
  }
  var threadById = function (id) { return data.threads.filter(function (x) { return x.id === id; })[0]; };

  // --- The composer ---------------------------------------------------------------

  function composer(id, host) {
    var e = els[id];
    if (!e || !data.takesNew) return;
    var kinds = [['comment', 'Comment'], ['question', 'Ask a Question']];
    if (e.flag) kinds.push(['flag', 'Flag This Assumption']);
    var kind = 'comment';
    var here = byEl[id] || [];
    var body = h('div', { class: 'cc-body' });
    var err = h('p', { class: 'cc-err', role: 'alert' });
    var postBtn = h('button', { class: 'btn btn--ink', type: 'button' }, ['Post']);
    var fields = {};
    var tabs = h('div', { class: 'views cc-kinds', role: 'tablist', 'aria-label': 'Kind' }, kinds.map(function (k) {
      return h('button', { class: 'view', type: 'button', role: 'tab', 'data-kind': k[0], onclick: only(function () { pick(k[0]); }) }, [k[1]]);
    }));

    function pick(next) {
      kind = next;
      Array.prototype.forEach.call(tabs.children, function (b) {
        var on = b.getAttribute('data-kind') === kind;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-selected', String(on));
      });
      body.textContent = '';
      if (kind === 'flag') {
        fields.proposed = h('input', { class: 'cc-field cc-field--one', type: 'text', maxlength: '4000', 'aria-label': 'What It Should Be' });
        fields.body = h('textarea', { class: 'cc-field cc-field--short', rows: '2', maxlength: '4000', 'aria-label': 'Why' });
        body.appendChild(h('div', { class: 'says' }, [
          h('div', { class: 'says-c says-c--budget' }, [h('p', { class: 'cc-lab' }, ['Budget Says']), h('p', { class: 'says-v' }, [e.text || e.figure || e.label])]),
          h('div', { class: 'says-c' }, [h('p', { class: 'cc-lab' }, ['What It Should Be']), fields.proposed]),
        ]));
        body.appendChild(h('div', null, [h('p', { class: 'cc-lab' }, ['Why', h('span', null, ['Optional'])]), fields.body]));
      } else {
        fields.proposed = null;
        fields.body = h('textarea', {
          class: 'cc-field',
          rows: '3',
          maxlength: '4000',
          'aria-label': kind === 'question' ? 'Your Question' : 'Your Comment',
          placeholder: kind === 'question' ? 'Ask Kulka about this' : 'Write a comment',
        });
        body.appendChild(fields.body);
      }
      if (card) card.classList.toggle('cc--wide', kind === 'flag');
      err.textContent = '';
      if (card && !phone()) (fields.proposed || fields.body).focus({ preventScroll: true });
    }

    postBtn.addEventListener('click', function () {
      var text = fields.body.value.trim();
      var proposed = fields.proposed ? fields.proposed.value.trim() : null;
      if (kind === 'flag' && !proposed) { err.textContent = 'Say what it should be.'; return; }
      if (kind !== 'flag' && !text) { err.textContent = kind === 'question' ? 'Write your question.' : 'Write your comment.'; return; }
      postBtn.disabled = true;
      err.textContent = '';
      post('/threads', { kind: kind, element_id: id, body: text || null, proposed: proposed })
        .then(function (res) { return refresh().then(function () { return res.thread.id; }); })
        .then(function (threadId) {
          var t = threadById(threadId);
          if (t) showThread(t, hostOf(id) || host, null); else closeCard();
        })
        .catch(function (status) { err.textContent = errorWords(status); postBtn.disabled = false; });
    });

    pick('comment');
    openCard(host, [
      head(e.label, e.figure, null),
      here.length > 0
        ? h('button', { class: 'cc-back', type: 'button', onclick: only(function () { showThreads(byEl[id] || [], host, e.label); }) },
            [here.length === 1 ? 'Show the Thread Here' : 'Show the ' + here.length + ' Threads Here'])
        : null,
      tabs,
      body,
      err,
      h('div', { class: 'cc-ft' }, [signedIn(), postBtn]),
    ], false, true);
  }

  // --- Threads --------------------------------------------------------------------

  function showThreads(threads, host, title) {
    if (threads.length === 0) return;
    if (threads.length === 1) return showThread(threads[0], host, null);
    var id = host && host.getAttribute('data-el');
    var again = function () { showThreads(threads, host, title); };
    var newBtn = data.takesNew && id && els[id]
      ? h('button', { class: 'btn', type: 'button', onclick: only(function () { composer(id, host); }) }, ['New Comment'])
      : null;
    openCard(host, [
      head(title, null, h('p', { class: 'cc-state' }, [h('span', { class: 'cc-kind' }, [threads.length + ' Threads'])])),
      h('ol', { class: 'folds' }, threads.map(function (t) {
        var line = firstLine(t);
        var declined = t.outcome === 'declined' ? t.messages.filter(function (m) { return m.kulka && m.body; }).slice(-1)[0] : null;
        var open = only(function () { showThread(t, host, again); });
        return h('li', { class: 'fold', tabindex: '0', role: 'button', onclick: open, onkeydown: function (ev) { if (ev.key === 'Enter') open(ev); } }, [
          h('p', { class: 'fold-top' }, [stateLabel(t), h('span', { class: 'fold-k' }, [KIND[t.kind] + ' \u00b7 ' + day(t.openedAt)])]),
          line === null ? h('p', { class: 'fold-1 fold-1--gone' }, [GONE]) : h('p', { class: 'fold-1' }, [line]),
          declined ? h('p', { class: 'fold-r' }, [h('b', null, [declined.author]), declined.body]) : null,
        ]);
      })),
      newBtn ? h('div', { class: 'cc-ft' }, [h('span', { class: 'cc-as' }), newBtn]) : null,
    ], true, false);
  }

  function showThread(t, host, back) {
    var current = t.on && els[t.on];
    var label = (current && current.label) || t.anchor.label || 'This Item';
    var figure = current ? current.figure : t.anchor.figure;

    var from = null;
    if (t.fromVersion) {
      var said = function (v) { return [v.text, v.figure].filter(Boolean).join(' \u00b7 ') || 'Nothing Shown'; };
      from = h('div', { class: 'cc-from' }, [
        h('p', null, [h('b', null, ['From Version ' + t.fromVersion])]),
        t.changed
          ? h('div', null, [
              h('p', null, [h('b', null, ['Changed Since Version ' + t.fromVersion])]),
              h('dl', { class: 'chg' }, [
                h('dt', null, ['Version ' + t.fromVersion]), h('dd', null, [said(t.changed.was)]),
                h('dt', null, ['Version ' + data.version]), h('dd', null, [said(t.changed.now)]),
              ]),
            ])
          : null,
      ]);
    }

    var says = t.kind === 'flag'
      ? h('div', { class: 'says' }, [
          h('div', { class: 'says-c says-c--budget' }, [h('p', { class: 'cc-lab' }, ['Budget Says']), h('p', { class: 'says-v' }, [t.anchor.text || t.anchor.figure || label])]),
          h('div', { class: 'says-c' }, [
            h('p', { class: 'cc-lab' }, ['Owner Says']),
            t.proposed !== null
              ? h('p', { class: 'says-v says-v--owner' }, [t.proposed])
              : h('p', { class: 'says-v says-v--owner msg-b--gone' }, [GONE]),
          ]),
        ])
      : null;

    var msgs = t.messages.length > 0
      ? h('ol', { class: 'msgs' }, t.messages.map(function (m) {
          return h('li', { class: 'msg' + (m.kulka ? ' msg--kulka' : '') }, [
            h('p', { class: 'msg-who' }, [h('b', null, [m.author]), [m.company, day(m.at)].filter(Boolean).join(' \u00b7 ')]),
            m.body === null ? h('p', { class: 'msg-b msg-b--gone' }, [GONE]) : h('p', { class: 'msg-b' }, [m.body]),
          ]);
        }))
      : null;

    var reply = null, err = null, foot = null;
    if (t.status !== 'closed') {
      err = h('p', { class: 'cc-err', role: 'alert' });
      reply = h('textarea', { class: 'cc-field cc-field--short', rows: '2', maxlength: '4000', placeholder: 'Reply', 'aria-label': 'Reply' });
      var replyBtn = h('button', { class: 'btn btn--ink', type: 'button' }, ['Reply']);
      var closeBtn = t.mine
        ? h('button', { class: 'btn', type: 'button' }, [t.kind === 'flag' ? 'Withdraw Flag' : t.kind === 'question' ? 'Close Question' : 'Close Comment'])
        : null;
      var after = function (res) {
        return refresh().then(function () {
          var next = threadById(res.thread.id);
          if (next) showThread(next, host, back); else closeCard();
        });
      };
      replyBtn.addEventListener('click', function () {
        var text = reply.value.trim();
        if (!text) { err.textContent = 'Write your reply.'; return; }
        replyBtn.disabled = true;
        post('/threads/' + t.id + '/messages', { body: text }).then(after)
          .catch(function (status) { err.textContent = errorWords(status); replyBtn.disabled = false; });
      });
      if (closeBtn) closeBtn.addEventListener('click', function () {
        closeBtn.disabled = true;
        post('/threads/' + t.id + '/close', {}).then(after)
          .catch(function (status) { err.textContent = errorWords(status); closeBtn.disabled = false; });
      });
      foot = h('div', { class: 'cc-ft' }, [signedIn(), closeBtn, replyBtn]);
    }

    openCard(host, [
      head(label, figure, h('p', { class: 'cc-state' }, [h('span', { class: 'cc-kind' }, [KIND[t.kind]]), stateLabel(t)])),
      back ? h('button', { class: 'cc-back', type: 'button', onclick: only(back) }, ['All Threads Here']) : null,
      from,
      says,
      msgs,
      reply,
      err,
      foot,
    ], t.kind === 'flag', false);
  }

  // --- From Earlier Versions --------------------------------------------------------

  function drawEarlier() {
    var old = doc.querySelector('.earlier');
    if (old) old.remove();
    var next = doc.getElementById('what-happens-next');
    if (earlier.length === 0 || !next) return;
    var box = h('div', { class: 'earlier' }, [
      h('h2', { class: 'gates-h' }, ['From Earlier Versions']),
      h('p', { class: 'earlier-sub' }, ['These threads were on parts of an earlier version that Version ' + data.version + ' does not have.']),
      h('ul', { class: 'orphs' }, earlier.map(function (t) {
        var row = h('li', { class: 'orph' });
        row.appendChild(h('div', { class: 'orph-a' }, [
          h('p', { class: 'orph-q' }, [t.anchor.text || t.anchor.figure || t.anchor.label || 'An Item']),
          h('p', { class: 'orph-m' }, [['Version ' + t.version, t.anchor.label, KIND[t.kind], who(t.by)].filter(Boolean).join(' \u00b7 ')]),
        ]));
        row.appendChild(stateLabel(t));
        row.appendChild(h('button', { class: 'pill', type: 'button', onclick: only(function () { showThread(t, row, null); }) }, ['Show']));
        return row;
      })),
    ]);
    next.insertBefore(box, next.querySelector('.foot'));
  }

  // --- Start ------------------------------------------------------------------------

  index();
  drawMarkers();
  drawEarlier();
  if (toggle && data.takesNew) {
    toggle.hidden = false;
    drawBadge(countNew());
    toggle.addEventListener('click', only(function () { setMode(!modeOn()); }));
  }
})();
