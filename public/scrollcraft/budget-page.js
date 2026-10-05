/* The page's own code (LA-1459; the opening and the Schedule of Values,
   LA-1558). The engine (scrollcraft.js) is untouched: it pins the second
   black band, publishes each act's progress as --sc-p, and drives the
   waterfall's cues. Everything here is page-local: the opening and its
   hand-offs into the header, the section index, the Schedule of Values'
   drop-downs and the section they lift, Design and Engineering's rows
   opening in place, the waterfall's figure advancing
   line by line and landing in light, and the print rest. The server writes
   every figure and word; this file only moves and shows them. */
(function () {
  'use strict';
  var doc = document, root = doc.documentElement;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var phoneMQ = matchMedia('(max-width: 860px)');
  var phone = function () { return phoneMQ.matches; };
  var printing = root.hasAttribute('data-print');
  var clamp = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  var ease3 = function (t) { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
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

  var slice = function (list) { return Array.prototype.slice.call(list); };
  var cssEsc = window.CSS && CSS.escape ? CSS.escape : function (x) { return x; };

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

  /* ---- the opening (LA-1558) ----
     One stage pinned over the band, driven by how far the reader has scrolled
     into it, in screens. The approved frame's timings: from 0 to 0.7 the
     wordmark travels into the header's mark as the project rises in; from 1.6
     to 2.3 the project's name travels into the header as the numbers rise in;
     from 3.1 to 3.6 each number travels into its own header slot (LA-1575),
     just before the white sheet slides up over the black from 3.3. Each
     traveller lands on its slot, and the header's own copy takes over on
     arrival. */
  var hd = doc.getElementById('bar');
  var opening = (function () {
    var band = doc.getElementById('your-number');
    var stage = band && band.querySelector('[data-op-stage]');
    var still = { frame: function () {}, measure: function () {} };
    if (!band || !stage || !hd || printing) return still;
    var travel = stage.querySelector('[data-op-travel]');
    var markSlot = hd.querySelector('.hd-t1 .hd-mark');
    var slotLabels = slice(hd.querySelectorAll('.hd-t1 .hd-fig-l'));
    // Each traveller and the header slot it lands in share a key: proj, fig, dur, psf.
    var movers = slice(stage.querySelectorAll('[data-op-move]')).map(function (el) {
      var key = el.getAttribute('data-op-move');
      return { key: key, el: el, slot: hd.querySelector('.hd-t1 [data-hd-slot="' + key + '"]'), small: el.querySelector('small'), trip: null };
    }).filter(function (m) { return m.slot; });
    var proj = movers.filter(function (m) { return m.key === 'proj'; })[0];
    var flyers = movers.filter(function (m) { return m !== proj; });
    var project = slice(stage.querySelector('[data-op-layer="project"]').children);
    var three = stage.querySelector('[data-op-three]');
    var numbers = three ? slice(three.children) : [];
    var span = function (t, a, b) { return clamp((t - a) / (b - a)); };
    var step = function (t, a, b) { return reduce ? (t > a + 0.02 ? 1 : 0) : ease3(span(t, a, b)); };
    var INK = [244, 243, 238], INK2 = [189, 188, 179];
    var tone = function (k) { return 'rgb(' + INK.map(function (v, i) { return Math.round(v + (INK2[i] - v) * k); }).join(',') + ')'; };
    var wm = null;
    var fontPx = function (el) { return parseFloat(getComputedStyle(el).fontSize) || 14; };

    // The stage sits at the top of the viewport while the reader is in the band, so every path is measured in its frame.
    function measure() {
      travel.style.transform = 'none';
      project.concat(numbers).forEach(function (el) { el.style.transform = 'none'; });
      movers.forEach(function (m) { m.el.style.transform = 'none'; clip(m, 0); if (m.small) m.small.style.fontSize = m.small.style.marginLeft = ''; });
      var sr = stage.getBoundingClientRect();
      var r = markSlot.getBoundingClientRect();
      wm = {
        x0: -travel.offsetWidth / 2, y0: -travel.offsetHeight / 2,
        x1: r.left - sr.left - sr.width / 2, y1: r.top - sr.height / 2,
        s: fontPx(markSlot) / fontPx(travel.firstElementChild),
      };
      movers.forEach(function (m) {
        var a = m.el.getBoundingClientRect(), b = m.slot.getBoundingClientRect();
        var f0 = fontPx(m.el), f1 = fontPx(m.slot), slotSmall = m.slot.querySelector('small');
        m.trip = { dx: b.left - a.left, dy: b.top - (a.top - sr.top), s: f1 / f0, col: m.el.parentNode.getBoundingClientRect().left };
        // A slot too narrow for its text shows an ellipsis; the traveller narrows to the same cut on the way in.
        if (m.slot.scrollWidth > m.slot.clientWidth) {
          var text = doc.createRange();
          text.selectNodeContents(m.el);
          m.trip.cut = [text.getBoundingClientRect().width, m.slot.clientWidth / m.trip.s];
        }
        // The header sets the duration's unit larger than a uniform scale would, so its size and gap travel too, in the mover's own em.
        if (m.small && slotSmall) {
          m.trip.unit = [fontPx(m.small) / f0, fontPx(slotSmall) / f1];
          m.trip.gap = [parseFloat(getComputedStyle(m.small).marginLeft) / f0, parseFloat(getComputedStyle(slotSmall).marginLeft) / f1];
        }
      });
    }
    function rise(el, q, out) {
      out = out || 0;
      el.style.opacity = String(q * (1 - out));
      el.style.transform = 'translateY(' + ((1 - q) * 48 - out * 32).toFixed(1) + 'px)';
    }
    // Only in flight: the traveller is hidden once landed, and at rest or on paper the name reads whole.
    function clip(mover, m) {
      var on = mover.trip && mover.trip.cut && m > 0 && m <= 0.999, st = mover.el.style;
      st.maxWidth = on ? lerp(mover.trip.cut[0], mover.trip.cut[1], m).toFixed(2) + 'px' : '';
      st.overflow = on ? 'hidden' : '';
      st.textOverflow = on ? 'ellipsis' : '';
      st.whiteSpace = on ? 'nowrap' : '';
    }
    function unit(mover, m) {
      var trip = mover.trip;
      if (!trip.unit) return;
      mover.small.style.fontSize = m > 0 ? lerp(trip.unit[0], trip.unit[1], m).toFixed(4) + 'em' : '';
      mover.small.style.marginLeft = m > 0 ? (lerp(trip.gap[0], trip.gap[1], m) * fontPx(mover.el)).toFixed(2) + 'px' : '';
    }
    function fly(mover, m) {
      var trip = mover.trip;
      // A growing unit widens its column and moves the others in the row, so each traveller takes back its column's drift.
      var drift = mover.el.parentNode.getBoundingClientRect().left - trip.col;
      mover.el.style.transform = 'translate(' + (trip.dx * m - drift).toFixed(2) + 'px, ' + (trip.dy * m).toFixed(2) + 'px) scale(' + (1 + (trip.s - 1) * m).toFixed(4) + ')';
    }
    function frame() {
      if (!wm) return;
      var t = -band.getBoundingClientRect().top / (stage.offsetHeight || innerHeight);

      var m1 = step(t, 0, 0.7);
      travel.style.transform = 'translate(' + lerp(wm.x0, wm.x1, m1).toFixed(1) + 'px, ' + lerp(wm.y0, wm.y1, m1).toFixed(1) + 'px) scale(' + lerp(1, wm.s, m1).toFixed(4) + ')';
      travel.style.opacity = m1 > 0.999 ? '0' : '1';
      markSlot.style.opacity = m1 > 0.999 ? '1' : '0';

      var m2 = step(t, 1.6, 2.3), out2 = step(t, 1.6, 1.9);
      project.forEach(function (el, i) {
        var q = reduce ? (t > 0.02 ? 1 : 0) : ease3(span(t, 0.3 + i * 0.1, 0.75 + i * 0.1));
        if (proj && el === proj.el) {
          el.style.opacity = m2 > 0.999 ? '0' : String(q);
          el.style.color = tone(m2);
          clip(proj, m2);
          if (m2 > 0) fly(proj, m2); else el.style.transform = 'translateY(' + ((1 - q) * 48).toFixed(1) + 'px)';
        } else rise(el, q, out2);
      });
      if (proj) proj.slot.style.opacity = m2 > 0.999 ? '1' : '0';

      var m3 = step(t, 3.1, 3.6);
      numbers.forEach(function (el, i) { rise(el, step(t, 2.0 + i * 0.12, 2.45 + i * 0.12)); });
      flyers.forEach(function (f) { unit(f, m3); });
      flyers.forEach(function (f) {
        f.el.style.opacity = m3 > 0.999 ? '0' : '1';
        fly(f, m3);
        // Its label leaves with it, so no heading is left over an empty slot.
        f.el.previousElementSibling.style.opacity = String(1 - step(t, 3.1, 3.3));
      });
      flyers.forEach(function (f) { f.slot.style.opacity = m3 > 0.999 ? '1' : '0'; });
      // The header's labels come in as the opening's leave, so none appears all at once.
      slotLabels.forEach(function (l) { l.style.opacity = String(step(t, 3.3, 3.6)); });

      // The header turns black once the last traveller has landed, before the white sheet reaches it.
      var parked = m3 > 0.999;
      hd.setAttribute('data-state', parked ? 'page' : 'band');
      hd.style.setProperty('--hd-t2', (reduce ? (parked ? 1 : 0) : clamp((t - 3.6) / 0.5)).toFixed(3));
    }
    return { frame: frame, measure: measure };
  })();

  // The header's numbers step aside while the waterfall's own figure is well on screen.
  function peakNear() {
    if (!hd) return;
    var peakFig = peakAct && peakAct.querySelector('.wf-fig');
    var near = false;
    if (peakFig) {
      var r = peakFig.getBoundingClientRect();
      near = r.bottom > hdH() && r.top < innerHeight * 0.6;
    }
    if (near) hd.setAttribute('data-fig-hidden', ''); else hd.removeAttribute('data-fig-hidden');
  }

  /* ---- the phone crop: the drawings drawn once, cropped to the building on a phone ---- */
  function cropDrawings() {
    each('.dwg--crop svg[data-vb-phone]', function (svg) {
      svg.setAttribute('viewBox', svg.getAttribute(phone() ? 'data-vb-phone' : 'data-vb-desk'));
    });
  }

  /* ---- the Schedule of Values: drop-down B, Lift the Layer (LA-1558) ----
     Opening a line lifts its pieces off the section, leaving a dashed outline
     where each sat, and pins them with the numbers of the line's items. The
     line's card shows under the drawing. Pointing at an item previews it;
     choosing one turns the rest of the line grey, draws a lead from the
     table to its pin, and shows the item's card. On a phone the drawing is
     pinned above the list and each card opens under its own item.

     The state is one open line, one chosen item and one pointed-at item.
     Everything else is geometry: where the pins sit and where the lead runs. */
  var sov = (function () {
    var trio = doc.querySelector('[data-trio]');
    var section = doc.getElementById('where-the-money-is');
    var none = { read: function () {}, place: function () {}, rest: function () {} };
    if (!trio || !section) return none;
    var aside = trio.querySelector('.sheet--dwg');
    var frame = trio.querySelector('[data-dwg="section"]');
    var svg = frame && frame.querySelector('svg');
    var cardSlot = trio.querySelector('[data-card-slot]');
    var crumbEl = trio.querySelector('[data-crumb]');
    var design = doc.getElementById('design-and-engineering');
    var deList = design && design.querySelector('[data-de]');
    var rows = deList ? slice(deList.querySelectorAll('.de-row')) : [];

    // Each line as the server wrote it: its pieces in the drawing, its items, and their cards.
    var lines = slice(section.querySelectorAll('.sov-line[data-el]')).map(function (li) {
      var lv2 = li.querySelector('.lv2');
      var line = { li: li, layers: (li.getAttribute('data-layers') || '').split(' ').filter(Boolean), card: li.querySelector('[data-card="line"]'), lv2: lv2, items: [] };
      if (line.card) line.card._home = { into: lv2 };
      line.items = slice(li.querySelectorAll('.pin-row')).map(function (row) {
        var card = li.querySelector('[data-card="' + row.getAttribute('data-i') + '"]');
        if (card) card._home = { after: row };
        var name = row.querySelector('.name');
        return { row: row, label: name && name.firstChild ? name.firstChild.textContent : '', anchor: row.getAttribute('data-anchor') || null, card: card };
      });
      return line;
    });
    var lineOf = function (li) { return lines.filter(function (l) { return l.li === li; })[0] || null; };
    var open = null, pick = null, hover = null, drawFor = null, shown = null, state = 'sov';

    var pins = null, wire = null;
    if (frame && !printing) {
      pins = doc.createElement('div'); pins.className = 'pins'; frame.appendChild(pins);
      wire = doc.createElementNS('http://www.w3.org/2000/svg', 'svg'); wire.setAttribute('class', 'wire'); wire.setAttribute('aria-hidden', 'true'); doc.body.appendChild(wire);
    }

    // The camera: on a desktop the frame is taller than the drawing's own sheet, which gives tall pieces room to zoom.
    var vbOf = function (name) { var v = svg && svg.getAttribute(name); return v ? v.split(' ').map(Number) : null; };
    var BASE = vbOf('data-vb-desk') || vbOf('viewBox') || [0, 0, 1000, 640];
    var PHONE = vbOf('data-vb-phone');
    var TALL = [BASE[0], BASE[1] - 50, BASE[2], BASE[3] + 100];
    var home = function () { return phone() && PHONE ? PHONE : TALL; };
    var vb = home().slice(), cam = 0;
    function setVb(b) { vb = b; if (svg) svg.setAttribute('viewBox', b.join(' ')); }
    function zoomTo(target, ms, onFrame) {
      var from = vb.slice(), t0 = performance.now(), id = ++cam;
      if (reduce) { setVb(target.slice()); if (onFrame) onFrame(); return; }
      function tick(now) {
        if (id !== cam) return;
        var k = ease3((now - t0) / ms);
        setVb(from.map(function (v, i) { return v + (target[i] - v) * k; }));
        if (onFrame) onFrame();
        if (k < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }
    function q(sel, el) { return svg ? slice((el || svg).querySelectorAll(sel)) : []; }
    function layerEls(l) { return q('[data-layer="' + cssEsc(l) + '"]'); }
    function boxOf(layers) {
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      layers.forEach(function (l) {
        layerEls(l).forEach(function (g) {
          var b = g.getBBox();
          if (!b.width && !b.height) return;
          x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
        });
      });
      var H = home();
      if (!isFinite(x0)) return H;
      var ar = H[2] / H[3], pad = 22;
      var w = Math.max(x1 - x0 + pad * 2, H[2] * 0.34), h = Math.max(y1 - y0 + pad * 2, H[3] * 0.34);
      if (w / h > ar) h = w / ar; else w = h * ar;
      w = Math.min(w, H[2]); h = Math.min(h, H[3]);
      var x = Math.max(H[0], Math.min((x0 + x1) / 2 - w / 2, H[0] + H[2] - w));
      var y = Math.max(H[1], Math.min((y0 + y1) / 2 - h / 2, H[1] + H[3] - h));
      return [x, y, w, h];
    }

    // Light what is in focus and dim the rest. The criteria's callouts stay under their own rule, shown only at Design and Engineering or when lit.
    function focus(layers, callouts, dim) {
      if (!svg) return;
      var on = [];
      layers.forEach(function (l) { layerEls(l).forEach(function (g) { on.push(g); }); });
      (callouts || []).forEach(function (c) { q('[data-callout="' + cssEsc(c) + '"]').forEach(function (g) { on.push(g); }); });
      q('.is-on').forEach(function (g) { g.classList.remove('is-on'); });
      on.forEach(function (g) { g.classList.add('is-on'); });
      var faint = String(dim || 0.13);
      (function walk(el) {
        Array.prototype.forEach.call(el.children, function (c) {
          if (c.tagName.toLowerCase() === 'defs') return;
          if (on.length === 0 || on.indexOf(c) > -1) {
            c.style.opacity = ''; c.classList.remove('is-dim');
            q('.is-dim', c).forEach(function (x) { x.classList.remove('is-dim'); x.style.opacity = ''; });
            return;
          }
          var holds = c.getAttribute('data-part') === 'criteria' || on.some(function (g) { return c.contains(g); });
          if (holds) { c.style.opacity = ''; c.classList.remove('is-dim'); walk(c); }
          else { c.style.opacity = faint; c.classList.add('is-dim'); }
        });
      })(svg);
    }

    function crumb(parts) {
      if (!crumbEl) return;
      crumbEl.textContent = '';
      parts.forEach(function (p, i) {
        if (i > 0) { var sep = doc.createElement('i'); sep.textContent = '›'; crumbEl.appendChild(sep); }
        var el = doc.createElement(i === parts.length - 1 ? 'b' : 'span'); el.textContent = p; crumbEl.appendChild(el);
      });
    }
    function titleOf(line) {
      var h = line.li.querySelector('.sov-h');
      return ((h.querySelector('.sov-div').textContent + ' ' + h.querySelector('.sov-name').firstChild.textContent).trim());
    }

    // A pin sits on the drawn line nearest the middle of its piece. When the drawing labels a
    // piece by the item's own name (Elevator Bulkhead), it aims at the part nearest that label.
    function labelPoint(name) {
      var lower = name.toLowerCase();
      var t = q('text').filter(function (x) { return x.textContent.trim().toLowerCase() === lower; })[0];
      if (!t) return null;
      var b = t.getBBox();
      return [b.x + b.width / 2, b.y + b.height / 2];
    }
    // The piece's lines that can carry its pin, nearest the aim point first.
    function candidates(layer, name) {
      var g = layerEls(layer)[0];
      if (!g) return [];
      var gb = g.getBBox(), lp = name ? labelPoint(name) : null;
      var cx = lp ? lp[0] : gb.x + gb.width / 2, cy = lp ? lp[1] : gb.y + gb.height / 2;
      var box = function (k) { return k.getBBox(); };
      var kids = q('path, line, rect, polyline, polygon', g).filter(function (k) { var b = box(k); return b.width || b.height; });
      var len = function (k) { var b = box(k); return Math.max(b.width, b.height); };
      var cut = Math.max.apply(null, [0].concat(kids.map(len))) * 0.5;
      var dist = function (k) { var b = box(k); return Math.hypot(b.x + b.width / 2 - cx, b.y + b.height / 2 - cy); };
      // Among the piece's longer lines (its walls and slabs, not its ticks), the one nearest the aim point.
      var out = kids.filter(function (k) { return lp || len(k) >= cut; }).sort(function (a, b) { return dist(a) - dist(b); });
      return out.length ? out : [g];
    }
    function anchorEl(layer, name) { return candidates(layer, name)[0] || null; }
    function screenOf(el) {
      var b = el.getBBox(), m = el.getScreenCTM();
      return new DOMPoint(b.x + b.width / 2, b.y + b.height / 2).matrixTransform(m);
    }

    // Each pin takes the nearest of its piece's lines that keeps it 48px clear of the pins already placed.
    function placePins() {
      if (!open || !pins || !frame) return;
      var fr = frame.getBoundingClientRect(), placed = [];
      slice(pins.querySelectorAll('.pin')).forEach(function (p) {
        var item = open.items[+p.getAttribute('data-i')];
        var cs = candidates(item.anchor, item.label);
        if (!cs.length) return;
        var x = null, y = null;
        for (var k = 0; k < cs.length; k++) {
          var pt = screenOf(cs[k]), cx = pt.x - fr.left, cy = pt.y - fr.top;
          if (cx < 4 || cy < 4 || cx > fr.width - 4 || cy > fr.height - 4) continue;
          if (placed.every(function (a) { return Math.hypot(a[0] - cx, a[1] - cy) >= 48; })) { x = cx; y = cy; break; }
        }
        if (x === null) {
          var p0 = screenOf(cs[0]);
          x = p0.x - fr.left; y = p0.y - fr.top;
          while (placed.some(function (a) { return Math.hypot(a[0] - x, a[1] - y) < 32; })) y -= 34;
        }
        placed.push([x, y]);
        p.style.left = x + 'px'; p.style.top = y + 'px';
      });
      drawWire();
    }

    // The connector: solid across the gutter from the chosen (or pointed-at) item, then a fine
    // dashed lead with an arrowhead inside the drawing, so it never passes for part of the building.
    function drawWire() {
      if (!wire) return;
      wire.innerHTML = '';
      if (!open || phone()) return;
      var i = pick !== null ? pick : hover;
      if (i === null) return;
      var row = open.items[i] && open.items[i].row, pin = pins.querySelector('.pin[data-i="' + i + '"]');
      if (!row || !pin) return;
      var a = row.getBoundingClientRect(), b = pin.getBoundingClientRect();
      var x1 = a.right + 6, y1 = a.top + a.height / 2, x2 = b.left + b.width / 2 - 13, y2 = b.top + b.height / 2;
      if (y2 < hdH() || y2 > innerHeight || y1 < hdH() || y1 > innerHeight) return;
      var fr = frame.getBoundingClientRect(), fl = fr.left, g = (x1 + fl) / 2;
      var cx = x2 + 13, cy = y2;
      // Test the lead against the drawing first: runs rising in 8px steps, with the turn left of,
      // above or right of the pin; keep the one whose run and final drop cross the least.
      var drawnAt = function (x, y) { var el = doc.elementFromPoint(x, y); return el && el !== svg && svg.contains(el) && el.tagName.toLowerCase() !== 'rect' ? 1 : 0; };
      var along = function (ax, ay, bx2, by, stepPx) {
        var L = Math.hypot(bx2 - ax, by - ay), n = Math.max(1, Math.floor(L / stepPx)), h = 0;
        for (var k = 0; k <= n; k++) { var x = ax + ((bx2 - ax) * k) / n, y = ay + ((by - ay) * k) / n; h += drawnAt(x, y) + drawnAt(x, y - 2) + drawnAt(x, y + 2); }
        return h;
      };
      var best = { h: Infinity };
      for (var y = cy - 26; y > Math.max(fr.top + 10, cy - 280); y -= 8) {
        [-40, -24, 0, 24, 40].forEach(function (dx) {
          var bx = cx + dx, ang = Math.atan2(cy - y, cx - bx), ex = cx - Math.cos(ang) * 21, ey = cy - Math.sin(ang) * 21;
          // A long final drop reads as part of the drawing, so its length costs too.
          var h = along(fl + 4, y, bx, y, 4) * 2 + along(bx, y, ex, ey, 4) * 2 + Math.hypot(ex - bx, ey - y) / 22;
          if (h < best.h) best = { h: h, y: y, bx: bx, a: ang, ex: ex, ey: ey };
        });
        if (best.h < 1) break;
      }
      if (!isFinite(best.h)) return;
      var t1 = best.a + Math.PI * 0.82, t2 = best.a - Math.PI * 0.82, f = function (n) { return n.toFixed(1); };
      wire.innerHTML = '<circle cx="' + f(x1) + '" cy="' + f(y1) + '" r="3"></circle>' +
        '<path d="M' + f(x1) + ',' + f(y1) + ' C' + f(g) + ',' + f(y1) + ' ' + f(g) + ',' + f(best.y) + ' ' + f(fl) + ',' + f(best.y) + '"></path>' +
        '<path class="lead" d="M' + f(fl) + ',' + f(best.y) + ' L' + f(best.bx) + ',' + f(best.y) + ' L' + f(best.ex) + ',' + f(best.ey) + '"></path>' +
        '<path class="tip" d="M' + f(best.ex + Math.cos(t1) * 8) + ',' + f(best.ey + Math.sin(t1) * 8) + ' L' + f(best.ex) + ',' + f(best.ey) + ' L' + f(best.ex + Math.cos(t2) * 8) + ',' + f(best.ey + Math.sin(t2) * 8) + '"></path>';
      var path = wire.querySelector('path:not(.lead):not(.tip)');
      if (pick === null) path.classList.add('is-faint');
      else if (!reduce && drawFor !== open.li.id + ':' + pick) {
        // The first time a chosen item's connector appears, it draws itself from the line to the pin.
        drawFor = open.li.id + ':' + pick;
        path.style.setProperty('--len', path.getTotalLength());
        path.classList.add('is-draw');
      }
    }

    // The open line's pieces lift, each leaving its outline behind in dashed grey.
    function lift(layers) {
      q('.ghost').forEach(function (g) { g.parentNode.removeChild(g); });
      q('.is-lift').forEach(function (g) { g.classList.remove('is-lift'); });
      layers.forEach(function (l) {
        layerEls(l).forEach(function (g) {
          var ghost = g.cloneNode(true);
          ghost.removeAttribute('data-layer'); ghost.removeAttribute('aria-label'); ghost.classList.remove('is-on');
          ghost.classList.add('ghost'); ghost.style.opacity = '';
          g.parentNode.insertBefore(ghost, g);
          requestAnimationFrame(function () { ghost.classList.add('is-in'); g.classList.add('is-lift'); });
        });
      });
    }

    function marks() {
      if (!open) return;
      open.items.forEach(function (x, i) { x.row.classList.toggle('is-on', i === pick); x.row.classList.toggle('is-hover', i === hover && pick === null); });
      if (pins) slice(pins.querySelectorAll('.pin')).forEach(function (p) { var i = +p.getAttribute('data-i'); p.classList.toggle('is-on', i === pick); p.classList.toggle('is-hover', i === hover && pick === null); });
      if (open.card) slice(open.card.querySelectorAll('[data-mix]')).forEach(function (m) { m.classList.toggle('is-hot', +m.getAttribute('data-mix') === hover); });
      q('.is-pick, .is-sib').forEach(function (g) { g.classList.remove('is-pick', 'is-sib'); });
      var i = pick !== null ? pick : hover;
      var item = i !== null ? open.items[i] : null, a = item ? item.anchor : null;
      var mates = a ? open.items.filter(function (x) { return x.anchor === a; }) : [];
      // Once an item is chosen, the rest of its line steps back to grey, so only its own piece is blue.
      if (pick !== null) open.layers.forEach(function (l) { if (l !== a || mates.length > 1) layerEls(l).forEach(function (g) { g.classList.add('is-sib'); }); });
      if (a) {
        // An item that shares its piece marks only its own labelled part; one with its own piece marks the whole piece.
        if (mates.length > 1 && labelPoint(item.label)) { var el = anchorEl(a, item.label); if (el) el.classList.add('is-pick'); }
        else {
          layerEls(a).forEach(function (g) { g.classList.add('is-pick'); });
          // The whole piece, less the parts the drawing labels for its sibling items (the elevator without its bulkhead).
          mates.forEach(function (x) { if (x !== item && labelPoint(x.label)) { var s = anchorEl(a, x.label); if (s) s.classList.add('is-sib'); } });
        }
      }
      drawWire();
    }

    function setOpen(li, on) {
      li.setAttribute('data-open', String(on));
      var btn = li.querySelector('.sov-h');
      if (btn) btn.setAttribute('aria-expanded', String(on));
    }
    function goHome(card) {
      if (!card || !card._home) return;
      if (card._home.after) card._home.after.parentNode.insertBefore(card, card._home.after.nextSibling);
      else card._home.into.appendChild(card);
    }
    // On a phone the drawing is pinned above the list; bring the open line (or its card) up under it.
    function underDrawing(el) {
      var d = aside.getBoundingClientRect();
      scrollTo({ top: el.getBoundingClientRect().top + scrollY - d.bottom - 6, behavior: reduce ? 'auto' : 'smooth' });
    }

    function show(lineChanged) {
      if (shown) { shown.classList.remove('is-in'); shown.hidden = true; goHome(shown); shown = null; }
      if (!open) {
        if (pins) pins.innerHTML = '';
        if (wire) wire.innerHTML = '';
        focus([]); lift([]); zoomTo(home(), 640); crumb(['Building Section']);
        return;
      }
      var line = open, item = pick !== null ? line.items[pick] : null;
      // The criteria sit on the card, so the drawing lights only the pieces.
      focus(line.layers);
      if (lineChanged) {
        if (pins) {
          pins.innerHTML = '';
          line.items.forEach(function (x, i) {
            if (!x.anchor) return;
            var p = doc.createElement('button');
            p.className = 'pin'; p.type = 'button'; p.setAttribute('data-i', i); p.textContent = String(i + 1); p.setAttribute('aria-label', x.label);
            pins.appendChild(p);
          });
        }
        lift(line.layers);
        zoomTo(line.layers.length ? boxOf(line.layers) : home(), 640, placePins);
        if (phone()) setTimeout(function () { underDrawing(line.li); }, reduce ? 0 : 380);
        setTimeout(function () {
          placePins();
          if (pins) slice(pins.querySelectorAll('.pin')).forEach(function (p, k) { setTimeout(function () { p.classList.add('is-in'); }, reduce ? 0 : k * 80); });
        }, reduce ? 0 : 420);
      } else if (phone() && item && item.anchor) {
        // On a phone the zoom frames every pin in the line, so no pin is pushed off the drawing.
        var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        line.items.forEach(function (x) {
          var e = x.anchor ? anchorEl(x.anchor, x.label) : null;
          if (!e) return;
          var b = e.getBBox();
          x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
        });
        // Clamped to the whole drawing, not the phone's crop of it, so a piece at the top (the bulkhead) stays inside.
        var H = home(), ar = H[2] / H[3];
        var w = Math.max(x1 - x0 + 120, H[2] * 0.6), h = Math.max(y1 - y0 + 150, H[3] * 0.6);
        if (w / h > ar) h = w / ar; else w = h * ar;
        w = Math.min(w, BASE[2]); h = Math.min(h, BASE[3]);
        var x = Math.max(BASE[0], Math.min((x0 + x1) / 2 - w / 2, BASE[0] + BASE[2] - w));
        var y = Math.max(BASE[1], Math.min((y0 + y1) / 2 - h / 2, BASE[1] + BASE[3] - h));
        zoomTo([x, y, w, h], 520, placePins);
      } else placePins();
      marks();
      crumb(item ? [titleOf(line), item.label] : ['Building Section', titleOf(line)]);
      var card = item ? item.card : line.card;
      if (card) {
        if (!phone() && cardSlot) cardSlot.appendChild(card);
        card.hidden = false;
        shown = card;
        requestAnimationFrame(function () { card.classList.add('is-in'); });
        if (item && phone()) setTimeout(function () { underDrawing(line.li); }, reduce ? 0 : 320);
      }
      sc.layout();
    }
    function choose(i) { pick = pick === i ? null : i; hover = null; show(false); }
    function toggle(line) {
      closeCrit();
      if (open && open !== line) setOpen(open.li, false);
      open = open === line ? null : line;
      setOpen(line.li, !!open);
      pick = null; hover = null;
      show(true);
    }

    section.addEventListener('click', function (e) {
      var pr = e.target.closest('.pin-row');
      if (pr && open && open.li.contains(pr)) { choose(+pr.getAttribute('data-i')); return; }
      var h = e.target.closest('.sov-line[data-el] > .sov-h');
      if (h) toggle(lineOf(h.parentNode));
    });
    if (pins) pins.addEventListener('click', function (e) { var p = e.target.closest('.pin'); if (p) choose(+p.getAttribute('data-i')); });
    trio.addEventListener('click', function (e) {
      var more = e.target.closest('[data-more]');
      if (more) { more.parentNode.classList.add('is-full'); return; }
      var b = e.target.closest('.card [data-step]');
      if (!b || !open) return;
      var n = open.items.length;
      choose(((pick === null ? 0 : pick) + +b.getAttribute('data-step') + n) % n);
    });
    // Pointing at a criterion on the card lights its callout, which points at the piece it decides (V-2 at the jack).
    trio.addEventListener('mouseover', function (e) {
      var c = e.target.closest('.card [data-tag]');
      if (c && open) focus(open.layers, [c.getAttribute('data-tag')]);
    });
    trio.addEventListener('mouseout', function (e) {
      var c = e.target.closest('.card [data-tag]');
      if (c && open && !c.contains(e.relatedTarget)) focus(open.layers);
    });
    addEventListener('keydown', function (e) {
      if (!open || e.defaultPrevented || e.target.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'Escape') { toggle(open); return; }
      var n = open.items.length;
      if (!n) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); choose(pick === null ? 0 : (pick + 1) % n); }
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); choose(pick === null ? n - 1 : (pick - 1 + n) % n); }
    });
    // Pointing previews: before a line is open, pointing at one lights its pieces;
    // inside an open line, pointing at an item pulses its pin and draws the connector faintly.
    section.addEventListener('mouseover', function (e) {
      var pr = e.target.closest('.pin-row');
      if (open && pr && open.li.contains(pr)) { var i = +pr.getAttribute('data-i'); if (pick === null && hover !== i) { hover = i; marks(); } return; }
      if (open && hover !== null) { hover = null; marks(); }
      if (open || crit) return;
      var li = e.target.closest('.sov-line[data-el]');
      each('.sov-line.is-hot', function (x) { x.classList.remove('is-hot'); }, section);
      if (!li) { focus([]); return; }
      li.classList.add('is-hot');
      focus(lineOf(li).layers);
    });
    section.addEventListener('mouseleave', function () {
      if (!open && !crit) { focus([]); each('.sov-line.is-hot', function (x) { x.classList.remove('is-hot'); }, section); }
      else if (hover !== null) { hover = null; marks(); }
    });
    if (pins) {
      pins.addEventListener('mouseover', function (e) { var p = e.target.closest('.pin'); if (p && pick === null) { hover = +p.getAttribute('data-i'); marks(); } });
      pins.addEventListener('mouseout', function () { if (pick === null && hover !== null) { hover = null; marks(); } });
    }
    // The card changes the panel's height, which can move the drawing; the pins and the connector follow it.
    if (aside && window.ResizeObserver && !printing) new ResizeObserver(function () { requestAnimationFrame(placePins); }).observe(aside);
    // On a phone the no-rate items fold into one line the reader can tap open.
    if (phone() && !printing) each('details[data-fold-phone]', function (d) { d.open = false; }, section);

    /* Design and Engineering in layers (LA-1662): a criterion's row opens in place to its detail.
       The open criterion lights its callout and what it prices, a halo marks the point it decides,
       and a lead runs from the row to its note in the left margin, the way a drawing keys its notes,
       or to the halo when the note sits in the right margin. On a phone the drawing zooms to the
       note instead. */
    var crit = null;
    var halo = null;
    if (frame && !printing) { halo = doc.createElement('span'); halo.className = 'halo'; halo.setAttribute('aria-hidden', 'true'); frame.appendChild(halo); }
    var STEP = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    var codeOf = function (row) { return row.getAttribute('data-crit'); };
    var rowOf = function (code) { return rows.filter(function (r) { return codeOf(r) === code; })[0] || null; };
    var calloutOf = function (code) { return q('[data-callout="' + cssEsc(code) + '"]')[0] || null; };
    function pricedOf(row) {
      var out = [];
      slice(row.querySelectorAll('.de-pr[data-layer]')).forEach(function (p) { var l = p.getAttribute('data-layer'); if (out.indexOf(l) < 0) out.push(l); });
      return out;
    }

    function placeHalo() {
      if (!halo) return;
      var c = crit && calloutOf(codeOf(crit));
      // A note with no leader point (A-2, under the key plan) keeps its lit tag as the mark.
      var dot = c && c.querySelector('circle');
      if (!dot) { halo.classList.remove('is-in'); return; }
      var pt = screenOf(dot), fr = frame.getBoundingClientRect();
      halo.style.left = (pt.x - fr.left) + 'px'; halo.style.top = (pt.y - fr.top) + 'px';
      halo.classList.add('is-in');
    }

    // The lead comes in level from the drawing's left edge. A note left of the building takes it at
    // its own height and the lead stops at its words. A note right of the building lights in place;
    // its lead runs in at the halo's height and stops at the halo's ring.
    function drawLead() {
      if (!wire || open) return;
      wire.innerHTML = '';
      var c = crit && calloutOf(codeOf(crit));
      if (!c || phone()) return;
      var head = crit.querySelector('.de-h').getBoundingClientRect();
      var tag = c.querySelector('rect').getBoundingClientRect(), dot = c.querySelector('circle');
      var pt = dot && screenOf(dot), y, end;
      if (!pt || pt.x > tag.left) {
        var words = slice(c.querySelectorAll('text')).map(function (t) { return t.getBoundingClientRect(); }).concat([tag]);
        y = tag.top + tag.height / 2;
        end = Math.min.apply(null, words.map(function (r) { return r.left; })) - 6;
      } else {
        y = pt.y;
        end = pt.x - 21;
      }
      var x1 = head.right + 6, y1 = head.top + head.height / 2, fl = frame.getBoundingClientRect().left;
      if (y1 < hdH() || y1 > innerHeight || y < hdH() || y > innerHeight) return;
      var g = (x1 + fl) / 2, f = function (n) { return n.toFixed(1); };
      wire.innerHTML = '<circle cx="' + f(x1) + '" cy="' + f(y1) + '" r="3"></circle>' +
        '<path d="M' + f(x1) + ',' + f(y1) + ' C' + f(g) + ',' + f(y1) + ' ' + f(g) + ',' + f(y) + ' ' + f(fl) + ',' + f(y) + '"></path>' +
        '<path class="lead" d="M' + f(fl) + ',' + f(y) + ' L' + f(end) + ',' + f(y) + '"></path>';
      var path = wire.querySelector('path:not(.lead)');
      if (!reduce && drawFor !== 'crit:' + codeOf(crit)) {
        drawFor = 'crit:' + codeOf(crit);
        path.style.setProperty('--len', path.getTotalLength());
        path.classList.add('is-draw');
      }
    }
    function follow() { placeHalo(); drawLead(); }

    function noteBox(code) {
      var c = calloutOf(code), H = home();
      if (!c) return H;
      var b = c.getBBox(), ar = H[2] / H[3], pad = 24;
      if (!b.width && !b.height) return H;
      var w = Math.max(b.width + pad * 2, H[2] * 0.5), h = Math.max(b.height + pad * 2, H[3] * 0.5);
      if (w / h > ar) h = w / ar; else w = h * ar;
      w = Math.min(w, BASE[2]); h = Math.min(h, BASE[3]);
      var x = Math.max(BASE[0], Math.min(b.x + b.width / 2 - w / 2, BASE[0] + BASE[2] - w));
      var y = Math.max(BASE[1], Math.min(b.y + b.height / 2 - h / 2, BASE[1] + BASE[3] - h));
      return [x, y, w, h];
    }

    function setRow(row, on) {
      row.setAttribute('data-open', String(on));
      row.querySelector('.de-h').setAttribute('aria-expanded', String(on));
      if (!on) each('details[open]', function (d) { d.open = false; }, row);
    }
    function closeCrit() {
      if (!crit) return;
      setRow(crit, false);
      crit = null;
      drawFor = null;
      placeHalo();
      if (wire && !open) wire.innerHTML = '';
    }
    function bringIn(row) {
      setTimeout(function () {
        if (crit !== row) return;
        if (phone()) { underDrawing(row); return; }
        var r = row.getBoundingClientRect(), over = r.bottom - (innerHeight - 24);
        if (over > 0) scrollBy({ top: Math.min(over, r.top - hdH() - 16), behavior: reduce ? 'auto' : 'smooth' });
      }, reduce ? 0 : 400);
    }
    function chooseCrit(row) {
      if (open) toggle(open);
      if (crit === row) { closeCrit(); row = null; }
      else { closeCrit(); crit = row; setRow(row, true); }
      rows.forEach(function (r) { r.classList.remove('is-hot'); });
      if (!crit) { focus([]); zoomTo(home(), 600); crumb(['Building Section']); sc.layout(); return; }
      var code = codeOf(crit);
      focus(pricedOf(crit), [code]);
      crumb(['Building Section', code + ' ' + crit.querySelector('.de-name').firstChild.textContent]);
      zoomTo(phone() ? noteBox(code) : home(), 600, follow);
      setTimeout(function () { follow(); sc.layout(); }, reduce ? 0 : 420);
      bringIn(crit);
    }

    function preview(code) {
      if (crit || open) return;
      rows.forEach(function (r) { r.classList.toggle('is-hot', codeOf(r) === code); });
      if (code) focus([], [code], 0.3); else focus([]);
    }
    if (deList) {
      deList.addEventListener('click', function (e) { var h = e.target.closest('.de-h'); if (h) chooseCrit(h.parentNode); });
      deList.addEventListener('mouseover', function (e) { var r = e.target.closest('.de-row'); preview(r ? codeOf(r) : null); });
      deList.addEventListener('mouseleave', function () { preview(null); });
      deList.addEventListener('mouseover', function (e) {
        var p = e.target.closest('.de-pr[data-layer]');
        if (p && crit && crit.contains(p)) focus([p.getAttribute('data-layer')], [codeOf(crit)]);
      });
      deList.addEventListener('mouseout', function (e) {
        var p = e.target.closest('.de-pr[data-layer]');
        if (p && crit && !p.contains(e.relatedTarget)) focus(pricedOf(crit), [codeOf(crit)]);
      });
    }
    if (svg && !printing && rows.length) {
      svg.addEventListener('mouseover', function (e) {
        if (state !== 'design') return;
        var c = e.target.closest('[data-callout]');
        preview(c ? c.getAttribute('data-callout') : null);
      });
      svg.addEventListener('click', function (e) {
        var c = state === 'design' && e.target.closest('[data-callout]');
        var row = c && rowOf(c.getAttribute('data-callout'));
        if (row) chooseCrit(row);
      });
    }
    if (rows.length) addEventListener('keydown', function (e) {
      if (e.defaultPrevented || e.target.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'Escape' && crit) { var was = crit; chooseCrit(crit); was.querySelector('.de-h').focus({ preventScroll: true }); return; }
      var d = STEP[e.key];
      if (!d || !design.contains(doc.activeElement) || e.target.closest('summary')) return;
      if (!crit && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
      var at = crit || doc.activeElement.closest('.de-row');
      var i = rows.indexOf(at), j = i + d;
      if (crit) j = (j + rows.length) % rows.length;
      else if (i < 0) j = d > 0 ? 0 : rows.length - 1;
      var next = rows[j];
      if (!next) return;
      e.preventDefault();
      if (crit) chooseCrit(next);
      var h = next.querySelector('.de-h');
      h.focus({ preventScroll: true });
      if (!crit) {
        var top = hdH() + (phone() && aside ? aside.offsetHeight : 0) + 8, r = h.getBoundingClientRect();
        if (r.top < top || r.bottom > innerHeight - 8) scrollBy({ top: r.top - top, behavior: 'auto' });
      }
    });

    function readingLine() { var top = hdH() + (phone() && aside ? aside.offsetHeight : 0); return top + (innerHeight - top) * 0.3; }
    function read() {
      var s = design && design.getBoundingClientRect().top <= readingLine() ? 'design' : 'sov';
      if (s !== state) {
        state = s;
        trio.setAttribute('data-state', s);
      }
      if (open) requestAnimationFrame(placePins);
      if (crit) requestAnimationFrame(follow);
    }

    // The camera follows the width: a phone's crop or a desktop's tall frame.
    function place() {
      if (!svg) return;
      if (open && open.layers.length) setVb(boxOf(open.layers));
      else if (crit && phone()) setVb(noteBox(codeOf(crit)));
      else setVb(home());
      placePins();
      follow();
    }
    // Print: every line and every criterion open with its cards and steps in place, the drawing whole and at rest.
    function rest() {
      if (open) { open = null; pick = null; hover = null; show(true); }
      closeCrit();
      rows.forEach(function (r) { setRow(r, true); each('details', function (d) { d.open = true; }, r); });
      cam++;
      setVb(BASE.slice());
      focus([]);
      lines.forEach(function (l) {
        setOpen(l.li, true);
        [l.card].concat(l.items.map(function (x) { return x.card; })).forEach(function (c) { if (c) { goHome(c); c.hidden = false; c.classList.add('is-in'); } });
      });
      each('details[data-fold-phone]', function (d) { d.open = true; }, section);
      state = 'design';
      trio.setAttribute('data-state', 'design');
    }
    crumb(['Building Section']);
    return { read: read, place: place, rest: rest };
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
    opening.frame(); peakNear(); sov.read(); wf.read(); spy();
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
    requestAnimationFrame(function () { ticking = false; opening.frame(); peakNear(); sov.read(); wf.read(); spy(); });
  }
  function relayout() { cropDrawings(); sov.place(); sc.layout(); opening.measure(); opening.frame(); peakNear(); sov.read(); wf.read(); spy(); }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', relayout, { passive: true });
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(relayout);

  /* ---- print: the engine at rest, every line open, the drawing whole ---- */
  function rest() {
    each('[data-sc-act]', function (a) { a.style.setProperty('--sc-p', '1'); });
    sov.rest();
    wf.all();
  }
  addEventListener('beforeprint', rest);
  window.KulkaBudget = { rest: rest, engine: sc, schedule: sov, waterfall: wf };

  /* ---- start ---- */
  relayout();
  if (printing) rest();
})();
