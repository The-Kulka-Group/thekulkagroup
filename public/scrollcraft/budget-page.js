/* The page's own code (LA-1459, "The Ledger, Opened with the Section"). The
   engine (scrollcraft.js) is untouched: it pins the second black band,
   publishes each act's progress as --sc-p, and drives the waterfall's cues.
   Everything here is page-local: the tier switch, the drill-downs, the
   section index, the header's two states and the figure's flight into its
   slot, the ledger's current row and the layer it draws on the section, the
   waterfall's figure advancing line by line and landing in light, and the
   print rest. */
(function () {
  'use strict';
  var doc = document, root = doc.documentElement;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var phoneMQ = matchMedia('(max-width: 860px)');
  var phone = function () { return phoneMQ.matches; };
  var printing = root.hasAttribute('data-print');
  var clamp = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  var ease = function (t) { t = clamp(t); return t * t * (3 - 2 * t); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var each = function (sel, fn, from) { Array.prototype.forEach.call((from || doc).querySelectorAll(sel), fn); };
  var hdH = function () { return parseFloat(getComputedStyle(root).getPropertyValue('--hd-h')) || 96; };
  if (reduce) root.classList.add('is-reduce');

  // Under reduced motion both bands resolve: nothing pins, every line is
  // present, the figure has landed, the section is fully drawn by the time
  // its sheet is reached. The engine still mounts for the flow reveals.
  if (reduce && !printing) {
    each('[data-sc-act="pin"]', function (a) { a.setAttribute('data-sc-act', 'flow'); a.removeAttribute('data-sc-span'); });
    each('[data-sc-cue]', function (c) { c.removeAttribute('data-sc-cue'); });
  }
  // On a phone, or a short window, the waterfall's lines do not fit a pinned
  // viewport. The band flows instead, the figure holds under the header, and
  // the lines arrive as they pass beneath it: the figure still advances on
  // each markup and lands in light.
  var peakAct = doc.getElementById('from-trades-to-total');
  if (peakAct && !printing && !reduce && (phone() || innerHeight < 700)) {
    peakAct.setAttribute('data-sc-act', 'flow');
    peakAct.removeAttribute('data-sc-span');
    peakAct.classList.add('band--flow');
    var rowsAt = peakAct.querySelectorAll('.wf-row[data-cue-at]');
    Array.prototype.forEach.call(rowsAt, function (r, i) {
      var c = (0.2 + i * 0.055).toFixed(2);
      r.setAttribute('data-sc-cue', c);
      r.setAttribute('data-cue-at', c);
    });
    // The owner's line lands with the last markup, while the figure is still on screen.
    each('.wf-after[data-cue-at]', function (r) {
      var c = (0.2 + (rowsAt.length - 1) * 0.055).toFixed(2);
      r.setAttribute('data-sc-cue', c);
      r.setAttribute('data-cue-at', c);
    }, peakAct);
  }
  if (peakAct && reduce) peakAct.classList.add('band--flow');
  var sc = printing ? { layout: function () {}, read: function () {} } : ScrollCraft.mount(doc.body);
  var p = function (act) { return parseFloat(act.style.getPropertyValue('--sc-p')) || 0; };

  /* ---- tiers: three depths of one DOM ---- */
  var TIERS = ['summary', 'detail', 'full'];
  var tierButtons = doc.querySelectorAll('.sw-t[data-tier]');
  function setTier(t, remember) {
    if (TIERS.indexOf(t) < 0) return;
    root.setAttribute('data-tier', t);
    Array.prototype.forEach.call(tierButtons, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-tier') === t)); });
    if (remember) { try { localStorage.setItem('kulka-budget-tier', t); } catch (e) {} }
    relayout();
  }
  Array.prototype.forEach.call(tierButtons, function (b) {
    b.addEventListener('click', function () { setTier(b.getAttribute('data-tier'), true); });
  });
  function tierFromHash() {
    var h = location.hash.replace('#', '');
    return TIERS.indexOf(h) >= 0 ? h : null;
  }
  addEventListener('hashchange', function () { var t = tierFromHash(); if (t) setTier(t, true); });

  /* ---- drill-down at every tier ---- */
  function setOpen(item, open) {
    item.setAttribute('data-open', String(open));
    var btn = item.querySelector('.lg-btn[aria-expanded]');
    if (btn) btn.setAttribute('aria-expanded', String(open));
  }
  each('.lg-item .lg-btn[aria-expanded]', function (btn) {
    btn.addEventListener('click', function () {
      var item = btn.closest('.lg-item');
      setOpen(item, item.getAttribute('data-open') !== 'true');
      relayout();
    });
  });

  /* ---- section index: the current section is marked as it passes ---- */
  var links = doc.querySelectorAll('[data-index]');
  var here = doc.querySelector('[data-here]');
  var sections = Array.prototype.map.call(links, function (a) { return doc.getElementById(a.getAttribute('data-index')); });
  function spy() {
    var line = innerHeight * 0.35, current = sections[0];
    for (var i = 0; i < sections.length; i++) {
      if (sections[i] && sections[i].offsetParent !== null && sections[i].getBoundingClientRect().top <= line) current = sections[i];
    }
    if (!current) return;
    Array.prototype.forEach.call(links, function (a) {
      var on = a.getAttribute('data-index') === current.id;
      if (on) { a.setAttribute('aria-current', 'true'); if (here) here.textContent = a.textContent; }
      else a.removeAttribute('aria-current');
    });
  }

  /* ---- the header's two states, and the figure's flight into its slot ----
     The first screen is the band grown to the viewport. As it scrolls up
     under the header the label, range, rates and stages leave (CSS, off
     --travel) and the figure, one object, moves and shrinks along a straight
     path from where it stood to the exact box of the header's slot, painted
     above the header the whole way. When it arrives the header's own copy
     shows in the same box and the band's figure is hidden. The figure's
     block travels with it, so nothing drifts out from under it. */
  var hd = doc.getElementById('bar');
  var band = doc.getElementById('your-number');
  var wrap = band && band.querySelector('.fig-wrap');
  var fig = band && band.querySelector('[data-travel]');
  var flight = { top: 0, left: 0, right: 0, font: 1, slotTop: 0, slotLeft: 0, slotRight: 0, slotFont: 22 };
  function slot() { return hd.querySelector(phone() ? '.hd-t2 .hd-fig-v' : '.hd-t1 .hd-fig-v'); }
  function measureFlight() {
    if (!hd || !fig || !wrap) return;
    var was = hd.style.getPropertyValue('--hd-t2');
    hd.style.setProperty('--hd-t2', '1');
    wrap.style.transform = 'none';
    fig.style.transform = 'none';
    var a = fig.getBoundingClientRect(), b = slot().getBoundingClientRect();
    hd.style.setProperty('--hd-t2', was);
    // Where the figure stands at the top of the page, in viewport terms.
    flight.top = a.top + scrollY;
    flight.left = a.left;
    flight.right = a.right;
    flight.font = parseFloat(getComputedStyle(fig).fontSize) || 200;
    flight.slotTop = b.top;
    flight.slotLeft = b.left;
    flight.slotRight = b.right;
    flight.slotFont = parseFloat(getComputedStyle(slot()).fontSize) || 22;
    band.setAttribute('data-fly', 'true');
  }
  function driveHeader() {
    if (!hd || !band) return;
    var span = Math.max(band.offsetHeight - hdH(), 1);
    var q = clamp(scrollY / span);
    if (reduce) q = q >= 0.999 ? 1 : 0;
    var e = ease(q);
    if (!reduce && fig && wrap) {
      // The block follows the eased path, not the scroll: the figure's top
      // goes from where it stood straight to the slot and never past it.
      var top = lerp(flight.top, flight.slotTop, e);
      var natural = flight.top - scrollY;
      wrap.style.transform = 'translate3d(0, ' + (top - natural).toFixed(1) + 'px, 0)';
      var s = lerp(flight.font, flight.slotFont, e) / flight.font;
      var dx = phone() ? (flight.slotLeft - flight.left) * e : (flight.slotRight - flight.right) * e;
      fig.style.transformOrigin = phone() ? 'left top' : 'right top';
      fig.style.transform = 'translate3d(' + dx.toFixed(1) + 'px, 0, 0) scale(' + s.toFixed(4) + ')';
    }
    band.style.setProperty('--travel', q.toFixed(3));
    // Tier two unfolds under the figure's path: early on a phone, where the
    // slot is in tier two; after the figure has passed, on a desktop.
    hd.style.setProperty('--hd-t2', reduce ? String(q) : (phone() ? clamp((q - 0.25) / 0.35) : clamp((q - 0.88) / 0.12)).toFixed(3));
    var parked = q >= 0.995;
    hd.setAttribute('data-state', parked ? 'page' : 'band');
    band.setAttribute('data-parked', String(parked));
    band.setAttribute('data-sc-verify-state', 'travel:' + q.toFixed(2));
    if (parked) band.setAttribute('data-sc-verify-hold', 'true'); else band.removeAttribute('data-sc-verify-hold');
    // The header's small figure yields to a band figure on screen.
    var peakFig = peakAct && peakAct.querySelector('.wf-fig');
    var near = false;
    if (peakFig) {
      var r = peakFig.getBoundingClientRect();
      near = r.bottom > hdH() && r.top < innerHeight;
    }
    if (near) hd.setAttribute('data-fig-hidden', ''); else hd.removeAttribute('data-fig-hidden');
  }

  /* ---- the phone crop: each section drawn once, cropped to the building on a phone ---- */
  function cropDrawings() {
    each('.dwg--crop svg[data-vb-phone]', function (svg) {
      svg.setAttribute('viewBox', svg.getAttribute(phone() ? 'data-vb-phone' : 'data-vb-desk'));
    });
  }

  /* ---- the ledger: the current row at display scale, its layer drawn ----
     The reading line sits below the header (on a phone, below the pinned
     section) at 0.42 of what is left. The last row whose top has crossed it
     is current: every row above it has drawn its layer, the current one is
     lit, everything below is undrawn. The framing row raises the frame story
     by story across its own height. When the current row changes, the row
     before it shrinks and the new one grows; the page scrolls by the
     difference so the new row and the pinned section stay where they are. */
  var ledger = (function () {
    var section = doc.getElementById('where-the-money-is');
    if (!section) return { read: function () {}, measure: function () {}, all: function () {}, scrollToRow: function () {} };
    var aside = section.querySelector('.sheet--dwg');
    var items = Array.prototype.slice.call(section.querySelectorAll('.lg-item'));
    var keys = items.map(function (i) { return i.getAttribute('data-layer'); });
    var framingAt = keys.indexOf('line:8');
    var dwg = section.querySelector('[data-dwg="ledger"] svg');
    var cap = doc.querySelector('[data-cap-story]');
    var stories = dwg ? parseInt(dwg.getAttribute('data-stories'), 10) || 1 : 1;
    var floorTops = dwg ? (dwg.getAttribute('data-floor-tops') || '').split(' ').map(parseFloat) : [];
    var floorT = dwg ? parseFloat(dwg.getAttribute('data-floor-t')) || 10 : 10;
    var grade = dwg ? parseFloat(dwg.getAttribute('data-grade')) || 430 : 430;
    var layers = dwg ? Array.prototype.slice.call(dwg.querySelectorAll('[data-layer]')) : [];
    var notes = dwg ? Array.prototype.slice.call(dwg.querySelectorAll('[data-note]')) : [];
    var storyEls = dwg ? Array.prototype.slice.call(dwg.querySelectorAll('[data-story]')) : [];
    var roofEls = dwg ? Array.prototype.slice.call(dwg.querySelectorAll('[data-roof]')) : [];
    var bracket = dwg && dwg.querySelector('[data-bracket]');
    var bracketLine = dwg && dwg.querySelector('[data-bracket-line]');
    var bracketCap = dwg && dwg.querySelector('[data-bracket-cap]');
    var current = -2, drawnStories = -1;
    if (dwg) dwg.parentNode.classList.add('dwg--live');

    function topOfRows() {
      var top = hdH();
      if (phone() && aside) top = Math.max(top, aside.getBoundingClientRect().bottom);
      return top;
    }
    function readingLine() {
      var top = topOfRows();
      return top + (innerHeight - top) * 0.42;
    }
    function bracketTo(n) {
      if (!bracket || !floorTops.length) return;
      var top = n >= stories ? floorTops[stories] : floorTops[n] + floorT;
      var label = n >= stories ? stories + ' Stories Above Grade' : 'Story ' + n + ' of ' + stories;
      if (bracket.textContent !== label) bracket.textContent = label;
      var ty = (grade + top) / 2, tx = parseFloat(bracket.getAttribute('x'));
      bracket.setAttribute('y', ty.toFixed(2));
      bracket.setAttribute('transform', 'rotate(-90 ' + tx + ' ' + ty.toFixed(2) + ')');
      if (bracketLine) bracketLine.setAttribute('y2', top.toFixed(2));
      if (bracketCap) { bracketCap.setAttribute('y1', top.toFixed(2)); bracketCap.setAttribute('y2', top.toFixed(2)); }
      if (cap) cap.textContent = n > 0 && n < stories ? ' · Story ' + n + ' of ' + stories : '';
    }
    function apply(idx, nStories) {
      if (idx === current && nStories === drawnStories) return;
      if (idx !== current) {
        var before = idx >= 0 ? items[idx].getBoundingClientRect().top : null;
        items.forEach(function (it, i) { it.classList.toggle('lg-now', i === idx); });
        if (before !== null && !printing) {
          var after = items[idx].getBoundingClientRect().top;
          var d = after - before;
          if (Math.abs(d) > 0.5) scrollBy(0, d);
        }
        layers.forEach(function (g) {
          var i = keys.indexOf(g.getAttribute('data-layer'));
          g.classList.toggle('is-drawn', i > -1 && i <= idx);
          g.classList.toggle('is-now', i === idx);
        });
        notes.forEach(function (n) {
          var i = keys.indexOf(n.getAttribute('data-note'));
          n.classList.toggle('is-drawn', i > -1 && i <= idx);
        });
      }
      if (nStories !== drawnStories) {
        storyEls.forEach(function (el) { el.classList.toggle('is-up', parseInt(el.getAttribute('data-story'), 10) <= nStories); });
        roofEls.forEach(function (el) { el.classList.toggle('is-up', nStories >= stories); });
        bracketTo(nStories);
      }
      if (idx !== current) relayoutSoon();
      current = idx; drawnStories = nStories;
      section.setAttribute('data-sc-verify-state', 'ledger:' + idx + ':' + nStories);
    }
    function read() {
      if (!items.length) return;
      var line = readingLine(), idx = -1, rowP = 0;
      for (var i = 0; i < items.length; i++) {
        var r = items[i].getBoundingClientRect();
        if (r.top <= line) { idx = i; rowP = clamp((line - r.top) / Math.max(r.height, 1)); } else break;
      }
      var nStories = framingAt < 0 || idx > framingAt ? stories : idx < framingAt ? 0 : Math.max(1, Math.ceil(rowP * stories));
      if (reduce && idx >= 0) nStories = stories;
      apply(idx, nStories);
    }
    function all() { apply(items.length - 1, stories); }
    // Scrolls the ledger so a row is current, keeping the pinned section where it is.
    function scrollToRow(item) {
      var r = item.getBoundingClientRect();
      var target = scrollY + r.top - readingLine() + 1;
      var s = section.getBoundingClientRect();
      var lo = scrollY + s.top - hdH() - 24, hi = scrollY + s.bottom - innerHeight;
      target = Math.max(lo, Math.min(hi, target));
      scrollTo({ top: target, behavior: reduce ? 'auto' : 'smooth' });
    }
    // A layer click opens its row and brings it to the reading line.
    if (dwg) dwg.addEventListener('click', function (e) {
      var g = e.target.closest('[data-layer]');
      if (!g) return;
      var item = items[keys.indexOf(g.getAttribute('data-layer'))];
      if (!item) return;
      setOpen(item, true);
      sc.layout();
      scrollToRow(item);
    });
    return { read: read, all: all, items: items, scrollToRow: scrollToRow };
  })();

  /* ---- the waterfall: the figure advances as each line joins, and lands in light ---- */
  var wf = (function () {
    var section = doc.getElementById('from-trades-to-total');
    if (!section) return { read: function () {}, all: function () {} };
    var stage = section.querySelector('[data-sc-stage]');
    var rows = Array.prototype.slice.call(section.querySelectorAll('.wf-row[data-running]'));
    var at = rows.map(function (r) { return parseFloat(r.getAttribute('data-cue-at')) || 0; });
    var figure = section.querySelector('[data-fig-running]');
    var label = section.querySelector('[data-fig-label]');
    var shown = -1;
    function apply(n) {
      if (n === shown) return;
      shown = n;
      var landed = n >= rows.length;
      figure.textContent = n <= 0 ? figure.getAttribute('data-trades') : landed ? figure.getAttribute('data-landed') : rows[n - 1].getAttribute('data-running');
      label.textContent = label.getAttribute(landed ? 'data-label-landed' : 'data-label-building');
      rows.forEach(function (r, i) {
        var dot = r.querySelector('.dot');
        if (dot) dot.className = 'dot ' + (i < n ? 'dot--in' : 'dot--next');
      });
      section.setAttribute('data-landed', String(landed));
      stage.setAttribute('data-sc-verify-state', 'wf:' + n + (landed ? ':light' : ''));
      if (landed) stage.setAttribute('data-sc-verify-hold', 'true'); else stage.removeAttribute('data-sc-verify-hold');
    }
    function read() {
      if (reduce || printing) { apply(rows.length); return; }
      var q = p(section), n = 0;
      // A line has arrived once the engine's cue has carried it in (0.18 of p from its cue).
      for (var i = 0; i < at.length; i++) if (q >= at[i] + 0.14) n = i + 1;
      apply(n);
    }
    return { read: read, all: function () { apply(rows.length); } };
  })();

  /* ---- the loop ---- */
  var ticking = false;
  function onScroll() {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () { ticking = false; driveHeader(); ledger.read(); wf.read(); spy(); });
  }
  function relayout() { cropDrawings(); sc.layout(); measureFlight(); driveHeader(); ledger.read(); wf.read(); spy(); }
  // The current row grows and shrinks as it changes, which moves every act
  // below it; the engine measures again once the row has settled.
  var relayoutTimer = 0;
  function relayoutSoon() {
    clearTimeout(relayoutTimer);
    relayoutTimer = setTimeout(function () { sc.layout(); sc.read(); driveHeader(); wf.read(); spy(); }, 120);
  }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', relayout, { passive: true });
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(relayout);

  /* ---- print: the engine at rest, every drill-down open, every layer drawn ---- */
  function rest() {
    each('.lg-item[data-open]', function (s) { setOpen(s, true); });
    each('[data-sc-act]', function (a) { a.style.setProperty('--sc-p', '1'); });
    each('.lg-now', function (s) { s.classList.remove('lg-now'); });
    ledger.all();
    wf.all();
    if (band) { band.setAttribute('data-parked', 'false'); band.removeAttribute('data-fly'); if (fig) fig.style.transform = 'none'; if (wrap) wrap.style.transform = 'none'; }
  }
  addEventListener('beforeprint', rest);
  window.KulkaBudget = { setTier: setTier, rest: rest, engine: sc, ledger: ledger, waterfall: wf };

  /* ---- start ---- */
  var start = printing ? 'detail' : tierFromHash();
  if (!start) { try { start = localStorage.getItem('kulka-budget-tier'); } catch (e) {} }
  setTier(TIERS.indexOf(start) >= 0 ? start : 'summary', false);
  relayout();
  if (printing) rest();
})();
