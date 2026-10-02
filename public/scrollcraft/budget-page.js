/* The page's own code (LA-1459, "The Ledger, Opened with the Section"). The
   engine (scrollcraft.js) is untouched: it pins the second black band,
   publishes each act's progress as --sc-p, and drives the waterfall's cues.
   Everything here is page-local: the tier switch, the drill-downs, the
   section index, the header's two states and the figure's flight into its
   slot, the ledger's lens and the layer it draws on the one section, that
   section's three states, the waterfall's figure advancing line by line and
   landing in light, and the print rest. */
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
  // A short window cannot hold the waterfall's lines in a pinned viewport.
  // There the band flows, the figure holds under the header, and the lines
  // arrive as they pass beneath it. A phone holds the whole band on one
  // screen, so it pins like a desktop and the landing is held in view.
  var peakAct = doc.getElementById('from-trades-to-total');
  if (peakAct && !printing && !reduce && !phone() && innerHeight < 700) {
    peakAct.setAttribute('data-sc-act', 'flow');
    peakAct.removeAttribute('data-sc-span');
    peakAct.classList.add('band--flow');
    var rowsAt = peakAct.querySelectorAll('.wf-row[data-cue-at]');
    Array.prototype.forEach.call(rowsAt, function (r, i) {
      var c = (0.2 + i * 0.055).toFixed(2);
      r.setAttribute('data-sc-cue', c);
      r.setAttribute('data-cue-at', c);
    });
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
     shows in the same box and the band's figure is hidden. */
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
      var top = lerp(flight.top, flight.slotTop, e);
      var natural = flight.top - scrollY;
      wrap.style.transform = 'translate3d(0, ' + (top - natural).toFixed(1) + 'px, 0)';
      var s = lerp(flight.font, flight.slotFont, e) / flight.font;
      var dx = phone() ? (flight.slotLeft - flight.left) * e : (flight.slotRight - flight.right) * e;
      fig.style.transformOrigin = phone() ? 'left top' : 'right top';
      fig.style.transform = 'translate3d(' + dx.toFixed(1) + 'px, 0, 0) scale(' + s.toFixed(4) + ')';
    }
    band.style.setProperty('--travel', q.toFixed(3));
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

  /* ---- the phone crop: the section drawn once, cropped to the building on a phone ---- */
  function cropDrawings() {
    each('.dwg--crop svg[data-vb-phone]', function (svg) {
      svg.setAttribute('viewBox', svg.getAttribute(phone() ? 'data-vb-phone' : 'data-vb-desk'));
    });
  }

  /* ---- the ledger: a lens the rows pass through, and the one section ----
     The rows keep their reading size and the list never changes length. A
     slot of display-scale height, the lens, holds still below the header
     (on a phone, below the pinned section) while the rows pass beneath it;
     whichever row has entered the lens's reading band is current, shown in
     the lens at display scale, and its layer is drawn and lit on the
     section. The framing row raises the frame story by story across its own
     passage. Opening a row opens its lines inside the lens.

     The section is one drawing for three sheets. Through The Ledger its
     layers draw in; at Proven every layer is drawn in its own ink and the
     ink note shows; at Design and Engineering the callouts show. */
  var ledger = (function () {
    var trio = doc.querySelector('[data-trio]');
    var section = doc.getElementById('where-the-money-is');
    var empty = { read: function () {}, all: function () {}, scrollToRow: function () {}, place: function () {} };
    if (!section || !trio) return empty;
    var aside = trio.querySelector('.sheet--dwg');
    var lens = section.querySelector('[data-lens]');
    var items = Array.prototype.slice.call(section.querySelectorAll('.lg-item'));
    var keys = items.map(function (i) { return i.getAttribute('data-layer'); });
    var framingAt = keys.indexOf('line:8');
    var proven = doc.getElementById('what-this-rests-on');
    var design = doc.getElementById('design-and-engineering');
    var dwg = trio.querySelector('[data-dwg="section"] svg');
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
    var ROW = 40;
    var current = -2, drawnStories = -1, state = '';
    // A row's tenure in the lens is its own height of scroll.
    function rowHeight() { return (items[0] && items[0].offsetHeight) || ROW; }
    if (dwg) dwg.parentNode.classList.add('dwg--live');

    // On a phone the drawing card is pinned under the header; the rows read below it.
    function topOfRows() {
      var top = hdH();
      if (phone() && aside) top += aside.offsetHeight + 12;
      return top;
    }
    // The reading line: 0.3 of what is left under the header on a desktop;
    // right under the pinned section on a phone.
    function readingLine() {
      var top = topOfRows();
      return phone() ? top : Math.round(top + (innerHeight - top) * 0.3);
    }
    function place() {
      section.style.setProperty('--lens-top', readingLine() + 'px');
    }
    function lensBand() {
      if (!lens) return null;
      var r = lens.getBoundingClientRect();
      // The reading band is the lens's top row-height: a row is current while
      // its own band passes there, hidden under the lens that shows it large.
      return { top: r.top, bottom: r.top + rowHeight() };
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
    // The lens shows the current row: its own markup, copied, with the ids left behind.
    function fill(idx) {
      if (!lens) return;
      var item = items[idx];
      var copy = item.cloneNode(true);
      Array.prototype.forEach.call(copy.querySelectorAll('[id],[data-el],[aria-controls],[data-layer]'), function (el) {
        el.removeAttribute('id'); el.removeAttribute('data-el'); el.removeAttribute('aria-controls'); el.removeAttribute('data-layer');
      });
      copy.removeAttribute('id'); copy.removeAttribute('data-el'); copy.removeAttribute('data-layer'); copy.removeAttribute('role');
      copy.className = 'lens-in';
      copy.setAttribute('data-open', item.getAttribute('data-open') || 'false');
      lens.innerHTML = '';
      lens.appendChild(copy);
      lens.setAttribute('data-open', item.getAttribute('data-open') || 'false');
      lens.setAttribute('data-row', keys[idx]);
      if (!reduce) {
        copy.classList.add('is-arriving');
        requestAnimationFrame(function () { requestAnimationFrame(function () { copy.classList.remove('is-arriving'); }); });
      }
    }
    function apply(idx, nStories) {
      if (idx === current && nStories === drawnStories) return;
      if (idx !== current) {
        items.forEach(function (it, i) { it.classList.toggle('is-cur', i === idx); });
        if (idx >= 0) fill(idx);
        layers.forEach(function (g) {
          var i = keys.indexOf(g.getAttribute('data-layer'));
          g.classList.toggle('is-drawn', i > -1 && i <= idx);
          g.classList.toggle('is-now', i === idx && state === 'ledger');
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
      current = idx; drawnStories = nStories;
      section.setAttribute('data-sc-verify-state', 'ledger:' + idx + ':' + nStories + ':' + state);
    }
    function setState(s) {
      if (s === state) return;
      state = s;
      trio.setAttribute('data-state', s);
      if (s !== 'ledger') layers.forEach(function (g) { g.classList.remove('is-now'); });
    }
    function read() {
      if (!items.length) return;
      var line = readingLine();
      // Which sheet is at the reading line sets the section's state.
      var s = 'ledger';
      if (design && design.getBoundingClientRect().top <= line) s = 'design';
      else if (proven && proven.getBoundingClientRect().top <= line) s = 'proven';
      setState(s);
      if (s !== 'ledger') { apply(items.length - 1, stories); return; }
      var band = lensBand();
      var idx = 0, rowP = 0;
      if (band) {
        for (var i = 0; i < items.length; i++) {
          var r = items[i].getBoundingClientRect();
          if (r.top < band.bottom) { idx = i; rowP = clamp((band.bottom - r.top) / rowHeight()); } else break;
        }
      }
      var nStories = framingAt < 0 || idx > framingAt ? stories : idx < framingAt ? 0 : Math.max(1, Math.ceil(rowP * stories));
      if (reduce) nStories = stories;
      apply(idx, nStories);
    }
    function all() { setState('design'); apply(items.length - 1, stories); }
    // Scrolls so a row has just entered the lens, keeping the pinned section where it is.
    function scrollToRow(item, rowP) {
      var band = lensBand();
      if (!band) return;
      var r = item.getBoundingClientRect();
      var target = scrollY + r.top - band.bottom + rowHeight() * (rowP || 0.1) + 1;
      var t = trio.getBoundingClientRect();
      var lo = scrollY + t.top - hdH() - 24, hi = scrollY + t.bottom - innerHeight;
      target = Math.max(lo, Math.min(hi, target));
      scrollTo({ top: target, behavior: reduce ? 'auto' : 'smooth' });
    }
    // Open or close a row: in the list and in the lens, which shows the lines.
    function toggle(item, open) {
      setOpen(item, open);
      if (lens && lens.getAttribute('data-row') === item.getAttribute('data-layer')) {
        lens.setAttribute('data-open', String(open));
        var inner = lens.querySelector('.lens-in');
        if (inner) { inner.setAttribute('data-open', String(open)); var b = inner.querySelector('.lg-btn'); if (b) b.setAttribute('aria-expanded', String(open)); }
      }
      sc.layout();
    }
    each('.lg-item .lg-btn[aria-expanded]', function (btn) {
      btn.addEventListener('click', function () {
        var item = btn.closest('.lg-item');
        toggle(item, item.getAttribute('data-open') !== 'true');
      });
    }, section);
    if (lens) lens.addEventListener('click', function (e) {
      if (!e.target.closest('.lg-btn')) return;
      var item = items[keys.indexOf(lens.getAttribute('data-row'))];
      if (item) toggle(item, item.getAttribute('data-open') !== 'true');
    });
    // A layer click opens its row and brings it into the lens.
    if (dwg) dwg.addEventListener('click', function (e) {
      var g = e.target.closest('[data-layer]');
      if (!g) return;
      var item = items[keys.indexOf(g.getAttribute('data-layer'))];
      if (!item) return;
      if (state !== 'ledger') setState('ledger');
      setOpen(item, true);
      scrollToRow(item, 0.1);
      setTimeout(function () { read(); toggle(item, true); }, reduce ? 50 : 450);
    });
    return { read: read, all: all, items: items, scrollToRow: scrollToRow, place: place };
  })();

  /* ---- the waterfall: the figure advances as each line joins, and lands in light ----
     The landing is choreographed, not cross-faded: the lines leave, the
     ground lifts from Kulka black to a grey that still carries white ink at
     4.5:1, the ink flips to Kulka black in one step on a ground that carries
     it at 4.5:1, the ground lifts the rest of the way to Daylight, and the
     lines return in ink. The figure grows by transform, with an ease. */
  var wf = (function () {
    var section = doc.getElementById('from-trades-to-total');
    if (!section) return { read: function () {}, all: function () {} };
    var stage = section.querySelector('[data-sc-stage]');
    var rows = Array.prototype.slice.call(section.querySelectorAll('.wf-row[data-running]'));
    var at = rows.map(function (r) { return parseFloat(r.getAttribute('data-cue-at')) || 0; });
    var figure = section.querySelector('[data-fig-running]');
    var label = section.querySelector('[data-fig-label]');
    var inner = section.querySelector('.wf-in');
    var movers = ['.wf-fig', '.wf', '.dwg-swap', '.wf-h'].map(function (s) { return section.querySelector(s); }).filter(Boolean);
    var shown = -1, landed = false, timers = [];
    function clearTimers() { timers.forEach(clearTimeout); timers = []; }
    function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
    // FLIP: the figure, the lines and the section move to their landed places by transform.
    function flip(change) {
      var before = movers.map(function (m) { return m.getBoundingClientRect(); });
      change();
      if (reduce) return;
      movers.forEach(function (m, i) {
        var a = before[i], b = m.getBoundingClientRect();
        var sx = a.width / Math.max(b.width, 1), sy = a.height / Math.max(b.height, 1);
        m.style.transition = 'none';
        m.style.transformOrigin = 'left top';
        m.style.transform = 'translate(' + (a.left - b.left).toFixed(1) + 'px, ' + (a.top - b.top).toFixed(1) + 'px) scale(' + sx.toFixed(4) + ', ' + sy.toFixed(4) + ')';
      });
      void inner.offsetWidth;
      movers.forEach(function (m) {
        m.style.transition = 'transform 600ms cubic-bezier(0.2, 0, 0.2, 1)';
        m.style.transform = 'none';
      });
      later(function () { movers.forEach(function (m) { m.style.transition = ''; m.style.transform = ''; m.style.transformOrigin = ''; }); }, 650);
    }
    function land(on) {
      if (on === landed) return;
      landed = on;
      clearTimers();
      if (reduce || printing) {
        section.setAttribute('data-landing', on ? 'lit' : 'none');
        section.setAttribute('data-landed', String(on));
        return;
      }
      if (on) {
        // 1. The lines leave and the ground lifts to the last grey that carries white ink.
        section.setAttribute('data-landing', 'lift');
        flip(function () { section.setAttribute('data-landed', 'true'); });
        // 2. The ink flips in one step on a ground that carries it, and the ground lifts to Daylight.
        later(function () { section.setAttribute('data-landing', 'ink'); }, 330);
        // 3. The lines return in ink, on the finished ground.
        later(function () { section.setAttribute('data-landing', 'lit'); }, 720);
      } else {
        section.setAttribute('data-landing', 'ink');
        flip(function () { section.setAttribute('data-landed', 'false'); });
        later(function () { section.setAttribute('data-landing', 'lift'); }, 330);
        later(function () { section.setAttribute('data-landing', 'none'); }, 620);
      }
    }
    function apply(n) {
      if (n === shown) return;
      shown = n;
      var isLanded = n >= rows.length;
      figure.textContent = n <= 0 ? figure.getAttribute('data-trades') : isLanded ? figure.getAttribute('data-landed') : rows[n - 1].getAttribute('data-running');
      label.textContent = label.getAttribute(isLanded ? 'data-label-landed' : 'data-label-building');
      rows.forEach(function (r, i) {
        var dot = r.querySelector('.dot');
        if (dot) dot.className = 'dot ' + (i < n ? 'dot--in' : 'dot--next');
      });
      land(isLanded);
      stage.setAttribute('data-sc-verify-state', 'wf:' + n + (isLanded ? ':light' : ''));
      if (isLanded) stage.setAttribute('data-sc-verify-hold', 'true'); else stage.removeAttribute('data-sc-verify-hold');
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
  function relayout() { cropDrawings(); ledger.place(); sc.layout(); measureFlight(); driveHeader(); ledger.read(); wf.read(); spy(); }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', relayout, { passive: true });
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(relayout);

  /* ---- print: the engine at rest, every drill-down open, every layer drawn ---- */
  function rest() {
    each('.lg-item[data-open]', function (s) { setOpen(s, true); });
    each('[data-sc-act]', function (a) { a.style.setProperty('--sc-p', '1'); });
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
