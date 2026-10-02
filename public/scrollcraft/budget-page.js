/* The page's own code (LA-1459, "The Ledger, Opened with the Section"). The
   engine (scrollcraft.js) is untouched: it pins the second black band,
   publishes each act's progress as --sc-p, and drives the waterfall's cues.
   Everything here is page-local: the tier switch, the drill-downs, the
   section index, the header's two states and the figure's flight into its
   slot, the ledger's lens band and the layer it draws on the one section,
   that section's three states and its hit areas, the waterfall's figure
   advancing line by line and landing in light, and the print rest. */
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

  /* ---- the header's two states, and the figure's flight into its slot ---- */
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
    var peakFig = peakAct && peakAct.querySelector('.wf-fig');
    var near = false;
    if (peakFig) {
      var r = peakFig.getBoundingClientRect();
      // Well on screen: its top inside the upper three fifths, so a short
      // in-page scroll that brings the band's edge into view leaves the
      // header figure where it is.
      near = r.bottom > hdH() && r.top < innerHeight * 0.6;
    }
    if (near) hd.setAttribute('data-fig-hidden', ''); else hd.removeAttribute('data-fig-hidden');
  }

  /* ---- the phone crop: the section drawn once, cropped to the building on a phone ---- */
  function cropDrawings() {
    each('.dwg--crop svg[data-vb-phone]', function (svg) {
      svg.setAttribute('viewBox', svg.getAttribute(phone() ? 'data-vb-phone' : 'data-vb-desk'));
    });
  }

  /* ---- the ledger: a reserved band for the lens, and the one section ----
     The rows keep their reading size and the list never changes length. The
     lens is a band of display-scale height at the top of the list: it holds
     under the header (on a phone, under the pinned section) once the list
     reaches it, and the rows begin below it. The row directly under the
     band's bottom edge is current: marked in the list with the accent at
     reading size, shown in the lens at display scale. Opening a row opens
     its lines in the list, under the band. The framing row raises the frame
     story by story across its own passage.

     The section is one drawing for three sheets. Through The Ledger its
     layers draw in; at Proven every layer settles to its own ink and the ink
     note shows; at Design and Engineering the callouts show, and each lights
     as its criterion passes in the list. Every layer and callout is a hit
     area: a layer click brings its row into the band and opens it, a callout
     click brings its criterion to the reading line. */
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
    var crits = design ? Array.prototype.slice.call(design.querySelectorAll('.crit--keyed [data-crit]')) : [];
    var dwg = trio.querySelector('[data-dwg="section"] svg');
    var stories = dwg ? parseInt(dwg.getAttribute('data-stories'), 10) || 1 : 1;
    var floorTops = dwg ? (dwg.getAttribute('data-floor-tops') || '').split(' ').map(parseFloat) : [];
    var floorT = dwg ? parseFloat(dwg.getAttribute('data-floor-t')) || 10 : 10;
    var grade = dwg ? parseFloat(dwg.getAttribute('data-grade')) || 430 : 430;
    var layers = dwg ? Array.prototype.slice.call(dwg.querySelectorAll('[data-layer]')) : [];
    var callouts = dwg ? Array.prototype.slice.call(dwg.querySelectorAll('[data-callout]')) : [];
    var notes = dwg ? Array.prototype.slice.call(dwg.querySelectorAll('[data-note]')) : [];
    var storyEls = dwg ? Array.prototype.slice.call(dwg.querySelectorAll('[data-story]')) : [];
    var roofEls = dwg ? Array.prototype.slice.call(dwg.querySelectorAll('[data-roof]')) : [];
    var bracket = dwg && dwg.querySelector('[data-bracket]');
    var bracketLine = dwg && dwg.querySelector('[data-bracket-line]');
    var bracketCap = dwg && dwg.querySelector('[data-bracket-cap]');
    var current = -2, drawnStories = -1, state = '', crit = '', lensIdx = -1;
    if (dwg) dwg.parentNode.classList.add('dwg--live');

    // Hit areas: an invisible wide stroke beside every stroke in a layer, and
    // a box behind every callout, so the pointer finds them.
    function hitAreas() {
      if (!dwg || printing) return;
      var ns = 'http://www.w3.org/2000/svg';
      layers.forEach(function (g) {
        Array.prototype.forEach.call(g.querySelectorAll('.s'), function (el) {
          var h = el.cloneNode(false);
          h.setAttribute('class', 'hit');
          h.removeAttribute('stroke'); h.removeAttribute('fill'); h.removeAttribute('stroke-dasharray');
          g.appendChild(h);
        });
      });
      callouts.forEach(function (g) {
        var b = g.getBBox();
        var r = doc.createElementNS(ns, 'rect');
        r.setAttribute('class', 'hit hit--box');
        r.setAttribute('x', b.x - 4); r.setAttribute('y', b.y - 4); r.setAttribute('width', b.width + 8); r.setAttribute('height', b.height + 8);
        g.appendChild(r);
      });
    }

    // The pointer picks the stroke nearest to it among the hit areas under
    // it, whatever the paint order, so a layer under another's strokes
    // (masonry under the steel, plumbing under the risers) is still reached.
    function segDist(px, py, x1, y1, x2, y2) {
      var dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
      var t = l2 ? clamp(((px - x1) * dx + (py - y1) * dy) / l2) : 0;
      return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }
    function hitDist(el, cx, cy) {
      var m = el.getScreenCTM();
      if (!m) return Infinity;
      var pt = dwg.createSVGPoint(); pt.x = cx; pt.y = cy;
      var p = pt.matrixTransform(m.inverse());
      var k = Math.hypot(m.a, m.b) || 1;
      var tag = el.tagName.toLowerCase(), a = function (n) { return parseFloat(el.getAttribute(n)) || 0; };
      var d = Infinity;
      if (tag === 'line') d = segDist(p.x, p.y, a('x1'), a('y1'), a('x2'), a('y2'));
      else if (tag === 'rect') {
        var x = a('x'), y = a('y'), w = a('width'), h = a('height');
        if (el.classList.contains('hit--box')) d = p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h ? 0 : Infinity;
        else d = Math.min(segDist(p.x, p.y, x, y, x + w, y), segDist(p.x, p.y, x + w, y, x + w, y + h), segDist(p.x, p.y, x, y + h, x + w, y + h), segDist(p.x, p.y, x, y, x, y + h));
      } else if (tag === 'circle') d = Math.abs(Math.hypot(p.x - a('cx'), p.y - a('cy')) - a('r'));
      else if (el.getTotalLength) {
        var L = el.getTotalLength(), n = Math.max(8, Math.min(64, Math.round(L / 6)));
        for (var i = 0; i <= n; i++) { var q = el.getPointAtLength((L * i) / n); d = Math.min(d, Math.hypot(p.x - q.x, p.y - q.y)); }
      }
      return d * k;
    }
    function pick(cx, cy) {
      if (!dwg || !doc.elementsFromPoint) return null;
      var under = doc.elementsFromPoint(cx, cy), best = null, bestD = Infinity;
      for (var i = 0; i < under.length; i++) {
        var el = under[i];
        if (!el.classList || !el.classList.contains('hit') || !dwg.contains(el)) continue;
        // A layer not yet drawn is invisible, and an invisible stroke takes
        // no click; the callouts show only at Design and Engineering.
        var owner = el.closest('[data-layer]');
        if (owner && !owner.classList.contains('is-drawn')) continue;
        if (!owner && el.closest('[data-callout]') && state !== 'design') continue;
        var d = hitDist(el, cx, cy);
        if (d < bestD - 0.5) { bestD = d; best = el; }
      }
      return best;
    }
    function rowHeight() { return (items[0] && items[0].offsetHeight) || 40; }
    function topOfRows() {
      var top = hdH();
      if (phone() && aside) top += aside.offsetHeight + 12;
      return top;
    }
    // Where the lens band holds: against the header's bottom (on a phone,
    // against the pinned section's bottom), with the gap to the rows as its
    // own opaque ground, so nothing shows above it.
    function lensTop() { return hdH() + (phone() && aside ? aside.offsetHeight : 0); }
    function place() {
      section.style.setProperty('--lens-top', lensTop() + 'px');
      section.style.setProperty('--lens-pad', (phone() ? 12 : 24) + 'px');
    }
    // The reading line for the sheets' states and the criteria: a third of the way down what is left.
    function readingLine() { var top = topOfRows(); return top + (innerHeight - top) * 0.3; }
    function lensBottom() {
      if (!lens) return topOfRows();
      var r = lens.getBoundingClientRect();
      return r.bottom;
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
    }
    // The lens shows the current row: its own markup, copied, with the ids left behind. 160ms cross-fade.
    function fill(idx) {
      if (!lens) return;
      var item = items[idx];
      var copy = item.cloneNode(true);
      Array.prototype.forEach.call(copy.querySelectorAll('[id],[data-el],[aria-controls],[data-layer]'), function (el) {
        el.removeAttribute('id'); el.removeAttribute('data-el'); el.removeAttribute('aria-controls'); el.removeAttribute('data-layer');
      });
      copy.removeAttribute('id'); copy.removeAttribute('data-el'); copy.removeAttribute('data-layer'); copy.removeAttribute('role');
      copy.className = 'lens-in';
      var lines = copy.querySelector('.lg-lines');
      if (lines) lines.parentNode.removeChild(lines);
      copy.setAttribute('data-open', item.getAttribute('data-open') || 'false');
      var olds = Array.prototype.slice.call(lens.querySelectorAll('.lens-in'));
      lens.appendChild(copy);
      lens.setAttribute('data-row', keys[idx]);
      lens.setAttribute('data-open', item.getAttribute('data-open') || 'false');
      if (!olds.length) return;
      if (reduce) { olds.forEach(function (o) { o.parentNode.removeChild(o); }); return; }
      // The old content stays painted beneath until the new has faded in
      // over it (160ms); no frame callback is waited on, so a throttled tab
      // never shows the band empty.
      copy.classList.add('is-arriving');
      void copy.offsetWidth;
      copy.classList.remove('is-arriving');
      setTimeout(function () { olds.forEach(function (o) { if (o.parentNode) o.parentNode.removeChild(o); }); }, 200);
    }
    function apply(idx, nStories) {
      if (idx === current && nStories === drawnStories) return;
      if (idx !== current) {
        items.forEach(function (it, i) { it.classList.toggle('is-cur', i === idx); });
        if (idx >= 0 && (idx !== lensIdx || !lens || !lens.querySelector('.lens-in'))) { fill(idx); lensIdx = idx; }
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
      section.setAttribute('data-sc-verify-state', 'ledger:' + idx + ':' + nStories + ':' + state + (crit ? ':' + crit : ''));
    }
    function setState(s) {
      if (s === state) return;
      state = s;
      trio.setAttribute('data-state', s);
      if (s !== 'ledger') layers.forEach(function (g) { g.classList.remove('is-now'); });
      if (s !== 'design') { pinnedCrit = ''; lightCrit(''); }
    }
    // A criterion and its callout light together, on hover or on a click;
    // nothing lights by scroll.
    function lightCrit(code) {
      if (code === crit) return;
      crit = code;
      crits.forEach(function (li) { li.classList.toggle('is-now', li.getAttribute('data-crit') === code); });
      callouts.forEach(function (g) { g.classList.toggle('is-now', g.getAttribute('data-callout') === code); });
    }
    function read() {
      if (!items.length) return;
      var line = readingLine();
      var s = 'ledger';
      if (design && design.getBoundingClientRect().top <= line) s = 'design';
      else if (proven && proven.getBoundingClientRect().top <= line) s = 'proven';
      setState(s);
      if (s !== 'ledger') {
        apply(items.length - 1, stories);
        return;
      }
      // The current row is the first one at or below the band's bottom edge:
      // a row goes under the band only after its turn. Its progress runs from
      // the moment the row before it goes under to the moment it does.
      var bottom = lensBottom(), idx = items.length - 1, rowP = 1, rh = rowHeight();
      for (var i = 0; i < items.length; i++) {
        var r = items[i].getBoundingClientRect();
        if (r.top >= bottom - 2) { idx = i; rowP = clamp((bottom + rh - r.top) / rh); break; }
      }
      var nStories = framingAt < 0 || idx > framingAt ? stories : idx < framingAt ? 0 : Math.max(1, Math.ceil(rowP * stories));
      if (reduce) nStories = stories;
      apply(idx, nStories);
    }
    function all() { setState('design'); apply(items.length - 1, stories); }
    // Scrolls so a row sits under the band's bottom edge, keeping the pinned section where it is.
    function scrollToRow(item, rowP) {
      var r = item.getBoundingClientRect();
      var bottom = lensTop() + (lens ? lens.offsetHeight : 0);
      var target = scrollY + r.top - bottom + rowHeight() * (rowP || 0.5) - rowHeight();
      var t = trio.getBoundingClientRect();
      var lo = scrollY + t.top - hdH() - 24, hi = scrollY + t.bottom - innerHeight;
      target = Math.max(lo, Math.min(hi, target));
      scrollTo({ top: target, behavior: reduce ? 'auto' : 'smooth' });
    }
    function scrollToCrit(code) {
      var li = crits.filter(function (c) { return c.getAttribute('data-crit') === code; })[0];
      if (!li) return;
      var target = scrollY + li.getBoundingClientRect().top - readingLine();
      scrollTo({ top: target, behavior: reduce ? 'auto' : 'smooth' });
    }
    // Open or close a row, in the list and in the lens.
    function toggle(item, open) {
      setOpen(item, open);
      if (lens && lens.getAttribute('data-row') === item.getAttribute('data-layer')) {
        lens.setAttribute('data-open', String(open));
        each('.lens-in', function (inner) { inner.setAttribute('data-open', String(open)); var b = inner.querySelector('.lg-btn'); if (b) b.setAttribute('aria-expanded', String(open)); }, lens);
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
    var hovered = null;
    function hover(g) {
      if (g === hovered) return;
      if (hovered) hovered.classList.remove('is-hover');
      hovered = g;
      if (g) g.classList.add('is-hover');
      var code = g && g.hasAttribute('data-callout') ? g.getAttribute('data-callout') : '';
      if (code || !critHover) lightCrit(code || pinnedCrit);
    }
    // A clicked criterion stays lit after the pointer leaves it (the scroll
    // it starts moves the drawing under a still pointer) until another is
    // hovered or clicked, or the sheet is left.
    var critHover = false, pinnedCrit = '';
    if (dwg && !printing) {
      dwg.addEventListener('mousemove', function (e) {
        var hit = pick(e.clientX, e.clientY);
        hover(hit ? (hit.closest('[data-callout]') || hit.closest('[data-layer]')) : null);
      });
      dwg.addEventListener('mouseleave', function () { hover(null); });
    }
    crits.forEach(function (li) {
      li.addEventListener('mouseenter', function () { critHover = true; lightCrit(li.getAttribute('data-crit')); });
      li.addEventListener('mouseleave', function () { critHover = false; lightCrit(pinnedCrit); });
      li.addEventListener('click', function () { pinnedCrit = li.getAttribute('data-crit'); lightCrit(pinnedCrit); });
    });
    if (dwg) dwg.addEventListener('click', function (e) {
      var hit = pick(e.clientX, e.clientY) || e.target;
      var c = hit.closest('[data-callout]');
      if (c) { pinnedCrit = c.getAttribute('data-callout'); scrollToCrit(pinnedCrit); lightCrit(pinnedCrit); return; }
      var g = hit.closest('[data-layer]');
      if (!g) return;
      var item = items[keys.indexOf(g.getAttribute('data-layer'))];
      if (!item) return;
      setOpen(item, true);
      scrollToRow(item, 0.5);
      setTimeout(function () { read(); toggle(item, true); }, reduce ? 50 : 450);
    });
    hitAreas();
    return { read: read, all: all, items: items, scrollToRow: scrollToRow, scrollToCrit: scrollToCrit, place: place };
  })();

  /* ---- the waterfall: the figure advances as each line joins, and lands in light ----
     The landing is a sequence of keyframe animations keyed off data-landed,
     so it keeps time even in a throttled tab: the lines leave; the section
     recedes to its landed place; the figure rises by transform to the
     opening's size, never smaller than it was; the ground lifts to the last
     grey that carries white ink, the ink flips to Kulka black in one step
     on a grey that carries it, and the ground lifts to Daylight; the lines
     return in ink. Each mover's path is measured (FLIP) and handed to the
     keyframes as custom properties. */
  var wf = (function () {
    var section = doc.getElementById('from-trades-to-total');
    if (!section) return { read: function () {}, all: function () {} };
    var stage = section.querySelector('[data-sc-stage]');
    var rows = Array.prototype.slice.call(section.querySelectorAll('.wf-row[data-running]'));
    var at = rows.map(function (r) { return parseFloat(r.getAttribute('data-cue-at')) || 0; });
    var figure = section.querySelector('[data-fig-running]');
    var label = section.querySelector('[data-fig-label]');
    var movers = ['[data-fig-running]', '.dwg-swap'].map(function (s) { return section.querySelector(s); }).filter(Boolean);
    var shown = -1, landed = false;
    function flipVars(change) {
      var before = movers.map(function (m) { return m.getBoundingClientRect(); });
      change();
      movers.forEach(function (m, i) {
        var a = before[i], b = m.getBoundingClientRect();
        m.style.setProperty('--fx', (a.left - b.left).toFixed(1) + 'px');
        m.style.setProperty('--fy', (a.top - b.top).toFixed(1) + 'px');
        m.style.setProperty('--fsx', (a.width / Math.max(b.width, 1)).toFixed(4));
        m.style.setProperty('--fsy', (a.height / Math.max(b.height, 1)).toFixed(4));
      });
    }
    // The landed sheet is sized to what is left of the viewport under the
    // figure block, so its title block and key plan sit above the fold.
    function sizeSheet(on) {
      var figBlock = section.querySelector('.wf-fig');
      if (!on || phone() || !figBlock) { section.classList.remove('is-sized'); section.style.removeProperty('--dwg-h'); return; }
      // In the flowing band the figure block holds under the header, so its
      // stuck position is what the sheet sits beneath, wherever the band is
      // when the landing fires.
      var flow = section.classList.contains('band--flow');
      var bottom = flow ? hdH() + figBlock.offsetHeight + 16 : figBlock.getBoundingClientRect().bottom;
      var h = innerHeight - bottom - 40;
      section.style.setProperty('--dwg-h', Math.max(140, Math.round(h)) + 'px');
      // In the flowing band the sheet holds under the figure block as the
      // lines pass beneath, so it is never covered by it.
      section.style.setProperty('--dwg-top', Math.round(bottom) + 'px');
      section.classList.add('is-sized');
    }
    function land(on) {
      if (on === landed) return;
      landed = on;
      if (reduce || printing) { section.setAttribute('data-landed', on ? 'still' : 'none'); sizeSheet(on); return; }
      // Lay out the destination without animating, measure each mover's path, then play.
      flipVars(function () { section.setAttribute('data-landed', on ? 'measure' : 'measure-dark'); sizeSheet(on); });
      void section.offsetWidth;
      section.setAttribute('data-landed', on ? 'true' : 'false');
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
      for (var i = 0; i < at.length; i++) if (q >= at[i] + 0.14) n = i + 1;
      apply(n);
    }
    return { read: read, all: function () { apply(rows.length); } };
  })();

  /* ---- nav jumps: the destination rendered at once, no replay ---- */
  function jumpTo(id) {
    var el = doc.getElementById(id);
    if (!el) return false;
    root.classList.add('is-jump');
    var top = el.getBoundingClientRect().top + scrollY - (parseFloat(getComputedStyle(el).scrollMarginTop) || 0);
    // 'instant', not 'auto': the stylesheet's smooth scroll-behavior would
    // otherwise glide the jump and replay every state on the way.
    scrollTo({ top: top, behavior: 'instant' });
    driveHeader(); ledger.read(); wf.read(); spy();
    if (sc.read) sc.read();
    try { history.pushState(null, '', '#' + id); } catch (e) {}
    setTimeout(function () { root.classList.remove('is-jump'); }, 80);
    return true;
  }
  each('#bar a[data-index]', function (a) {
    a.addEventListener('click', function (e) {
      if (printing || reduce) return;
      if (jumpTo(a.getAttribute('data-index'))) e.preventDefault();
    });
  });

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
