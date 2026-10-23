/* Dream Board: reads data/plans.json, draws the sky, and marks dreams that came true. */
(function () {
  "use strict";

  var STORAGE_KEY = "dreamboard:accomplished:v1";
  var MAX_CELEBRATIONS = 3;
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var STATUS_LABEL = {
    "dreaming": "Dreaming",
    "in-progress": "In progress",
    "accomplished": "Accomplished",
    "released": "Let go"
  };

  var motionQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  function reducedMotion() { return !!(motionQuery && motionQuery.matches); }

  var $ = function (id) { return document.getElementById(id); };

  var state = { data: null, plans: [], status: "all", category: null };

  /* ---------- small helpers ---------- */

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var key in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, key)) continue;
        var value = attrs[key];
        if (value === null || value === undefined || value === false) continue;
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = value;
        else if (key === "html") node.innerHTML = value; // only ever used with static strings
        else node.setAttribute(key, value === true ? "" : value);
      }
    }
    (children || []).forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    });
    return node;
  }

  function parseDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
    if (!m) return null;
    return { y: +m[1], m: +m[2], d: +m[3], key: m[1] + m[2] + m[3] };
  }

  function formatDay(iso) {
    var p = parseDate(iso);
    return p ? p.d + " " + MONTHS[p.m - 1] + " " + p.y : "";
  }

  function formatMonth(iso) {
    var p = parseDate(iso);
    return p ? MONTHS[p.m - 1] + " " + p.y : "";
  }

  function todayKey() {
    var t = new Date();
    return String(t.getFullYear()) + String(t.getMonth() + 1).padStart(2, "0") + String(t.getDate()).padStart(2, "0");
  }

  function hash01(str, salt) {
    var h = 2166136261 ^ (salt || 0);
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 100000) / 100000;
  }

  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

  function wait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  function readSeen() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === null) return null;
      var list = JSON.parse(raw);
      return Array.isArray(list) ? list : null;
    } catch (e) {
      return undefined; // storage unavailable: never celebrate, never fail
    }
  }

  function writeSeen(ids) {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)); } catch (e) { /* fine without it */ }
  }

  function normalise(data) {
    if (!data || typeof data !== "object" || !Array.isArray(data.plans)) throw new Error("bad plans.json");
    return data.plans
      .filter(function (p) { return p && typeof p.id === "string" && typeof p.title === "string"; })
      .map(function (p) {
        var status = STATUS_LABEL[p.status] ? p.status : "dreaming";
        return {
          id: p.id,
          title: p.title,
          why: typeof p.why === "string" && p.why.trim() ? p.why : null,
          category: typeof p.category === "string" ? p.category : null,
          status: status,
          steps: Array.isArray(p.steps) ? p.steps.filter(function (s) { return s && typeof s.text === "string"; }) : [],
          target: p.target || null,
          createdAt: p.createdAt || null,
          completedAt: p.completedAt || null,
          reflection: typeof p.reflection === "string" && p.reflection.trim() ? p.reflection : null
        };
      });
  }

  /* ---------- hero, footer ---------- */

  function renderHero() {
    var data = state.data;
    var plans = state.plans;
    var owner = typeof data.owner === "string" && data.owner.trim() ? data.owner.trim() : "";
    var title = typeof data.title === "string" && data.title.trim() ? data.title.trim() : "Dream Board";

    $("owner").textContent = owner ? owner + "’s" : "";
    $("title").textContent = title;
    $("tagline").textContent = typeof data.tagline === "string" ? data.tagline : "";
    document.title = owner ? title + " · " + owner : title;

    var living = plans.filter(function (p) { return p.status !== "released"; });
    var done = living.filter(function (p) { return p.status === "accomplished"; }).length;
    var going = living.filter(function (p) { return p.status === "in-progress"; }).length;
    var stats = $("stats");
    stats.textContent = "";
    if (!living.length) {
      stats.textContent = "The first dream is still waiting to be named.";
      return;
    }
    var parts = [
      [living.length, living.length === 1 ? " dream" : " dreams"],
      [done, " accomplished"],
      [going, " in progress"]
    ];
    parts.forEach(function (part, i) {
      if (i) stats.appendChild(el("span", { class: "sep", "aria-hidden": "true", text: "·" }));
      stats.appendChild(el("span", { class: "stat" }, [el("strong", { text: String(part[0]) }), part[1]]));
    });
  }

  function renderFooter() {
    var newest = null;
    state.plans.forEach(function (p) {
      [p.createdAt, p.completedAt].forEach(function (iso) {
        var d = parseDate(iso);
        if (d && (!newest || d.key > newest.key)) newest = { key: d.key, iso: iso };
      });
    });
    $("updated").textContent = newest ? "Last updated " + formatDay(newest.iso) : "";
  }

  /* ---------- constellation ---------- */

  var activeStar = null;

  function renderSky() {
    var section = $("constellation");
    var starsBox = $("sky-stars");
    var lines = $("sky-lines");
    section.hidden = false;
    starsBox.textContent = "";
    while (lines.firstChild) lines.removeChild(lines.firstChild);
    hideLabel();

    var plans = state.plans;
    $("sky-empty").hidden = plans.length > 0;
    $("sky-legend").hidden = plans.length === 0;
    if (!plans.length) return;

    var n = plans.length;
    var positions = plans.map(function (p, i) {
      // spread along the strip in the order dreams were named, with a little drift
      var slot = 88 / n;
      var x = n === 1 ? 50 : 6 + slot * (i + 0.5) + (hash01(p.id, 7) - 0.5) * slot * 0.6;
      var y = n === 1 ? 46 : 16 + hash01(p.id, 13) * 66;
      return { x: x, y: y };
    });

    // accomplished stars join into one constellation: as each dream came true,
    // it reached for the nearest star that was already lit
    var strip = $("sky-strip");
    var aspect = strip.offsetHeight ? strip.offsetWidth / strip.offsetHeight : 4;
    var lit = plans
      .map(function (p, i) { return { p: p, pos: positions[i] }; })
      .filter(function (o) { return o.p.status === "accomplished"; })
      .sort(function (a, b) { return (a.p.completedAt || "").localeCompare(b.p.completedAt || ""); });
    for (var k = 1; k < lit.length; k++) {
      var nearest = null;
      var best = Infinity;
      for (var j = 0; j < k; j++) {
        var dx = (lit[k].pos.x - lit[j].pos.x) * aspect;
        var dy = lit[k].pos.y - lit[j].pos.y;
        var d = dx * dx + dy * dy;
        if (d < best) { best = d; nearest = lit[j]; }
      }
      lines.appendChild(svgLine(nearest.pos, lit[k].pos));
    }

    plans.forEach(function (p, i) {
      var pos = positions[i];
      var star = el("button", {
        type: "button",
        class: "star star--" + p.status,
        role: "listitem",
        "aria-label": p.title + " — " + STATUS_LABEL[p.status],
        "data-id": p.id,
        style: "left:" + pos.x.toFixed(2) + "%;top:" + pos.y.toFixed(2) + "%;--delay:" + (-hash01(p.id, 3) * 5).toFixed(2) + "s"
      }, [el("span", { class: "star__core", "aria-hidden": "true" })]);

      star.addEventListener("mouseenter", function () { showLabel(star, p); });
      star.addEventListener("mouseleave", function () { if (activeStar !== star) hideLabel(); else showLabel(star, p); });
      star.addEventListener("focus", function () { showLabel(star, p); });
      star.addEventListener("blur", function () { if (activeStar === star) { activeStar = null; star.classList.remove("is-active"); } hideLabel(); });
      star.addEventListener("click", function () {
        if (activeStar === star) {
          // second tap on the same star: go to its card
          goToCard(p.id);
          return;
        }
        if (activeStar) activeStar.classList.remove("is-active");
        activeStar = star;
        star.classList.add("is-active");
        showLabel(star, p);
      });
      starsBox.appendChild(star);
    });
  }

  function svgLine(a, b) {
    var line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", a.x);
    line.setAttribute("y1", a.y);
    line.setAttribute("x2", b.x);
    line.setAttribute("y2", b.y);
    return line;
  }

  function showLabel(star, plan) {
    var label = $("sky-label");
    var strip = $("sky-strip");
    label.textContent = "";
    label.appendChild(el("small", { text: STATUS_LABEL[plan.status] }));
    label.appendChild(document.createTextNode(plan.title));
    label.classList.toggle("is-gold", plan.status === "accomplished");
    label.hidden = false;

    var stripRect = strip.getBoundingClientRect();
    var starRect = star.getBoundingClientRect();
    var cx = starRect.left + starRect.width / 2 - stripRect.left;
    var cy = starRect.top + starRect.height / 2 - stripRect.top;
    label.classList.toggle("below", cy < stripRect.height * 0.45);
    label.style.top = cy + "px";
    // keep the label inside the strip horizontally
    var half = label.offsetWidth / 2;
    var x = Math.min(Math.max(cx, half + 8), stripRect.width - half - 8);
    label.style.left = x + "px";
  }

  function hideLabel() { $("sky-label").hidden = true; }

  function goToCard(id) {
    var card = document.getElementById("plan-" + id);
    if (!card) return;
    if (card.closest("[hidden]")) { setFilter("all", null); }
    var details = card.closest("details");
    if (details) details.open = true;
    card.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
    card.classList.remove("is-highlight");
    void card.offsetWidth;
    card.classList.add("is-highlight");
  }

  /* ---------- filters ---------- */

  function renderFilters() {
    var nav = $("filters");
    var statusBox = $("status-filters");
    var catBox = $("category-filters");
    statusBox.textContent = "";
    catBox.textContent = "";
    nav.hidden = state.plans.length === 0;
    if (!state.plans.length) return;

    [["all", "All"], ["dreaming", "Dreaming"], ["in-progress", "In progress"], ["accomplished", "Accomplished"]].forEach(function (pair) {
      var b = el("button", { type: "button", class: "chip", "data-status": pair[0], "aria-pressed": String(state.status === pair[0]), text: pair[1] });
      b.addEventListener("click", function () { setFilter(pair[0], state.category); });
      statusBox.appendChild(b);
    });

    // only categories that hold at least one plan, in the order the owner listed them
    var listed = Array.isArray(state.data.categories) ? state.data.categories.slice() : [];
    state.plans.forEach(function (p) { if (p.category && listed.indexOf(p.category) === -1) listed.push(p.category); });
    var used = listed.filter(function (c) { return state.plans.some(function (p) { return p.category === c; }); });
    if (used.length < 2) return;
    used.forEach(function (c) {
      var b = el("button", { type: "button", class: "chip chip--category", "data-category": c, "aria-pressed": String(state.category === c), text: c });
      b.addEventListener("click", function () { setFilter(state.status, state.category === c ? null : c); });
      catBox.appendChild(b);
    });
  }

  function setFilter(status, category) {
    state.status = status;
    state.category = category;
    Array.prototype.forEach.call(document.querySelectorAll("[data-status]"), function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-status") === status));
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-category]"), function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-category") === category));
    });
    applyFilter();
  }

  function matches(p) {
    if (state.category && p.category !== state.category) return false;
    if (state.status === "all") return true;
    return p.status === state.status;
  }

  function applyFilter() {
    var filtered = state.status !== "all" || state.category !== null;
    var visibleTotal = 0;

    [["dreams", "dreams-grid", "dreams-empty"], ["accomplished", "hall-grid", "hall-empty"]].forEach(function (ids) {
      var section = $(ids[0]);
      var cards = $(ids[1]).children;
      var shown = 0;
      Array.prototype.forEach.call(cards, function (card) {
        var plan = state.byId[card.getAttribute("data-id")];
        var ok = matches(plan);
        card.hidden = !ok;
        if (ok) shown++;
      });
      visibleTotal += shown;
      if (filtered) {
        section.hidden = shown === 0;
        $(ids[2]).hidden = true;
      } else {
        section.hidden = false;
        $(ids[2]).hidden = cards.length > 0;
      }
    });

    var released = $("released");
    var releasedItems = $("released-list").children;
    var releasedShown = 0;
    Array.prototype.forEach.call(releasedItems, function (li) {
      var ok = !state.category || state.byId[li.getAttribute("data-id")].category === state.category;
      li.hidden = !ok;
      if (ok) releasedShown++;
    });
    released.hidden = releasedShown === 0 || state.status !== "all";

    $("filter-empty").hidden = !(filtered && visibleTotal === 0);
  }

  /* ---------- cards ---------- */

  var SEAL_SVG =
    '<svg class="card__seal" viewBox="0 0 48 48" aria-hidden="true">' +
    '<path fill="#f4c76b" d="M24 2l4.3 3.6 5.5-.9 2.2 5.1 5.1 2.2-.9 5.5L44 22l-3.6 4.3.9 5.5-5.1 2.2-2.2 5.1-5.5-.9L24 42l-4.3-3.6-5.5.9-2.2-5.1-5.1-2.2.9-5.5L4 22l3.6-4.3-.9-5.5 5.1-2.2 2.2-5.1 5.5.9z" transform="translate(0 2)"/>' +
    '<circle cx="24" cy="24" r="13.5" fill="#ffe3a3"/>' +
    '<path d="M16.5 24.5l5 5 10-10.5" fill="none" stroke="#2a1c08" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
    "</svg>";

  var SPARKLE_SVG =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0.8l1.5 4.9 4.9 1.5-4.9 1.5L8 13.6 6.5 8.7 1.6 7.2l4.9-1.5z"/><path fill="currentColor" d="M13.2 10.6l.6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6z" opacity="0.7"/></svg>';

  function dreamCard(p) {
    var doneSteps = p.steps.filter(function (s) { return s.done; }).length;
    var total = p.steps.length;
    var children = [
      el("div", { class: "card__top" }, [
        el("span", { class: "card__category", text: p.category || "" }),
        el("span", { class: "card__status", text: STATUS_LABEL[p.status] })
      ]),
      el("h3", { class: "card__title", text: p.title }),
      p.why ? el("p", { class: "card__why", text: p.why }) : null
    ];

    if (total) {
      var pct = Math.round((doneSteps / total) * 100);
      children.push(el("div", { class: "card__progress" }, [
        el("div", {
          class: "progress",
          role: "progressbar",
          "aria-label": "Steps done",
          "aria-valuemin": "0",
          "aria-valuemax": String(total),
          "aria-valuenow": String(doneSteps),
          "aria-valuetext": doneSteps + " of " + total + " steps"
        }, [el("span", { style: "width:" + pct + "%" })]),
        el("span", { text: doneSteps + " / " + total })
      ]));
      children.push(el("details", { class: "steps" }, [
        el("summary", { text: total === 1 ? "Step" : "Steps" }),
        el("ul", null, p.steps.map(function (s) {
          return el("li", { class: s.done ? "is-done" : null }, [
            el("span", { class: "step__mark", "aria-hidden": "true" }),
            el("span", null, [s.text, el("span", { class: "visually-hidden", text: s.done ? " (done)" : " (not yet)" })])
          ]);
        }))
      ]));
    }

    var target = parseDate(p.target);
    if (target) {
      var passed = target.key < todayKey();
      children.push(el("p", { class: "card__target", text: passed ? "Target passed · " + formatMonth(p.target) : "by " + formatMonth(p.target) }));
    }

    return el("article", { class: "card card--" + p.status, id: "plan-" + p.id, "data-id": p.id, "aria-labelledby": "t-" + p.id }, fixTitleId(children, p.id));
  }

  function hallCard(p) {
    var seal = el("div", { "aria-hidden": "true", html: SEAL_SVG }).firstChild;
    var replay = el("button", { type: "button", class: "replay", "aria-label": "Replay the moment: " + p.title, html: SPARKLE_SVG });
    replay.appendChild(document.createTextNode("Replay"));
    var card;
    var children = [
      seal,
      el("div", { class: "card__top" }, [el("span", { class: "card__category", text: p.category || "" })]),
      el("h3", { class: "card__title", text: p.title }),
      el("p", { class: "card__done", text: "Dream accomplished" + (p.completedAt ? " · " + formatDay(p.completedAt) : "") }),
      p.why ? el("p", { class: "card__why", text: p.why }) : null,
      p.reflection ? el("blockquote", { class: "card__reflection" }, [el("p", { text: p.reflection, style: "margin:0" })]) : null,
      el("div", { class: "card__foot" }, [replay])
    ];
    card = el("article", { class: "card card--accomplished", id: "plan-" + p.id, "data-id": p.id, "aria-labelledby": "t-" + p.id }, fixTitleId(children, p.id));
    replay.addEventListener("click", function () {
      replay.disabled = true;
      celebrate(card, p, { scroll: false }).then(function () { replay.disabled = false; replay.focus(); });
    });
    return card;
  }

  function fixTitleId(children, id) {
    children.forEach(function (c) { if (c && c.classList && c.classList.contains("card__title")) c.id = "t-" + id; });
    return children;
  }

  function renderBoards() {
    var plans = state.plans;
    var dreamsGrid = $("dreams-grid");
    var hallGrid = $("hall-grid");
    var list = $("released-list");
    dreamsGrid.textContent = "";
    hallGrid.textContent = "";
    list.textContent = "";

    plans
      .filter(function (p) { return p.status === "dreaming" || p.status === "in-progress"; })
      .forEach(function (p) { dreamsGrid.appendChild(dreamCard(p)); });

    plans
      .filter(function (p) { return p.status === "accomplished"; })
      .sort(function (a, b) { return (b.completedAt || "").localeCompare(a.completedAt || ""); })
      .forEach(function (p) { hallGrid.appendChild(hallCard(p)); });

    var released = plans.filter(function (p) { return p.status === "released"; });
    released.forEach(function (p) {
      list.appendChild(el("li", { "data-id": p.id }, [
        el("span", { text: p.title }),
        el("span", { class: "meta", text: [p.category, "let go"].filter(Boolean).join(" · ") })
      ]));
    });
    $("released-count").textContent = released.length ? "(" + released.length + ")" : "";

    var hasLiving = plans.some(function (p) { return p.status !== "released"; });
    $("dreams-empty").textContent = hasLiving
      ? "Every dream here has come true. The sky is ready for a new one."
      : "No dreams yet. When one is named, it will wait here among the stars.";
    $("hall-empty").textContent = "The first dream made real will be kept here.";
  }

  /* ---------- the celebration ---------- */

  var burst = (function () {
    var canvas = $("burst");
    var ctx = canvas.getContext ? canvas.getContext("2d") : null;
    var particles = [];
    var rings = [];
    var running = false;
    var dpr = 1;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
    }

    function fire(rect) {
      if (!ctx) return;
      resize();
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + Math.min(rect.height / 2, 90);
      var count = window.innerWidth < 600 ? 60 : 90;
      for (var i = 0; i < count; i++) {
        var angle = Math.random() * Math.PI * 2;
        var speed = 2 + Math.random() * 6.5;
        particles.push({
          x: cx + (Math.random() - 0.5) * rect.width * 0.3,
          y: cy + (Math.random() - 0.5) * 20,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1.5,
          life: 0,
          max: 70 + Math.random() * 50,
          size: 1 + Math.random() * 2.4,
          sparkle: Math.random() < 0.22,
          hue: Math.random() < 0.7 ? "255, 224, 160" : "255, 250, 235"
        });
      }
      rings.push({ x: cx, y: cy, r: 0, max: Math.max(rect.width, 160) * 0.9, life: 0 });
      if (!running) { running = true; requestAnimationFrame(tick); }
    }

    function drawSparkle(x, y, s, alpha, rgb) {
      ctx.strokeStyle = "rgba(" + rgb + "," + alpha + ")";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - s * 3, y); ctx.lineTo(x + s * 3, y);
      ctx.moveTo(x, y - s * 3); ctx.lineTo(x, y + s * 3);
      ctx.stroke();
    }

    function tick() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "lighter";

      rings = rings.filter(function (r) {
        r.life++;
        r.r += (r.max - r.r) * 0.08;
        var a = Math.max(0, 0.55 - r.life / 60);
        if (a <= 0) return false;
        var g = ctx.createRadialGradient(r.x, r.y, 0, r.x, r.y, r.r);
        g.addColorStop(0, "rgba(255, 236, 190," + a * 0.6 + ")");
        g.addColorStop(0.6, "rgba(244, 199, 107," + a * 0.25 + ")");
        g.addColorStop(1, "rgba(244, 199, 107, 0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        ctx.fill();
        return true;
      });

      particles = particles.filter(function (p) {
        p.life++;
        p.vx *= 0.955;
        p.vy = p.vy * 0.955 + 0.06;
        p.x += p.vx;
        p.y += p.vy;
        var t = p.life / p.max;
        if (t >= 1) return false;
        var alpha = (1 - t) * (t < 0.1 ? t * 10 : 1);
        if (p.sparkle) {
          drawSparkle(p.x, p.y, p.size, alpha, p.hue);
        } else {
          ctx.fillStyle = "rgba(" + p.hue + "," + alpha + ")";
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1 - t * 0.5), 0, Math.PI * 2);
          ctx.fill();
        }
        return true;
      });

      if (particles.length || rings.length) {
        requestAnimationFrame(tick);
      } else {
        running = false;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }

    return { fire: fire };
  })();

  function whenInView(card) {
    // resolve once the card has settled near the middle of the viewport (or after a moment)
    return new Promise(function (resolve) {
      var start = performance.now();
      var lastTop = null;
      (function check() {
        var top = card.getBoundingClientRect().top;
        var still = lastTop !== null && Math.abs(top - lastTop) < 0.5;
        lastTop = top;
        if ((still && top > -10 && top < window.innerHeight) || performance.now() - start > 1400) resolve();
        else requestAnimationFrame(check);
      })();
    });
  }

  function flareStar(id) {
    var star = document.querySelector('.star[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
    if (!star) return;
    star.classList.remove("is-new");
    void star.offsetWidth;
    star.classList.add("is-new");
  }

  function celebrate(card, plan, opts) {
    var calm = reducedMotion();
    card.classList.add("is-becoming");
    void card.offsetWidth;

    var ready = Promise.resolve();
    if (opts && opts.scroll) {
      card.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "center" });
      ready = calm ? wait(50) : whenInView(card);
    }

    return ready
      .then(function () { return wait(calm ? 200 : 450); }) // a breath in its old dreaming look
      .then(function () {
        if (!calm) {
          burst.fire(card.getBoundingClientRect());
          flareStar(plan.id);
          card.classList.add("is-lit");
        }
        card.classList.remove("is-becoming");
        return wait(calm ? 1000 : 1500);
      })
      .then(function () { card.classList.remove("is-lit"); });
  }

  function runCelebrations() {
    var current = state.plans.filter(function (p) { return p.status === "accomplished"; }).map(function (p) { return p.id; });
    var seen = readSeen();
    if (seen === undefined) return; // no storage: nothing to compare with
    writeSeen(current);
    if (seen === null) return; // first visit: just remember how the sky looks tonight

    var fresh = state.plans
      .filter(function (p) { return p.status === "accomplished" && seen.indexOf(p.id) === -1; })
      .sort(function (a, b) { return (a.completedAt || "").localeCompare(b.completedAt || ""); })
      .slice(-MAX_CELEBRATIONS);
    if (!fresh.length) return;

    // hold every new card in its dreaming look until its turn comes
    var cards = fresh.map(function (p) { return document.getElementById("plan-" + p.id); });
    cards.forEach(function (c) { if (c) c.classList.add("is-becoming"); });

    fresh.reduce(function (chain, p, i) {
      return chain.then(function () {
        return cards[i] ? celebrate(cards[i], p, { scroll: true }).then(function () { return wait(300); }) : null;
      });
    }, wait(400));
  }

  /* ---------- background sky ---------- */

  function startSky() {
    var canvas = $("sky");
    var ctx = canvas.getContext ? canvas.getContext("2d") : null;
    if (!ctx) return;
    var stars = [];
    var w = 0, h = 0, dpr = 1;
    var raf = null;
    var last = 0;

    function seed() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      var count = Math.min(160, Math.round((w * h) / 9000));
      stars = [];
      for (var i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: Math.random() < 0.08 ? 1.3 + Math.random() * 0.6 : 0.4 + Math.random() * 0.8,
          a: 0.25 + Math.random() * 0.6,
          tw: Math.random() * Math.PI * 2,
          tws: 0.004 + Math.random() * 0.012,
          vx: (Math.random() - 0.5) * 0.04,
          vy: -0.02 - Math.random() * 0.05
        });
      }
    }

    function draw(move) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        if (move) {
          s.x += s.vx; s.y += s.vy; s.tw += s.tws;
          if (s.y < -4) { s.y = h + 4; s.x = Math.random() * w; }
          if (s.x < -4) s.x = w + 4; else if (s.x > w + 4) s.x = -4;
        }
        var alpha = move ? s.a * (0.65 + 0.35 * Math.sin(s.tw)) : s.a;
        ctx.fillStyle = "rgba(225, 230, 255," + alpha.toFixed(3) + ")";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function frame(t) {
      raf = requestAnimationFrame(frame);
      if (t - last < 33) return; // ~30fps is plenty for drifting stars
      last = t;
      draw(true);
    }

    function start() {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      if (reducedMotion() || document.hidden) { draw(false); return; }
      raf = requestAnimationFrame(frame);
    }

    var resizeTimer = null;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { seed(); start(); }, 150);
    });
    document.addEventListener("visibilitychange", start);
    if (motionQuery && motionQuery.addEventListener) motionQuery.addEventListener("change", start);

    seed();
    start();
  }

  /* ---------- boot ---------- */

  function showError() {
    var notice = $("notice");
    notice.textContent = "The stars are hiding — try again in a minute.";
    notice.hidden = false;
    $("stats").textContent = "";
  }

  function render() {
    state.byId = {};
    state.plans.forEach(function (p) { state.byId[p.id] = p; });
    renderHero();
    renderSky();
    renderFilters();
    renderBoards();
    applyFilter();
    renderFooter();
  }

  document.addEventListener("click", function (e) {
    if (activeStar && !e.target.closest(".star")) {
      activeStar.classList.remove("is-active");
      activeStar = null;
      hideLabel();
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && activeStar) {
      activeStar.classList.remove("is-active");
      activeStar = null;
      hideLabel();
    }
  });

  // the constellation's lines depend on the strip's shape
  var skyTimer = null;
  var lastWidth = window.innerWidth;
  window.addEventListener("resize", function () {
    if (!state.data || window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    clearTimeout(skyTimer);
    skyTimer = setTimeout(function () { activeStar = null; renderSky(); }, 200);
  });

  startSky();

  fetch("data/plans.json?v=" + Date.now(), { cache: "no-store" })
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (data) {
      state.data = data;
      state.plans = normalise(data);
      render();
      runCelebrations();
    })
    .catch(function (err) {
      if (window.console) console.warn("Dream Board:", err);
      showError();
    });
})();
