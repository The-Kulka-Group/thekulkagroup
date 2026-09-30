/* The page's own code. The engine (engine/scrollcraft.js) is untouched: it
   drives the cues, the counts and the pinned waterfall. Everything here is
   page-local: the tier switch, the drill-downs, the section index, the print
   rest, and the signature move, the running receipt, driven off scroll
   position and the waterfall stage's own geometry. */
(function () {
  'use strict';
  var doc = document, root = doc.documentElement;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var phone = function () { return innerWidth < 900; };
  // Under reduced motion a count does not bloom: the markup already carries
  // the final figure, so the device is simply not mounted.
  if (reduce) Array.prototype.forEach.call(doc.querySelectorAll('[data-sc-count]'), function (c) { c.removeAttribute('data-sc-count'); });
  var sc = ScrollCraft.mount(doc.body);

  /* ---- tiers: three depths of one DOM ---- */
  var TIERS = ['summary', 'detail', 'full'];
  var tierButtons = doc.querySelectorAll('.tier');
  function setTier(t, remember) {
    if (TIERS.indexOf(t) < 0) return;
    root.setAttribute('data-tier', t);
    Array.prototype.forEach.call(tierButtons, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-tier') === t)); });
    if (remember) { try { localStorage.setItem('kulka-budget-tier', t); } catch (e) {} }
    sc.layout();
    receipt.measure();
    receipt.read(true);
  }
  Array.prototype.forEach.call(tierButtons, function (b) {
    b.addEventListener('click', function () { setTier(b.getAttribute('data-tier'), true); });
  });
  Array.prototype.forEach.call(doc.querySelectorAll('[data-tier-to]'), function (b) {
    b.addEventListener('click', function () { setTier(b.getAttribute('data-tier-to'), true); });
  });
  function tierFromHash() {
    var h = location.hash.replace('#', '');
    return TIERS.indexOf(h) >= 0 ? h : null;
  }
  addEventListener('hashchange', function () { var t = tierFromHash(); if (t) setTier(t, true); });

  /* ---- drill-down at every tier ---- */
  function setOpen(scope, open) {
    scope.setAttribute('data-open', String(open));
    var btn = scope.querySelector('.scope__row[aria-expanded]');
    if (btn) btn.setAttribute('aria-expanded', String(open));
  }
  Array.prototype.forEach.call(doc.querySelectorAll('.scope__row[aria-expanded]'), function (btn) {
    btn.addEventListener('click', function () {
      var scope = btn.closest('.scope');
      setOpen(scope, scope.getAttribute('data-open') !== 'true');
      sc.layout();
      receipt.measure();
    });
  });

  /* ---- section index: the current section is marked as it passes ---- */
  var links = doc.querySelectorAll('[data-index]');
  var sections = Array.prototype.map.call(links, function (a) { return doc.getElementById(a.getAttribute('data-index')); });
  function spy() {
    var line = innerHeight * 0.35, current = sections[0];
    for (var i = 0; i < sections.length; i++) {
      // A section the tier hides has no box; it is never the current one (LA-1418).
      if (sections[i] && sections[i].offsetParent !== null && sections[i].getBoundingClientRect().top <= line) current = sections[i];
    }
    Array.prototype.forEach.call(links, function (a) {
      var on = a.getAttribute('data-index') === current.id;
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      if (on && phone() && a.scrollIntoView) {
        var ul = a.parentNode.parentNode;
        var r = a.getBoundingClientRect(), u = ul.getBoundingClientRect();
        if (r.left < u.left || r.right > u.right) ul.scrollTo({ left: a.offsetLeft - 12, behavior: reduce ? 'auto' : 'smooth' });
      }
    });
  }

  /* ---- the running receipt (signature move) ----
     One line per scope the reader has passed, with its real figure, in the
     order read. Scrolling back removes lines, because it is a record of
     position, not a one-shot reveal. At From Trades to Total the receipt
     folds: its Trades So Far row travels to the stage's own Trades row, and
     the ledger the reader built becomes the first figure of the total. */
  var receipt = (function () {
    var el = doc.getElementById('receipt');
    var list = el.querySelector('[data-receipt-lines]');
    var running = el.querySelector('[data-receipt-running]');
    var running2 = el.querySelector('[data-receipt-running-2]');
    var count = el.querySelector('[data-receipt-count]');
    var totalRow = el.querySelector('[data-receipt-total]');
    var toggle = el.querySelector('.receipt__toggle');
    var money = doc.getElementById('where-the-money-is');
    var stage = doc.querySelector('#from-trades-to-total [data-sc-stage]');
    var tradesRow = doc.querySelector('.wf__row--trades .wf__line');
    var restsOn = doc.getElementById('what-this-rests-on');
    var scopes = [], geo = [], shown = -1, state = 'hidden', lastKey = '';
    var fmt = function (n) { return '$' + Math.round(n).toLocaleString('en-US'); };

    function visible(node) { return node.offsetParent !== null || getComputedStyle(node).position === 'fixed'; }
    function measure() {
      scopes = Array.prototype.filter.call(money.querySelectorAll('.scope[data-receipt-label]'), visible);
      geo = scopes.map(function (s) { var r = s.getBoundingClientRect(); return r.top + scrollY + r.height; });
    }
    function render(n) {
      if (n === shown) return;
      var was = shown; shown = n;
      var html = '', sum = 0;
      for (var i = 0; i < n; i++) {
        var s = scopes[i], amt = parseFloat(s.getAttribute('data-receipt-amount')) || 0;
        var owner = s.getAttribute('data-receipt-owner') === 'true';
        if (!owner) sum += amt;
        html += '<li class="' + (owner ? 'is-owner' : '') + (i >= was ? ' is-new' : '') + '"><a href="#' + s.id + '"><span class="rl">' + esc(s.getAttribute('data-receipt-label')) + (owner ? ' (Owner)' : '') + '</span><span class="ra">' + fmt(amt) + '</span></a></li>';
      }
      list.innerHTML = html;
      running.textContent = fmt(sum);
      running2.textContent = fmt(sum);
      count.textContent = n === 0 ? 'No Scopes Yet' : n === 1 ? '1 Scope' : n + ' Scopes';
      if (n > was && list.lastElementChild && !phone()) list.lastElementChild.scrollIntoView({ block: 'nearest' });
    }
    function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
    function setState(s) { if (s !== state) { state = s; el.setAttribute('data-state', s); } }

    // Where a receipt line is "passed": its row's bottom is above 58% of the
    // viewport, the reading line on a page you scroll with your thumb.
    function read(force) {
      var line = scrollY + innerHeight * 0.58, n = 0;
      for (var i = 0; i < geo.length; i++) if (geo[i] <= line) n = i + 1;
      var moneyTop = money.getBoundingClientRect().top;
      var stageR = stage.getBoundingClientRect();
      var vh = innerHeight;
      var fold = 0;
      // Folding runs while the black stage slides up into view (top from vh
      // to 0). Once pinned it stays folded; after it leaves, totals only.
      if (stageR.top < vh * 0.92) fold = Math.min(1, Math.max(0, (vh * 0.92 - stageR.top) / (vh * 0.62)));
      var afterStage = stageR.bottom <= 0;
      var beforeMoney = moneyTop > vh * 0.75;
      if (beforeMoney) setState('hidden');
      else if (afterStage) setState('totals');
      else if (fold > 0) setState('folding');
      else setState('open');
      if (state === 'open' || state === 'folding') render(n);
      if (state === 'folding') {
        if (reduce) { el.style.setProperty('--fold', fold.toFixed(3)); }
        else {
          // Measure the travel with the transform off, so the delta is stable.
          totalRow.style.transform = 'none';
          var a = totalRow.getBoundingClientRect(), b = tradesRow.getBoundingClientRect();
          totalRow.style.transform = '';
          el.style.setProperty('--fold-dx', (b.left - a.left).toFixed(1) + 'px');
          el.style.setProperty('--fold-dy', (b.top - a.top).toFixed(1) + 'px');
          el.style.setProperty('--fold', fold.toFixed(3));
        }
      }
      // What actually paints, for the verification harness.
      var key = shown + ':' + (state === 'folding' ? fold.toFixed(2) : state === 'open' ? '0' : '1') + ':' + state;
      if (key !== lastKey || force) { el.setAttribute('data-sc-verify-state', key); lastKey = key; }
    }
    toggle.addEventListener('click', function () {
      if (!phone()) return;
      var open = el.getAttribute('data-expanded') === 'true';
      el.setAttribute('data-expanded', String(!open));
      toggle.setAttribute('aria-expanded', String(!open));
    });
    return { measure: measure, read: read, all: function () { measure(); render(scopes.length); } };
  })();

  /* ---- the loop: read scroll, drive the receipt and the index ---- */
  var ticking = false;
  function onScroll() {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () { ticking = false; receipt.read(false); spy(); });
  }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', function () { receipt.measure(); receipt.read(true); spy(); }, { passive: true });
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { receipt.measure(); receipt.read(true); });

  /* ---- print: the engine at rest, every drill-down open ---- */
  function rest() {
    Array.prototype.forEach.call(doc.querySelectorAll('.scope[data-open]'), function (s) { setOpen(s, true); });
    Array.prototype.forEach.call(doc.querySelectorAll('[data-sc-count]'), function (c) {
      var spec = (c.getAttribute('data-sc-count') || '').trim().split(/\s+/);
      c.textContent = spec[1] || c.textContent;
    });
    receipt.all();
  }
  addEventListener('beforeprint', rest);
  window.KulkaBudget = { setTier: setTier, rest: rest, receipt: receipt, engine: sc };

  /* ---- start ---- */
  var start = tierFromHash();
  if (!start) { try { start = localStorage.getItem('kulka-budget-tier'); } catch (e) {} }
  setTier(TIERS.indexOf(start) >= 0 ? start : 'summary', false);
  spy();
})();
