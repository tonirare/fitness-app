(function () {
  "use strict";

  const APP_VERSION = 4; // bei jeder Änderung zusammen mit CACHE in sw.js erhöhen

  // ---------- Speicher ----------
  const KEY = "fit.v1";
  const blank = () => ({
    profile: null,
    workouts: [],
    active: null,
    customExercises: [],
    kcal: {},      // Datum -> [{ id, k, t }]
    weights: {},   // Datum -> kg
    earned: {}
  });
  // Alte Lebensmittel-Einträge in einfache Kalorien-Einträge umwandeln
  function migrate(data) {
    if (data.food) {
      data.kcal = data.kcal || {};
      for (const d in data.food) {
        const items = data.food[d] || [];
        if (!items.length || data.kcal[d]) continue;
        data.kcal[d] = items.map((it) => ({ id: it.id || uid(), k: Math.round((it.k * it.g) / 100), t: "" }));
      }
    }
    delete data.food; delete data.customFoods; delete data.recentFoods;
    data.weights = data.weights || {};
    return data;
  }
  let S;
  try { S = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { S = blank(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast("Speichern fehlgeschlagen"); } };

  // ---------- Hilfen ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const pad = (n) => String(n).padStart(2, "0");
  const dstr = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const today = () => dstr(new Date());
  const parseD = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return dstr(d); };
  const NF = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 1 });
  const NF0 = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 0 });
  const fmt = (n) => NF.format(Math.round(n * 10) / 10);
  const fmt0 = (n) => NF0.format(Math.round(n));
  const num = (v) => { const n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : 0; };
  const WD = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const longDate = (s) => { const d = parseD(s); return ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"][d.getDay()] + ", " + d.getDate() + ". " + MONTHS[d.getMonth()]; };
  const mondayOf = (s) => { const d = parseD(s); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return dstr(d); };
  const e1rm = (w, r) => (r <= 0 || w <= 0) ? 0 : (r === 1 ? w : w * (1 + r / 30));
  const fmtSigned = (n) => (n > 0.05 ? "+" : n < -0.05 ? "−" : "±") + fmt(Math.abs(n));
  const shortDate = (s) => { const d = parseD(s); return d.getDate() + "." + (d.getMonth() + 1) + "."; };
  S = migrate(S);

  const allExercises = () => window.EXERCISES.concat(S.customExercises);
  const exById = (id) => allExercises().find((e) => e.id === id) || { id, name: id, t: "i", m: "" };
  const muscleName = (id) => (window.MUSCLES.find((m) => m.id === id) || {}).name || "";
  const activeWorkout = () => S.workouts.find((w) => w.id === S.active) || null;
  const doneSets = (w) => w.entries.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0);

  // ---------- Ziele ----------
  // Kalorienziel aus dem aktuellen Gewicht (Mifflin-St-Jeor, +300 kcal für Muskelaufbau)
  function targets(weight) {
    const p = S.profile;
    if (!p) return { k: 2500 };
    const kg = weight || weightOn(today());
    const bmr = 10 * kg + 6.25 * p.height - 5 * p.age + (p.sex === "f" ? -161 : 5);
    return { k: Math.round((bmr * p.activity + 300) / 50) * 50 };
  }
  const kcalOf = (date) => (S.kcal[date] || []).reduce((a, x) => a + x.k, 0);
  // letztes eingetragenes Gewicht an oder vor diesem Tag
  function weightOn(date) {
    let best = null;
    for (const d in S.weights) if (d <= date && (!best || d > best)) best = d;
    return best ? S.weights[best] : (S.profile ? S.profile.weight : 0);
  }
  const weightSeries = () => Object.keys(S.weights).sort().map((d) => ({ date: d, v: S.weights[d] }));
  // Profilgewicht = neuester Eintrag
  function syncProfileWeight() {
    const ws = weightSeries();
    if (S.profile && ws.length) S.profile.weight = ws[ws.length - 1].v;
  }

  // ---------- Rotation ----------
  function nextDay() {
    const done = S.workouts.filter((w) => doneSets(w) > 0).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    const last = done[done.length - 1];
    if (!last) return "A";
    return { A: "B", B: "C", C: "A" }[last.day] || "A";
  }
  function lastOfDay(day) {
    const list = S.workouts.filter((w) => w.day === day && doneSets(w) > 0).sort((a, b) => b.date.localeCompare(a.date));
    return list[0];
  }

  // ---------- Statistik ----------
  function bestBefore(exId, workout, setIdx, entryIdx) {
    let best = 0, had = false;
    for (const w of S.workouts) {
      for (let ei = 0; ei < w.entries.length; ei++) {
        const e = w.entries[ei];
        if (e.ex !== exId) continue;
        for (let si = 0; si < e.sets.length; si++) {
          const s = e.sets[si];
          if (!s.done) continue;
          if (w === workout && (ei > entryIdx || (ei === entryIdx && si >= setIdx))) continue;
          if (w !== workout && (w.date > workout.date)) continue;
          had = true;
          best = Math.max(best, e1rm(s.w, s.r));
        }
      }
    }
    return { best, had };
  }

  function stats() {
    const st = { workouts: 0, bestWeight: {}, bestReps: {}, totalVolume: 0, maxSessionVolume: 0, prs: 0, maxPrsInSession: 0,
      early: false, night: false, streakWeeks: 0, maxWeek: 0, bodyweight: S.profile ? S.profile.weight : 0, foodDays: 0, weightStreak: 0 };
    const weeks = {};
    for (const w of S.workouts) {
      if (doneSets(w) === 0) continue;
      st.workouts++;
      let vol = 0, prs = 0;
      for (const e of w.entries) for (const s of e.sets) {
        if (!s.done) continue;
        if (s.r > 0) st.bestWeight[e.ex] = Math.max(st.bestWeight[e.ex] || 0, s.w);
        st.bestReps[e.ex] = Math.max(st.bestReps[e.ex] || 0, s.r);
        vol += s.w * s.r;
        if (s.pr) prs++;
      }
      st.totalVolume += vol;
      st.maxSessionVolume = Math.max(st.maxSessionVolume, vol);
      st.prs += prs;
      st.maxPrsInSession = Math.max(st.maxPrsInSession, prs);
      if (w.live && w.start) {
        const h = new Date(w.start).getHours();
        if (h < 7) st.early = true;
        if (h >= 22) st.night = true;
      }
      const wk = mondayOf(w.date);
      weeks[wk] = (weeks[wk] || 0) + 1;
    }
    const keys = Object.keys(weeks).sort();
    for (const k of keys) st.maxWeek = Math.max(st.maxWeek, weeks[k]);
    if (keys.length) {
      let run = 0, best = 0, cur = keys[0];
      const end = mondayOf(today());
      while (cur <= end) {
        if ((weeks[cur] || 0) >= 2) { run++; best = Math.max(best, run); } else run = 0;
        cur = addDays(cur, 7);
      }
      st.streakWeeks = best;
    }
    st.foodDays = Object.keys(S.kcal).filter((d) => (S.kcal[d] || []).length).length;
    let run = 0, best = 0, prev = null;
    for (const d of Object.keys(S.weights).sort()) {
      run = prev && addDays(prev, 1) === d ? run + 1 : 1;
      best = Math.max(best, run);
      prev = d;
    }
    st.weightStreak = best;
    return st;
  }

  // ---------- Abzeichen ----------
  const celebrateQueue = [];
  function checkBadges(silent) {
    const st = stats();
    let changed = false;
    for (const b of window.BADGES) {
      if (S.earned[b.id]) continue;
      if (b.prog(st) >= 1) {
        S.earned[b.id] = today();
        changed = true;
        if (!silent) celebrateQueue.push(b);
      }
    }
    if (changed) save();
    if (!silent) showNextCelebration();
  }
  function showNextCelebration() {
    const el = $("#celebrate");
    if (!el.classList.contains("hidden") || !celebrateQueue.length) return;
    const b = celebrateQueue.shift();
    let conf = "";
    const colors = ["#FFE68A", "#D4A22A", "#FFF1B8", "#B8860B", "#95A3EC"];
    for (let i = 0; i < 40; i++) {
      conf += `<i class="confetti" style="left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-duration:${2.5 + Math.random() * 2.5}s;animation-delay:${Math.random() * 0.8}s;transform:rotate(${Math.random() * 360}deg)"></i>`;
    }
    el.innerHTML = `<div class="rays"></div>${conf}
      <div class="medal-xl gold-bg shine">${b.icon}</div>
      <div class="kicker gold-text">Abzeichen freigeschaltet</div>
      <h1>${esc(b.name)}</h1>
      <p>${esc(b.desc)}</p>
      ${b.pct ? `<div class="pct gold-text">${esc(b.pct)}</div>` : ""}
      <button class="btn primary" data-act="celebrate-close">Weiter</button>`;
    el.classList.remove("hidden");
  }

  // ---------- Toast ----------
  let toastT;
  function toast(msg, gold) {
    const el = $("#toast");
    el.textContent = msg;
    el.className = "toast" + (gold ? " gold" : "");
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.add("hidden"), 2600);
  }

  // ---------- Pausentimer ----------
  const T = { end: 0, running: false, doneAt: 0 };
  function startTimer(sec) {
    T.end = Date.now() + sec * 1000;
    T.running = true;
    T.doneAt = 0;
    $("#timer").classList.remove("hidden", "done");
    tick();
  }
  function stopTimer() {
    T.running = false;
    $("#timer").classList.add("hidden");
  }
  function tick() {
    if (T.running) {
      const left = Math.max(0, Math.round((T.end - Date.now()) / 1000));
      $("#timer-time").textContent = Math.floor(left / 60) + ":" + pad(left % 60);
      if (left <= 0 && !T.doneAt) {
        T.doneAt = Date.now();
        $("#timer").classList.add("done");
        $("#timer-time").textContent = "Los";
        const f = $("#flash");
        f.classList.remove("go"); void f.offsetWidth; f.classList.add("go");
      }
      if (T.doneAt && Date.now() - T.doneAt > 4000) stopTimer();
    }
    const el = $("#elapsed");
    const w = activeWorkout();
    if (el && w && w.live) {
      const m = Math.floor((Date.now() - w.start) / 60000);
      el.textContent = m + " min";
    }
  }
  setInterval(tick, 500);

  // ---------- Bildschirm an lassen ----------
  let wakeLock = null;
  async function updateWakeLock() {
    const want = !!activeWorkout() && document.visibilityState === "visible";
    try {
      if (want && !wakeLock && "wakeLock" in navigator) {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => { wakeLock = null; });
      } else if (!want && wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
    } catch (e) { wakeLock = null; }
  }
  document.addEventListener("visibilitychange", updateWakeLock);

  // ---------- Navigation ----------
  let tab = S.active ? "training" : "home";
  let calMonth = today().slice(0, 7);
  let foodDate = today();
  let progEx = null, progMetric = "e1rm", selWeek = null, weeksScroll = null;
  let pickDay = null, pickDate = null;
  let addMuscle = null;

  function render() {
    const view = $("#view");
    const tabbar = $(".tabbar");
    if (!S.profile) {
      tabbar.classList.add("hidden");
      view.innerHTML = viewOnboarding();
      return;
    }
    tabbar.classList.remove("hidden");
    document.querySelectorAll(".tabbar button").forEach((b) => b.classList.toggle("on", b.dataset.nav === tab));
    $(".tab-main").classList.toggle("live", !!S.active);
    const oldWk = $("#weeks");
    if (oldWk && tab === "progress") weeksScroll = oldWk.scrollLeft;
    view.innerHTML = { home: viewHome, calendar: viewCalendar, training: viewTraining, food: viewFood, progress: viewProgress }[tab]();
    if (tab === "progress") {
      drawChart();
      const wk = $("#weeks");
      if (wk) wk.scrollLeft = weeksScroll == null ? wk.scrollWidth : weeksScroll;
    }
    if (tab === "food") drawWeightChart();
    tick();
    updateWakeLock();
  }
  function go(t) { tab = t; weeksScroll = null; selWeek = null; window.scrollTo(0, 0); render(); }

  // ---------- Profil ----------
  function profileForm(p, submitLabel) {
    p = p || { name: "", sex: "m", age: "", height: "", weight: "", activity: 1.55 };
    const acts = [[1.2, "Wenig Bewegung (Büro, kaum Sport)"], [1.375, "Leicht aktiv (1–3× Training/Woche)"], [1.55, "Aktiv (3–5× Training/Woche)"], [1.725, "Sehr aktiv (6–7× Training oder körperliche Arbeit)"], [1.9, "Extrem aktiv (harte körperliche Arbeit + Training)"]];
    return `<form id="profile-form">
      <label class="field"><span>Dein Name</span><input class="input" name="name" value="${esc(p.name)}" placeholder="Albi" autocomplete="given-name"></label>
      <div class="field"><span>Geschlecht</span>
        <div class="seg" data-seg="sex"><button type="button" data-v="m" class="${p.sex === "m" ? "on" : ""}">Männlich</button><button type="button" data-v="f" class="${p.sex === "f" ? "on" : ""}">Weiblich</button></div>
        <input type="hidden" name="sex" value="${esc(p.sex)}">
      </div>
      <div class="grid2">
        <label class="field"><span>Alter</span><input class="input" name="age" inputmode="numeric" value="${esc(p.age)}" placeholder="25"></label>
        <label class="field"><span>Größe (cm)</span><input class="input" name="height" inputmode="numeric" value="${esc(p.height)}" placeholder="180"></label>
      </div>
      <label class="field"><span>Gewicht (kg)</span><input class="input" name="weight" inputmode="decimal" value="${esc(p.weight)}" placeholder="80"></label>
      <label class="field"><span>Aktivität im Alltag</span><select class="input" name="activity">
        ${acts.map(([v, l]) => `<option value="${v}" ${Number(p.activity) === v ? "selected" : ""}>${l}</option>`).join("")}
      </select></label>
      <button class="btn primary block" type="submit">${submitLabel}</button>
    </form>`;
  }
  function readProfile(form) {
    const fd = new FormData(form);
    const p = { name: String(fd.get("name") || "").trim(), sex: fd.get("sex") === "f" ? "f" : "m", age: num(fd.get("age")), height: num(fd.get("height")), weight: num(fd.get("weight")), activity: num(fd.get("activity")) || 1.55 };
    if (!p.name || p.age < 10 || p.height < 100 || p.weight < 30) { toast("Bitte alle Felder ausfüllen"); return null; }
    return p;
  }
  function viewOnboarding() {
    return `<div class="head"><div><p class="sub">Willkommen</p><h1>Los geht's</h1></div></div>
      <div class="tile"><p class="muted small" style="margin-top:0">Mit diesen Angaben rechnet die App deine Tagesziele für Kalorien und Protein aus. Alles bleibt nur auf deinem Handy.</p>
      ${profileForm(null, "Starten")}</div>`;
  }

  // ---------- Start ----------
  function viewHome() {
    const t = targets(), eaten = kcalOf(today()), left = t.k - eaten;
    const wNow = weightOn(today()), ws = weightSeries();
    const wBefore = ws.filter((p) => p.date <= addDays(today(), -7)).pop();
    const wToday = S.weights[today()];
    const nd = S.active ? (activeWorkout() || {}).day : nextDay();
    const last = lastOfDay(nd);
    const h = new Date().getHours();
    const greet = h < 11 ? "Guten Morgen" : h < 17 ? "Hallo" : "Guten Abend";
    const wk = mondayOf(today());
    const count = S.workouts.filter((w) => doneSets(w) > 0 && mondayOf(w.date) === wk).length;
    let dots = "";
    for (let i = 0; i < 5; i++) dots += `<i class="${i < count ? "on" : ""}"></i>`;
    const st = stats();
    const next = window.BADGES.filter((b) => !b.secret && !S.earned[b.id]).map((b) => ({ b, p: b.prog(st) })).sort((a, b) => b.p - a.p)[0];
    let nextTxt = "";
    if (next) {
      nextTxt = next.b.desc;
      const m = next.b.id.match(/^(bp|sq|dl)(\d+)$/);
      if (m) {
        const ex = { bp: "bankdruecken", sq: "kniebeuge", dl: "kreuzheben" }[m[1]];
        const rest = Number(m[2]) - (st.bestWeight[ex] || 0);
        nextTxt = `Noch ${fmt(rest)} kg ${{ bp: "Bankdrücken", sq: "Kniebeuge", dl: "Kreuzheben" }[m[1]]}`;
      }
    }
    return `
      <div class="head">
        <div><p class="sub">${longDate(today())}</p><h1>${greet}, ${esc(S.profile.name)}</h1></div>
        <button class="icon-btn" data-act="settings" aria-label="Einstellungen"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></button>
      </div>
      <div class="tile tap" data-nav="training" style="margin-bottom:12px">
        <p class="label">${S.active ? "Training läuft" : "Heute dran"}</p>
        <p class="big">Tag ${nd}: ${esc(window.DAYS[nd].name)}</p>
        <p class="muted small" style="margin:4px 0 0">${S.active ? "Tippen, um weiterzumachen" : last ? "Zuletzt am " + longDate(last.date) : "Noch nie trainiert – leg los"}</p>
      </div>
      <div class="grid2">
        <div class="tile tap" data-nav="food">
          <p class="label">Kalorien</p>
          <p class="big">${fmt0(Math.abs(left))}</p>
          <p class="muted small" style="margin:0">${left >= 0 ? "noch übrig" : "über dem Ziel"} · Ziel ${fmt0(t.k)}</p>
          <div class="bar"><div style="width:${Math.min(100, (eaten / t.k) * 100)}%"></div></div>
        </div>
        <div class="tile tap" data-nav="food">
          <p class="label">Gewicht</p>
          <p class="big">${fmt(wNow)} kg</p>
          <p class="muted small" style="margin:0">${wToday == null ? "Heute noch nicht eingetragen" : wBefore ? fmtSigned(wToday - wBefore.v) + " kg seit " + shortDate(wBefore.date) : "Heute eingetragen"}</p>
        </div>
        <div class="tile tap" data-nav="calendar">
          <p class="label">Diese Woche</p>
          <div class="week">${dots}</div>
          <p class="muted small" style="margin:8px 0 0">${count} von 5 Trainings</p>
        </div>
        <div class="tile tap gold-border" data-nav="progress">
          ${next ? `<p class="label gold-text">Nächstes Abzeichen</p>
          <p style="margin:0;font-weight:700">${next.b.icon} ${esc(next.b.name)}</p>
          <p class="muted small" style="margin:4px 0 0">${esc(nextTxt)}</p>` : `<p class="label gold-text">Abzeichen</p><p style="margin:0;font-weight:700">Alle geschafft 👑</p>`}
        </div>
      </div>`;
  }

  // ---------- Training ----------
  function viewTraining() {
    const w = activeWorkout();
    if (!w) {
      const d = pickDay || nextDay();
      const date = pickDate || today();
      return `<div class="head"><div><p class="sub">Neues Training</p><h1>Training</h1></div></div>
        <div class="tile">
          <p class="label">Welcher Tag?</p>
          <div class="day-pick">
            ${["A", "B", "C"].map((k) => `<button data-act="pick-day" data-day="${k}" class="${k === d ? "on" : ""}"><b>${k}</b><small>${esc(window.DAYS[k].short)}</small></button>`).join("")}
          </div>
          <label class="field" style="margin-top:16px"><span>Datum</span><input class="input" type="date" id="pick-date" value="${date}" max="${today()}"></label>
          <button class="btn primary block" data-act="start-workout">Training starten</button>
        </div>
        <p class="muted small" style="text-align:center;margin-top:14px">Als Nächstes in deinem Plan: Tag ${nextDay()}</p>`;
    }
    const day = window.DAYS[w.day];
    const isPast = w.date !== today();
    const muscles = window.MUSCLES;
    const todays = muscles.filter((m) => m.day === w.day);
    const others = muscles.filter((m) => m.day !== w.day);
    if (!addMuscle || !muscles.find((m) => m.id === addMuscle)) addMuscle = todays[0].id;
    const exOpts = allExercises().filter((e) => e.m === addMuscle);

    const cards = w.entries.map((e, ei) => {
      const ex = exById(e.ex);
      const prev = lastPerformance(e.ex, w);
      const best = bestSetBefore(e.ex, w);
      const hint = [best ? "Bestwert " + setTxt(best) : "", prev ? "Letztes Mal am " + shortDate(prev.date) : ""].filter(Boolean).join(" · ");
      const rows = e.sets.map((s, si) => {
        const ps = prev && prev.sets[si];
        return `
        <div class="set-row">
          <div class="n">${si + 1}</div>
          ${stepper(ei, si, "w", s.w, "kg")}
          ${stepper(ei, si, "r", s.r, "Wdh")}
          <button class="check ${s.done ? (s.pr ? "pr" : "done") : ""}" data-act="set-done" data-ei="${ei}" data-si="${si}" aria-label="Satz ${si + 1} erledigt"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>
          ${ps ? `<div class="set-prev">zuletzt ${setTxt(ps)}</div>` : ""}
        </div>`;
      }).join("");
      return `<div class="tile ex-card" style="margin-bottom:12px">
        <div class="spread"><div><h3>${esc(ex.name)}</h3><div class="last-hint">${hint ? esc(hint) : esc(muscleName(ex.m)) + " · zum ersten Mal"}</div></div>
          <button class="icon-btn" data-act="ex-remove" data-ei="${ei}" aria-label="Übung entfernen"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
        <div class="set-head"><span>Satz</span><span>Gewicht</span><span>Wdh.</span><span></span></div>
        ${rows}
        <div class="spread" style="margin-top:12px">
          <button class="link" data-act="set-add" data-ei="${ei}">+ Satz hinzufügen</button>
          ${e.sets.length > 1 ? `<button class="link" style="color:var(--text-3)" data-act="set-remove" data-ei="${ei}">Letzten Satz löschen</button>` : ""}
        </div>
      </div>`;
    }).join("");

    return `<div class="head"><div><p class="sub">${isPast ? longDate(w.date) + " · nachtragen" : "Läuft seit <span id=\"elapsed\">…</span>"}</p><h1>Tag ${w.day}</h1><p class="muted" style="margin:2px 0 0">${esc(day.name)}</p></div></div>
      ${cards || `<div class="tile empty" style="margin-bottom:12px">Wähle unten deine erste Übung.</div>`}
      <div class="tile">
        <p class="label">Übung hinzufügen</p>
        <label class="field"><span>Muskel</span><select class="input" id="add-muscle">
          <optgroup label="Heute (Tag ${w.day})">${todays.map((m) => `<option value="${m.id}" ${m.id === addMuscle ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</optgroup>
          <optgroup label="Weitere">${others.map((m) => `<option value="${m.id}" ${m.id === addMuscle ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</optgroup>
        </select></label>
        <label class="field"><span>Übung</span><select class="input" id="add-ex">
          ${exOpts.map((e) => `<option value="${e.id}">${esc(e.name)}</option>`).join("")}
        </select></label>
        <button class="btn block" data-act="ex-add">+ Hinzufügen</button>
      </div>
      <button class="btn primary block" style="margin-top:18px" data-act="finish-workout">${isPast ? "Fertig" : "Training beenden"}</button>`;
  }
  function stepper(ei, si, field, val, unit) {
    const d = field === "w" ? 2.5 : 1;
    return `<div class="stepper">
      <button data-act="step" data-ei="${ei}" data-si="${si}" data-f="${field}" data-d="${-d}" aria-label="weniger">−</button>
      <input inputmode="decimal" data-ei="${ei}" data-si="${si}" data-f="${field}" value="${val ? fmt(val) : ""}" placeholder="0" aria-label="${unit}">
      <button data-act="step" data-ei="${ei}" data-si="${si}" data-f="${field}" data-d="${d}" aria-label="mehr">+</button>
    </div>`;
  }
  // Sätze vom letzten Training mit dieser Übung (vor dem aktuellen)
  function lastPerformance(exId, current) {
    const list = S.workouts.filter((w) => w !== current && w.date <= current.date).sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
    for (const w of list) {
      const sets = w.entries.filter((x) => x.ex === exId).flatMap((e) => e.sets.filter((s) => s.done));
      if (sets.length) return { date: w.date, sets };
    }
    return null;
  }
  // schwerster Satz aller früheren Trainings
  function bestSetBefore(exId, current) {
    let best = null;
    for (const w of S.workouts) {
      if (w === current || w.date > current.date) continue;
      for (const e of w.entries) {
        if (e.ex !== exId) continue;
        for (const s of e.sets) {
          if (!s.done) continue;
          if (!best || s.w > best.w || (s.w === best.w && s.r > best.r)) best = s;
        }
      }
    }
    return best;
  }
  function markPR(w, ei, si) {
    const e = w.entries[ei], s = e.sets[si];
    s.pr = false;
    if (!s.done || s.w <= 0 || s.r <= 0) return false;
    const { best, had } = bestBefore(e.ex, w, si, ei);
    if (had && e1rm(s.w, s.r) > best + 0.01) { s.pr = true; return true; }
    return false;
  }

  // ---------- Kalender ----------
  function viewCalendar() {
    const [y, m] = calMonth.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const startOff = (first.getDay() + 6) % 7;
    const start = new Date(y, m - 1, 1 - startOff);
    const byDate = {};
    for (const w of S.workouts) {
      if (doneSets(w) === 0) continue;
      const o = byDate[w.date] || (byDate[w.date] = { pr: false });
      if (w.entries.some((e) => e.sets.some((s) => s.done && s.pr))) o.pr = true;
    }
    let cells = WD.map((d) => `<div class="wd">${d}</div>`).join("");
    const t = today();
    const daysInMonth = new Date(y, m, 0).getDate();
    const cellCount = Math.ceil((startOff + daysInMonth) / 7) * 7;
    for (let i = 0; i < cellCount; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const ds = dstr(d);
      const info = byDate[ds];
      const cls = ["d", d.getMonth() !== m - 1 ? "other" : "", ds === t ? "today" : "", info && info.pr ? "pr" : ""].join(" ");
      cells += `<button class="${cls}" data-act="cal-day" data-date="${ds}"><span>${d.getDate()}</span>${info ? '<i class="dot"></i>' : '<i class="dot food"></i>'}</button>`;
    }
    const monthCount = Object.keys(byDate).filter((d) => d.startsWith(calMonth)).length;
    return `<div class="head"><div><p class="sub">Dein Verlauf</p><h1>Kalender</h1></div></div>
      <div class="tile">
        <div class="cal-head">
          <button class="icon-btn" data-act="cal-prev" aria-label="Vorheriger Monat"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
          <b>${MONTHS[m - 1]} ${y}</b>
          <button class="icon-btn" data-act="cal-next" aria-label="Nächster Monat"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>
        </div>
        <div class="cal">${cells}</div>
      </div>
      <p class="muted small" style="text-align:center;margin-top:14px">${monthCount} Trainings in diesem Monat · goldener Rand = neuer Rekord</p>`;
  }
  function daySheet(date) {
    const ws = S.workouts.filter((w) => w.date === date && doneSets(w) > 0);
    const eaten = kcalOf(date), wDay = S.weights[date];
    const hasFood = eaten > 0 || wDay != null;
    let html = `<h2>${longDate(date)}</h2>`;
    if (!ws.length) html += `<div class="empty">An diesem Tag hast du kein Training eingetragen.</div>`;
    for (const w of ws) {
      html += `<div class="tile" style="margin-bottom:12px"><div class="spread"><p class="label" style="margin:0">Tag ${w.day} · ${esc(window.DAYS[w.day].name)}</p></div><div style="margin-top:10px">`;
      html += w.entries.filter((e) => e.sets.some((s) => s.done)).map((e) => `<div class="entry"><b>${esc(exById(e.ex).name)}</b><div class="sets">${e.sets.filter((s) => s.done).map((s) => `<span class="chip ${s.pr ? "gold" : ""}">${s.pr ? "🏆 " : ""}${fmt(s.w)} kg × ${s.r}</span>`).join("")}</div></div>`).join("");
      html += `</div><div class="row" style="margin-top:12px"><button class="btn small" data-act="edit-workout" data-id="${w.id}">Bearbeiten</button><button class="btn small danger" data-act="delete-workout" data-id="${w.id}">Löschen</button></div></div>`;
    }
    if (hasFood) html += `<div class="tile"><p class="label">Gewicht &amp; Kalorien</p><p style="margin:0">${wDay != null ? `<b>${fmt(wDay)} kg</b>` : ""}${wDay != null && eaten ? " · " : ""}${eaten ? `<b>${fmt0(eaten)} kcal</b> <span class="muted">von ${fmt0(targets(weightOn(date)).k)}</span>` : ""}</p></div>`;
    if (!ws.length && date <= today()) html += `<button class="btn primary block" style="margin-top:12px" data-act="backfill" data-date="${date}">Training nachtragen</button>`;
    openSheet(html);
  }

  // ---------- Fortschritt ----------
  function exercisesWithData() {
    const ids = new Set();
    for (const w of S.workouts) for (const e of w.entries) if (e.sets.some((s) => s.done && s.w > 0)) ids.add(e.ex);
    return [...ids].map(exById).sort((a, b) => a.name.localeCompare(b.name));
  }
  function seriesFor(exId, metric) {
    const pts = [];
    const ws = S.workouts.filter((w) => doneSets(w) > 0).sort((a, b) => a.date.localeCompare(b.date));
    for (const w of ws) {
      let v = 0, any = false;
      for (const e of w.entries) {
        if (e.ex !== exId) continue;
        for (const s of e.sets) {
          if (!s.done) continue;
          any = true;
          if (metric === "e1rm") v = Math.max(v, e1rm(s.w, s.r));
          else if (metric === "max") v = Math.max(v, s.w);
          else v += s.w * s.r;
        }
      }
      if (any && v > 0) pts.push({ date: w.date, v });
    }
    return pts;
  }
  // Wochen: von der ersten Trainingswoche (mind. 8 Wochen zurück) bis heute
  function weekList() {
    const weeks = {};
    for (const w of S.workouts) {
      if (!doneSets(w)) continue;
      const k = mondayOf(w.date);
      const o = weeks[k] || (weeks[k] = { n: 0, sets: 0, vol: 0, ex: {} });
      o.n++;
      for (const e of w.entries) for (const s of e.sets) {
        if (!s.done) continue;
        o.sets++; o.vol += s.w * s.r;
        const x = o.ex[e.ex] || (o.ex[e.ex] = { w: 0, r: 0, e: 0 });
        if (s.w > x.w || (s.w === x.w && s.r > x.r)) { x.w = s.w; x.r = s.r; }
        x.e = Math.max(x.e, e1rm(s.w, s.r));
      }
    }
    const cur = mondayOf(today());
    const first = Object.keys(weeks).sort()[0];
    let k = first && first < addDays(cur, -49) ? first : addDays(cur, -49);
    const list = [];
    while (k <= cur) { list.push(Object.assign({ key: k }, weeks[k] || { n: 0, sets: 0, vol: 0, ex: {} })); k = addDays(k, 7); }
    return list;
  }
  const isoWeek = (s) => {
    const d = parseD(s); d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    const y1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d - y1) / 864e5 - 3 + (y1.getDay() + 6) % 7) / 7);
  };
  const weekName = (k) => k === mondayOf(today()) ? "Diese Woche" : k === addDays(mondayOf(today()), -7) ? "Letzte Woche" : "KW " + isoWeek(k);
  const fmtVol = (v) => v >= 1000 ? fmt(v / 1000) + " t" : fmt0(v) + " kg";
  function deltaPill(cur, prev, fmtFn, unit) {
    const d = Math.round((cur - prev) * 10) / 10;
    if (Math.abs(d) < 0.05) return `<span class="delta">± 0</span>`;
    return `<span class="delta ${d > 0 ? "up" : "down"}">${d > 0 ? "▲ +" : "▼ −"}${fmtFn(Math.abs(d))}${unit || ""}</span>`;
  }
  function setTxt(x) { return x.w > 0 ? `${fmt(x.w)} kg × ${x.r}` : `${x.r} Wdh.`; }
  function exDelta(cur, prev) {
    if (cur.w > 0 || prev.w > 0) {
      if (Math.abs(cur.w - prev.w) >= 0.05) return deltaPill(cur.w, prev.w, fmt, " kg");
      return deltaPill(cur.r, prev.r, fmt0, " Wdh.");
    }
    return deltaPill(cur.r, prev.r, fmt0, " Wdh.");
  }
  function weeksPart() {
    const list = weekList();
    if (!selWeek || !list.find((x) => x.key === selWeek)) selWeek = list[list.length - 1].key;
    const i = list.findIndex((x) => x.key === selWeek);
    const cur = list[i], prev = list[i - 1] || { key: addDays(cur.key, -7), n: 0, sets: 0, vol: 0, ex: {} };
    const maxV = Math.max(1, ...list.map((x) => x.vol));
    const bars = list.map((x) => {
      const h = x.n ? Math.max(6, Math.round((x.vol / maxV) * 120)) : 0;
      const cls = x.key === cur.key ? "on" : x.key === prev.key ? "ref" : "";
      return `<button class="wk ${cls}" data-act="week" data-k="${x.key}" aria-label="${weekName(x.key)}: ${fmtVol(x.vol)}, ${x.n} Trainings">
        <span class="val">${x.n ? fmtVol(x.vol).replace(" ", " ") : ""}</span>
        <span class="col"><i style="height:${h}px"></i></span>
        <span class="dots">${"<b></b>".repeat(Math.min(x.n, 7))}</span>
        <span class="lb">KW ${isoWeek(x.key)}</span>
      </button>`;
    }).join("");
    const box = (label, a, b, fmtFn, unit) => `<div><p class="label" style="margin:0">${label}</p>
      <p class="v">${fmtFn(a)}${unit}</p>${deltaPill(a, b, fmtFn, unit)}<p class="muted small" style="margin:4px 0 0">vorher ${fmtFn(b)}${unit}</p></div>`;
    // Übungen der gewählten Woche mit dem letzten Mal davor vergleichen
    const rows = Object.keys(cur.ex).map((id) => {
      const c = cur.ex[id];
      let p = null, pk = null;
      for (let j = i - 1; j >= 0; j--) if (list[j].ex[id]) { p = list[j].ex[id]; pk = list[j].key; break; }
      return { name: exById(id).name, c, p, pk };
    }).sort((a, b) => a.name.localeCompare(b.name));
    const rowHtml = rows.map((r) => `<div class="cmp-row">
        <div style="min-width:0"><b>${esc(r.name)}</b><div class="muted small">${r.p ? (r.pk === prev.key ? "Vorwoche" : weekName(r.pk)) + ": " + setTxt(r.p) : "Zum ersten Mal"}</div></div>
        <div style="text-align:right;white-space:nowrap"><b>${setTxt(r.c)}</b><div>${r.p ? exDelta(r.c, r.p) : `<span class="delta">neu</span>`}</div></div>
      </div>`).join("");
    return `<div class="tile">
        <div class="spread"><p class="label" style="margin:0">Wochenvergleich</p><span class="muted small">${weekName(cur.key)} vs. ${weekName(prev.key)}</span></div>
        <div class="weeks" id="weeks">${bars}</div>
        <p class="muted small" style="margin:6px 0 0;text-align:center">Balken = bewegtes Gewicht · Punkte = Trainings · Woche antippen, nach links wischen für ältere</p>
        <div class="cmp3">
          ${box("Trainings", cur.n, prev.n, fmt0, "")}
          ${box("Sätze", cur.sets, prev.sets, fmt0, "")}
          ${box("Bewegt", cur.vol / 1000, prev.vol / 1000, fmt, " t")}
        </div>
      </div>
      <h2>Übungen · ${weekName(cur.key)} <span class="muted" style="font-weight:500;font-size:15px">${shortDate(cur.key)}–${shortDate(addDays(cur.key, 6))}</span></h2>
      <div class="tile">${rowHtml || `<div class="empty">In dieser Woche hast du noch nicht trainiert.</div>`}</div>`;
  }

  function viewProgress() {
    const exs = exercisesWithData();
    if (!progEx || !exs.find((e) => e.id === progEx)) progEx = exs[0] ? exs[0].id : null;
    const st = stats();
    const earnedCount = window.BADGES.filter((b) => S.earned[b.id]).length;
    let chartPart;
    if (!progEx) {
      chartPart = `<div class="tile empty">Sobald du Trainings eingetragen hast, siehst du hier deine Kurven.</div>`;
    } else {
      const pts = seriesFor(progEx, "e1rm");
      const bestE = Math.max(...pts.map((p) => p.v), 0);
      chartPart = `<h2>Verlauf pro Übung</h2><div class="tile">
        <label class="field"><span>Übung</span><select class="input" id="prog-ex">${exs.map((e) => `<option value="${e.id}" ${e.id === progEx ? "selected" : ""}>${esc(e.name)}</option>`).join("")}</select></label>
        <div class="seg" data-seg="metric">
          <button data-v="e1rm" class="${progMetric === "e1rm" ? "on" : ""}">Max. (1RM)</button>
          <button data-v="max" class="${progMetric === "max" ? "on" : ""}">Gewicht</button>
          <button data-v="vol" class="${progMetric === "vol" ? "on" : ""}">Volumen</button>
        </div>
        <svg class="chart" id="chart" style="margin-top:14px"></svg>
        <div class="grid2" style="margin-top:8px">
          <div><p class="label">Bestes Gewicht</p><p class="big">${fmt(st.bestWeight[progEx] || 0)} kg</p></div>
          <div><p class="label">Max. geschätzt (1RM)</p><p class="big">${fmt(bestE)} kg</p></div>
        </div>
      </div>`;
    }
    const visible = window.BADGES.map((b) => {
      const got = !!S.earned[b.id];
      if (b.secret && !got) return `<button class="badge" data-act="badge" data-id="${b.id}"><div class="medal locked">?</div><b>Geheim</b><small>Überraschung</small></button>`;
      const p = b.prog(st);
      return `<button class="badge" data-act="badge" data-id="${b.id}">
        <div class="medal ${got ? "gold-bg shine" : "locked"}">${b.icon}</div>
        <b>${esc(b.name)}</b>
        ${got ? `<small class="gold-text">Geschafft</small>` : `<div class="mini-bar"><div style="width:${Math.round(p * 100)}%"></div></div>`}
      </button>`;
    }).join("");
    return `<div class="head"><div><p class="sub">Dein Fortschritt</p><h1>Erfolge</h1></div></div>
      ${weeksPart()}
      ${chartPart}
      <div class="grid2" style="margin-top:12px">
        <div class="tile"><p class="label">Trainings</p><p class="big">${st.workouts}</p></div>
        <div class="tile"><p class="label">Rekorde</p><p class="big gold-text">${st.prs}</p></div>
      </div>
      <h2>Abzeichen <span class="muted" style="font-weight:500;font-size:15px">${earnedCount} von ${window.BADGES.length}</span></h2>
      <div class="badges">${visible}</div>`;
  }
  function drawChart() {
    if (progEx) lineChart($("#chart"), seriesFor(progEx, progMetric), true);
  }
  function drawWeightChart() {
    lineChart($("#wchart"), weightSeries().slice(-90), false);
  }
  function lineChart(svg, pts, markBest) {
    if (!svg) return;
    const W = svg.clientWidth || 320, H = 220, pl = 40, pr = 12, pt = 14, pb = 26;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    if (pts.length === 0) { svg.innerHTML = ""; return; }
    let min = Math.min(...pts.map((p) => p.v)), max = Math.max(...pts.map((p) => p.v));
    if (min === max) { min = min * 0.9; max = max * 1.1 || 1; }
    const padv = (max - min) * 0.15; min = Math.max(0, min - padv); max += padv;
    const axis = max - min < 10 ? fmt : fmt0;
    const x = (i) => pts.length === 1 ? pl + (W - pl - pr) / 2 : pl + (i / (pts.length - 1)) * (W - pl - pr);
    const y = (v) => pt + (1 - (v - min) / (max - min)) * (H - pt - pb);
    let grid = "";
    for (let i = 0; i <= 3; i++) {
      const v = min + ((max - min) * i) / 3, yy = y(v);
      grid += `<line x1="${pl}" x2="${W - pr}" y1="${yy}" y2="${yy}" stroke="rgba(149,163,236,.15)"/><text x="${pl - 6}" y="${yy + 4}" text-anchor="end">${axis(v)}</text>`;
    }
    const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.v)}`).join(" ");
    const area = `${line} L${x(pts.length - 1)},${H - pb} L${x(0)},${H - pb} Z`;
    const bestI = markBest ? pts.reduce((bi, p, i) => (p.v >= pts[bi].v ? i : bi), 0) : -1;
    const lbl = (i) => { const d = parseD(pts[i].date); return d.getDate() + "." + (d.getMonth() + 1) + "."; };
    const labels = pts.length > 1 ? `<text x="${x(0)}" y="${H - 6}" text-anchor="start">${lbl(0)}</text><text x="${x(pts.length - 1)}" y="${H - 6}" text-anchor="end">${lbl(pts.length - 1)}</text>` : `<text x="${x(0)}" y="${H - 6}" text-anchor="middle">${lbl(0)}</text>`;
    svg.innerHTML = `<defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#95A3EC" stop-opacity=".45"/><stop offset="1" stop-color="#95A3EC" stop-opacity="0"/></linearGradient>
      <linearGradient id="gg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#B8860B"/><stop offset=".5" stop-color="#FFE68A"/><stop offset="1" stop-color="#D4A22A"/></linearGradient></defs>
      ${grid}<path d="${area}" fill="url(#ga)"/><path d="${line}" fill="none" stroke="#95A3EC" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
      ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.v)}" r="${i === bestI ? 7 : 4}" fill="${i === bestI ? "url(#gg)" : "#1A1E3A"}" stroke="${i === bestI ? "#FFF1B8" : "#95A3EC"}" stroke-width="2"/>`).join("")}
      ${labels}`;
  }
  function badgeSheet(id) {
    const b = window.BADGES.find((x) => x.id === id);
    if (!b) return;
    const got = S.earned[b.id];
    if (b.secret && !got) { openSheet(`<h2>Geheimes Abzeichen</h2><p class="muted">Dieses Abzeichen bleibt eine Überraschung. Trainiere weiter, vielleicht schaltest du es bald frei.</p>`); return; }
    const p = b.prog(stats());
    openSheet(`<div style="text-align:center">
      <div class="medal-xl ${got ? "gold-bg shine" : ""}" style="width:110px;height:110px;border-radius:50%;margin:6px auto 14px;display:flex;align-items:center;justify-content:center;font-size:50px;${got ? "border:3px solid #FFF3C4" : "background:rgba(60,71,114,.6);filter:grayscale(1)"}">${b.icon}</div>
      <h2 style="margin-bottom:4px">${esc(b.name)}</h2>
      <p class="muted" style="margin:0">${esc(b.desc)}</p>
      ${got ? `<p class="gold-text" style="font-weight:700">Geschafft am ${longDate(got)}</p>` : `<div class="bar" style="margin:16px auto 6px;max-width:240px"><div style="width:${Math.round(p * 100)}%"></div></div><p class="small muted">${Math.round(p * 100)} %</p>`}
      ${b.pct ? `<p style="font-weight:700;margin-top:16px">${esc(b.pct)} <button class="info-btn" data-act="info" data-kind="${b.kind}" aria-label="Wie wird das berechnet?">i</button></p><p id="info-text" class="small muted hidden" style="text-align:left"></p>` : ""}
    </div>`);
  }

  // ---------- Gewicht & Kalorien ----------
  function viewFood() {
    const isToday = foodDate === today();
    const wt = weightOn(foodDate);
    const t = targets(wt);
    const eaten = kcalOf(foodDate);
    const left = t.k - eaten;
    const entries = S.kcal[foodDate] || [];
    const wDay = S.weights[foodDate];
    const R = 80, C = 2 * Math.PI * R, frac = Math.min(1, eaten / t.k);
    const ws = weightSeries();
    const before = ws.filter((p) => p.date <= addDays(foodDate, -7)).pop();
    const lastBefore = ws.filter((p) => p.date < foodDate).pop();
    let wInfo;
    if (wDay != null) {
      wInfo = `Eingetragen: <b>${fmt(wDay)} kg</b>` + (before ? ` · ${fmtSigned(wDay - before.v)} kg seit ${shortDate(before.date)}` : "");
    } else {
      wInfo = lastBefore ? `Zuletzt ${fmt(lastBefore.v)} kg am ${shortDate(lastBefore.date)}` : "Noch kein Gewicht eingetragen";
    }
    return `<div class="head"><div><p class="sub">${isToday ? "Heute" : longDate(foodDate)}</p><h1>Gewicht &amp; kcal</h1></div>
        <div class="row"><button class="icon-btn" data-act="food-prev" aria-label="Vorheriger Tag"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
        <button class="icon-btn" data-act="food-next" aria-label="Nächster Tag" ${isToday ? 'style="opacity:.35"' : ""}><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button></div></div>
      <div class="tile">
        <p class="label">Gewicht ${isToday ? "heute" : "an diesem Tag"}</p>
        <form id="weight-form" class="row">
          <input class="input" id="weight-in" inputmode="decimal" enterkeyhint="done" value="${wDay != null ? fmt(wDay) : ""}" placeholder="${wt ? fmt(wt) : "80"}" aria-label="Gewicht in kg">
          <span class="muted" style="font-weight:600">kg</span>
          <button class="btn primary" type="submit">Speichern</button>
        </form>
        <p class="muted small" style="margin:10px 0 0">${wInfo}</p>
      </div>
      <div class="tile" style="margin-top:12px">
        <p class="label">Kalorien</p>
        <div class="ring-wrap"><div class="ring">
          <svg viewBox="0 0 190 190"><circle cx="95" cy="95" r="${R}" fill="none" stroke="rgba(60,71,114,.8)" stroke-width="14"/>
          <circle cx="95" cy="95" r="${R}" fill="none" stroke="url(#rg)" stroke-width="14" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}"/>
          <defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#505DC3"/><stop offset="1" stop-color="#95A3EC"/></linearGradient></defs></svg>
          <div class="c"><p class="huge">${fmt0(Math.abs(left))}</p><p class="muted small" style="margin:0">${left >= 0 ? "kcal noch übrig" : "kcal über dem Ziel"}</p></div>
        </div></div>
        <p style="text-align:center;margin:0 0 14px"><b>${fmt0(eaten)}</b> <span class="muted">von ${fmt0(t.k)} kcal gegessen</span></p>
        <form id="kcal-form" class="row">
          <input class="input" id="kcal-in" inputmode="numeric" enterkeyhint="done" placeholder="z. B. 650" aria-label="Kalorien">
          <span class="muted" style="font-weight:600">kcal</span>
          <button class="btn primary" type="submit">+ Dazu</button>
        </form>
        ${entries.length ? `<div style="margin-top:8px">${entries.map((x, i) => `<div class="food-item"><div class="grow muted small">${x.t ? esc(x.t) + " Uhr" : "Eintrag " + (i + 1)}</div><div class="kcal">${fmt0(x.k)} kcal</div><button class="icon-btn" style="width:36px;height:36px" data-act="kcal-del" data-i="${i}" aria-label="Eintrag löschen"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>`).join("")}</div>` : ""}
        <p class="muted small" style="margin:12px 0 0">Ziel aus ${fmt(wt)} kg berechnet. Sobald du ein neues Gewicht einträgst, passt es sich automatisch an.</p>
      </div>
      <h2>Gewichtsverlauf</h2>
      <div class="tile">${ws.length >= 2 ? `<svg class="chart" id="wchart"></svg>
        <div class="grid2" style="margin-top:8px">
          <div><p class="label">Start</p><p class="big">${fmt(ws[0].v)} kg</p><p class="muted small" style="margin:0">${shortDate(ws[0].date)}</p></div>
          <div><p class="label">Aktuell</p><p class="big">${fmt(ws[ws.length - 1].v)} kg</p><p class="muted small" style="margin:0">${fmtSigned(ws[ws.length - 1].v - ws[0].v)} kg insgesamt</p></div>
        </div>` : `<div class="empty">Trag an mindestens zwei Tagen dein Gewicht ein, dann siehst du hier die Kurve.</div>`}</div>`;
  }

  // ---------- Einstellungen ----------
  function settingsSheet() {
    const t = targets();
    openSheet(`<h2>Einstellungen</h2>
      <div class="tile" style="margin-bottom:12px"><p class="label">Dein Tagesziel</p>
        <p style="margin:0"><b>${fmt0(t.k)} kcal</b> pro Tag</p>
        <p class="muted small" style="margin:6px 0 0">Berechnet mit der Mifflin-St-Jeor-Formel aus deinem zuletzt eingetragenen Gewicht, +300 kcal für Muskelaufbau. Passt sich bei jedem neuen Gewicht an.</p></div>
      <div class="tile" style="margin-bottom:12px"><p class="label">Profil</p>${profileForm(S.profile, "Profil speichern")}</div>
      <div class="tile" style="margin-bottom:12px"><p class="label">Eigene Übung</p>
        <form id="custom-ex">
          <label class="field"><span>Muskel</span><select class="input" name="m">${window.MUSCLES.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join("")}</select></label>
          <label class="field"><span>Name</span><input class="input" name="name" placeholder="z. B. Pec Deck (einarmig)"></label>
          <label class="field"><span>Art</span><select class="input" name="t"><option value="c">Grundübung (lange Pause)</option><option value="i">Isolationsübung (kurze Pause)</option></select></label>
          <button class="btn block" type="submit">Übung hinzufügen</button>
        </form></div>
      <div class="tile" style="margin-bottom:12px"><p class="label">Backup</p>
        <p class="muted small" style="margin-top:0">Deine Daten liegen nur auf diesem Handy. Mach ab und zu ein Backup, z. B. in iCloud Drive.</p>
        <div class="grid2"><button class="btn" data-act="export">Sichern</button><label class="btn" style="cursor:pointer">Laden<input type="file" id="import-file" accept="application/json,.json" hidden></label></div></div>
      <button class="btn block danger" data-act="reset">Alle Daten löschen</button>
      <p class="muted small" style="text-align:center;margin-top:16px">App-Version ${APP_VERSION}</p>`);
  }
  async function exportData() {
    const blob = new Blob([JSON.stringify(S, null, 1)], { type: "application/json" });
    const name = "fitness-backup-" + today() + ".json";
    const file = new File([blob], name, { type: "application/json" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === "AbortError") return; }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---------- Sheet ----------
  function openSheet(html) {
    const el = $("#sheet");
    el.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">
      <div class="sheet-top"><div class="grab"></div><button class="sheet-close" data-act="sheet-close" aria-label="Schließen"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      ${html}</div>`;
    el.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }
  // Nach unten wischen schließt das Fenster
  let swipeY = null, swipeDy = 0;
  document.addEventListener("touchstart", (e) => {
    const sh = e.target.closest(".sheet");
    if (!sh || (sh.scrollTop > 0 && !e.target.closest(".sheet-top"))) { swipeY = null; return; }
    swipeY = e.touches[0].clientY; swipeDy = 0;
  }, { passive: true });
  document.addEventListener("touchmove", (e) => {
    if (swipeY == null) return;
    swipeDy = e.touches[0].clientY - swipeY;
    const sh = $(".sheet");
    if (sh && swipeDy > 0) { sh.style.transition = "none"; sh.style.transform = `translateY(${swipeDy}px)`; }
  }, { passive: true });
  document.addEventListener("touchend", () => {
    if (swipeY == null) return;
    const sh = $(".sheet");
    if (swipeDy > 110) closeSheet();
    else if (sh) { sh.style.transition = "transform .2s ease"; sh.style.transform = ""; }
    swipeY = null; swipeDy = 0;
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#sheet").classList.contains("hidden")) closeSheet(); });
  function closeSheet() { $("#sheet").classList.add("hidden"); $("#sheet").innerHTML = ""; document.body.style.overflow = ""; }

  // ---------- Aktionen ----------
  document.addEventListener("click", (ev) => {
    const navBtn = ev.target.closest("[data-nav]");
    if (navBtn && !ev.target.closest("[data-act]")) { go(navBtn.dataset.nav); return; }

    const segBtn = ev.target.closest("[data-seg] button");
    if (segBtn) {
      const seg = segBtn.parentElement;
      seg.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === segBtn));
      if (seg.dataset.seg === "sex") { seg.parentElement.querySelector("input[name=sex]").value = segBtn.dataset.v; }
      if (seg.dataset.seg === "metric") { progMetric = segBtn.dataset.v; drawChart(); }
      return;
    }

    if (ev.target.id === "sheet") { closeSheet(); return; }

    const a = ev.target.closest("[data-act]");
    if (!a) return;
    const act = a.dataset.act;
    const w = activeWorkout();
    const ei = Number(a.dataset.ei), si = Number(a.dataset.si);

    switch (act) {
      case "settings": settingsSheet(); break;
      case "sheet-close": closeSheet(); break;
      case "pick-day": pickDay = a.dataset.day; render(); break;
      case "start-workout": {
        const date = ($("#pick-date") && $("#pick-date").value) || today();
        const nw = { id: uid(), date: date > today() ? today() : date, day: pickDay || nextDay(), start: Date.now(), live: date === today(), entries: [] };
        S.workouts.push(nw); S.active = nw.id; pickDay = null; pickDate = null; addMuscle = null;
        save(); render(); break;
      }
      case "ex-add": {
        const id = $("#add-ex") && $("#add-ex").value;
        if (!w || !id) break;
        const prevW = lastSetValues(id, w);
        w.entries.push({ ex: id, sets: [{ w: prevW.w, r: prevW.r, done: false }] });
        save(); render();
        setTimeout(() => { const cards = document.querySelectorAll(".ex-card"); const c = cards[cards.length - 1]; if (c) c.scrollIntoView({ behavior: "smooth", block: "center" }); }, 50);
        break;
      }
      case "ex-remove":
        if (w && confirm("Diese Übung aus dem Training entfernen?")) { w.entries.splice(ei, 1); save(); render(); }
        break;
      case "set-add": {
        const e = w.entries[ei], last = e.sets[e.sets.length - 1];
        e.sets.push({ w: last ? last.w : 0, r: last ? last.r : 0, done: false });
        save(); render(); break;
      }
      case "set-remove": w.entries[ei].sets.pop(); save(); render(); break;
      case "step": {
        const s = w.entries[ei].sets[si], f = a.dataset.f;
        s[f] = Math.max(0, Math.round((s[f] + Number(a.dataset.d)) * 100) / 100);
        if (s.done) markPR(w, ei, si);
        save(); render(); break;
      }
      case "set-done": {
        const s = w.entries[ei].sets[si];
        s.done = !s.done;
        if (s.done) {
          const isPR = markPR(w, ei, si);
          const ex = exById(w.entries[ei].ex);
          if (w.live) startTimer(ex.t === "c" ? 150 : 75);
          if (isPR) toast(`🏆 Neuer Rekord: ${fmt(s.w)} kg × ${s.r}`, true);
          // Folgesätze mit gleichen Werten vorbereiten
          const next = w.entries[ei].sets[si + 1];
          if (next && !next.done && !next.w && !next.r) { next.w = s.w; next.r = s.r; }
        } else s.pr = false;
        save(); render(); checkBadges(); break;
      }
      case "finish-workout": {
        if (!w) break;
        if (doneSets(w) === 0) {
          if (!confirm("Du hast noch keinen Satz abgehakt. Training verwerfen?")) break;
          S.workouts = S.workouts.filter((x) => x !== w);
        } else {
          w.end = w.end || Date.now();
        }
        S.active = null; stopTimer(); save();
        checkBadges();
        go("home");
        if (doneSets(w) > 0) toast("Training gespeichert 💪");
        break;
      }
      case "timer-plus": T.end += 30000; T.doneAt = 0; $("#timer").classList.remove("done"); tick(); break;
      case "timer-minus": T.end -= 30000; tick(); break;
      case "timer-stop": stopTimer(); break;
      case "celebrate-close": $("#celebrate").classList.add("hidden"); $("#celebrate").innerHTML = ""; showNextCelebration(); break;

      case "cal-prev": case "cal-next": {
        const [y, m] = calMonth.split("-").map(Number);
        const d = new Date(y, m - 1 + (act === "cal-next" ? 1 : -1), 1);
        calMonth = d.getFullYear() + "-" + pad(d.getMonth() + 1); render(); break;
      }
      case "cal-day": daySheet(a.dataset.date); break;
      case "edit-workout":
        if (S.active && S.active !== a.dataset.id) { toast("Beende zuerst das laufende Training"); break; }
        S.active = a.dataset.id; save(); closeSheet(); go("training"); break;
      case "delete-workout":
        if (confirm("Dieses Training wirklich löschen? Das kann nicht rückgängig gemacht werden.")) {
          S.workouts = S.workouts.filter((x) => x.id !== a.dataset.id);
          if (S.active === a.dataset.id) S.active = null;
          save(); closeSheet(); render();
        }
        break;
      case "backfill":
        if (S.active) { toast("Beende zuerst das laufende Training"); break; }
        pickDate = a.dataset.date; closeSheet(); go("training"); break;

      case "week": selWeek = a.dataset.k; render(); break;
      case "badge": badgeSheet(a.dataset.id); break;
      case "info": { const p = $("#info-text"); if (p) { p.textContent = window.INFO_TEXT[a.dataset.kind] || ""; p.classList.toggle("hidden"); } break; }

      case "food-prev": foodDate = addDays(foodDate, -1); render(); break;
      case "food-next": if (foodDate < today()) { foodDate = addDays(foodDate, 1); render(); } break;
      case "kcal-del": {
        const list = S.kcal[foodDate] || [];
        list.splice(Number(a.dataset.i), 1);
        if (!list.length) delete S.kcal[foodDate];
        save(); render(); break;
      }

      case "export": exportData(); break;
      case "reset":
        if (confirm("Wirklich ALLE Daten löschen? Trainings, Gewicht, Kalorien und Abzeichen sind danach weg. Das kann nicht rückgängig gemacht werden.")) {
          S = blank(); save(); closeSheet(); stopTimer(); go("home");
        }
        break;
    }
  });
  function lastSetValues(exId, current) {
    const list = S.workouts.filter((w) => w !== current).sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
    for (const w of list) {
      const e = w.entries.find((x) => x.ex === exId);
      if (e) { const s = e.sets.filter((x) => x.done)[0]; if (s) return { w: s.w, r: s.r }; }
    }
    return { w: 0, r: 0 };
  }

  document.addEventListener("input", (ev) => {
    const t = ev.target;
    if (t.matches(".stepper input")) {
      const w = activeWorkout(); if (!w) return;
      const s = w.entries[Number(t.dataset.ei)].sets[Number(t.dataset.si)];
      s[t.dataset.f] = Math.max(0, num(t.value));
      save();
    }
  });
  document.addEventListener("change", (ev) => {
    const t = ev.target;
    if (t.matches(".stepper input")) {
      const w = activeWorkout(); if (!w) return;
      const ei = Number(t.dataset.ei), si = Number(t.dataset.si);
      if (w.entries[ei].sets[si].done) { markPR(w, ei, si); save(); render(); }
    } else if (t.id === "add-muscle") {
      addMuscle = t.value;
      $("#add-ex").innerHTML = allExercises().filter((e) => e.m === addMuscle).map((e) => `<option value="${e.id}">${esc(e.name)}</option>`).join("");
    } else if (t.id === "pick-date") { pickDate = t.value; }
    else if (t.id === "prog-ex") { progEx = t.value; render(); }
    else if (t.id === "import-file" && t.files[0]) {
      const r = new FileReader();
      r.onload = () => {
        try {
          const data = JSON.parse(r.result);
          if (!data || !Array.isArray(data.workouts)) throw new Error();
          if (!confirm("Backup laden? Deine aktuellen Daten auf diesem Handy werden dabei ersetzt.")) return;
          S = migrate(Object.assign(blank(), data)); save(); checkBadges(true); closeSheet(); go("home"); toast("Backup geladen");
        } catch (e) { toast("Diese Datei ist kein gültiges Backup"); }
      };
      r.readAsText(t.files[0]);
    }
  });
  document.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const f = ev.target;
    if (f.id === "profile-form") {
      const p = readProfile(f); if (!p) return;
      const first = !S.profile;
      const weightChanged = !S.profile || S.profile.weight !== p.weight;
      S.profile = p;
      if (weightChanged) S.weights[today()] = p.weight;
      syncProfileWeight(); save(); closeSheet();
      if (first) { tab = "home"; }
      render(); toast(first ? "Willkommen, " + p.name : "Profil gespeichert");
    } else if (f.id === "custom-ex") {
      const fd = new FormData(f); const name = String(fd.get("name") || "").trim();
      if (!name) { toast("Bitte einen Namen eingeben"); return; }
      S.customExercises.push({ id: "own-" + uid(), m: fd.get("m"), name, t: fd.get("t") === "c" ? "c" : "i" });
      save(); f.reset(); toast("Übung hinzugefügt");
    } else if (f.id === "weight-form") {
      const raw = $("#weight-in").value.trim();
      const oldK = targets().k;
      if (!raw) {
        if (S.weights[foodDate] == null) { toast("Bitte ein Gewicht eingeben"); return; }
        delete S.weights[foodDate];
      } else {
        const kg = num(raw);
        if (kg < 30 || kg > 300) { toast("Bitte ein gültiges Gewicht eingeben"); return; }
        S.weights[foodDate] = Math.round(kg * 10) / 10;
      }
      syncProfileWeight(); save(); render(); checkBadges();
      const newK = targets().k;
      toast(!raw ? "Eintrag gelöscht" : newK !== oldK ? `Gespeichert · neues Ziel ${fmt0(newK)} kcal` : "Gewicht gespeichert");
    } else if (f.id === "kcal-form") {
      const k = Math.round(num($("#kcal-in").value));
      if (k <= 0 || k > 10000) { toast("Bitte Kalorien eingeben"); return; }
      const d = new Date();
      (S.kcal[foodDate] || (S.kcal[foodDate] = [])).push({ id: uid(), k, t: foodDate === today() ? pad(d.getHours()) + ":" + pad(d.getMinutes()) : "" });
      save(); render(); checkBadges();
      const inp = $("#kcal-in"); if (inp) inp.blur();
    }
  });

  // ---------- Start ----------
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((reg) => {
      // Beim Zurückkehren in die App nach Updates suchen
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update().catch(() => { }); });
    }).catch(() => { });
    // Neue Version aktiv: einmal neu laden (nicht mitten im Training, nicht bei offenem Fenster)
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || reloaded) return;
      if (S.active || !$("#sheet").classList.contains("hidden")) { toast("Neue Version bereit – App neu öffnen"); return; }
      reloaded = true; location.reload();
    });
  }
  checkBadges(true);
  render();
})();
