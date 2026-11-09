(function () {
  "use strict";

  const APP_VERSION = 3; // bei jeder Änderung zusammen mit CACHE in sw.js erhöhen

  // ---------- Speicher ----------
  const KEY = "fit.v1";
  const blank = () => ({
    profile: null,
    workouts: [],
    active: null,
    customExercises: [],
    food: {},
    customFoods: [],
    recentFoods: [],
    earned: {}
  });
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

  const allExercises = () => window.EXERCISES.concat(S.customExercises);
  const exById = (id) => allExercises().find((e) => e.id === id) || { id, name: id, t: "i", m: "" };
  const muscleName = (id) => (window.MUSCLES.find((m) => m.id === id) || {}).name || "";
  const activeWorkout = () => S.workouts.find((w) => w.id === S.active) || null;
  const doneSets = (w) => w.entries.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0);

  // ---------- Ziele ----------
  function targets() {
    const p = S.profile;
    if (!p) return { k: 2500, p: 150, c: 280, f: 70 };
    const bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === "f" ? -161 : 5);
    const k = Math.round((bmr * p.activity + 300) / 50) * 50; // leichter Überschuss für Muskelaufbau
    const prot = Math.round(p.weight * 1.8);
    const f = Math.round((k * 0.25) / 9);
    const c = Math.max(0, Math.round((k - prot * 4 - f * 9) / 4));
    return { k, p: prot, c, f };
  }
  function dayTotals(date) {
    return (S.food[date] || []).reduce((t, it) => {
      const m = it.g / 100;
      t.k += it.k * m; t.p += it.p * m; t.c += it.c * m; t.f += it.f * m;
      return t;
    }, { k: 0, p: 0, c: 0, f: 0 });
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
      early: false, night: false, streakWeeks: 0, maxWeek: 0, bodyweight: S.profile ? S.profile.weight : 0, foodDays: 0, proteinStreak: 0 };
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
    const days = Object.keys(S.food).filter((d) => (S.food[d] || []).length).sort();
    st.foodDays = days.length;
    const tp = targets().p;
    let run = 0, best = 0, prev = null;
    for (const d of days) {
      const ok = dayTotals(d).p >= tp;
      if (ok && prev && addDays(prev, 1) === d && run > 0) run++;
      else run = ok ? 1 : 0;
      best = Math.max(best, run);
      prev = ok ? d : null;
    }
    st.proteinStreak = best;
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
  let progEx = null, progMetric = "e1rm";
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
    view.innerHTML = { home: viewHome, calendar: viewCalendar, training: viewTraining, food: viewFood, progress: viewProgress }[tab]();
    if (tab === "progress") drawChart();
    tick();
    updateWakeLock();
  }
  function go(t) { tab = t; window.scrollTo(0, 0); render(); }

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
    const t = targets(), tot = dayTotals(today());
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
          <p class="big">${fmt0(tot.k)}</p>
          <p class="muted small" style="margin:0">von ${fmt0(t.k)} kcal</p>
          <div class="bar"><div style="width:${Math.min(100, (tot.k / t.k) * 100)}%"></div></div>
        </div>
        <div class="tile tap" data-nav="food">
          <p class="label">Protein</p>
          <p class="big">${fmt0(tot.p)} g</p>
          <p class="muted small" style="margin:0">von ${fmt0(t.p)} g</p>
          <div class="bar protein"><div style="width:${Math.min(100, (tot.p / t.p) * 100)}%"></div></div>
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
      const rows = e.sets.map((s, si) => `
        <div class="set-row">
          <div class="n">${si + 1}</div>
          ${stepper(ei, si, "w", s.w, "kg")}
          ${stepper(ei, si, "r", s.r, "Wdh")}
          <button class="check ${s.done ? (s.pr ? "pr" : "done") : ""}" data-act="set-done" data-ei="${ei}" data-si="${si}" aria-label="Satz ${si + 1} erledigt"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>
        </div>`).join("");
      return `<div class="tile ex-card" style="margin-bottom:12px">
        <div class="spread"><div><h3>${esc(ex.name)}</h3><div class="last-hint">${prev ? "Letztes Mal: " + esc(prev) : esc(muscleName(ex.m))}</div></div>
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
  function lastPerformance(exId, current) {
    const list = S.workouts.filter((w) => w !== current && w.date <= current.date).sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
    for (const w of list) {
      const e = w.entries.find((x) => x.ex === exId);
      if (!e) continue;
      const sets = e.sets.filter((s) => s.done);
      if (!sets.length) continue;
      return sets.map((s) => `${fmt(s.w)}×${s.r}`).join(", ") + " kg";
    }
    return "";
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
    const tot = dayTotals(date);
    const hasFood = (S.food[date] || []).length > 0;
    let html = `<h2>${longDate(date)}</h2>`;
    if (!ws.length) html += `<div class="empty">An diesem Tag hast du kein Training eingetragen.</div>`;
    for (const w of ws) {
      html += `<div class="tile" style="margin-bottom:12px"><div class="spread"><p class="label" style="margin:0">Tag ${w.day} · ${esc(window.DAYS[w.day].name)}</p></div><div style="margin-top:10px">`;
      html += w.entries.filter((e) => e.sets.some((s) => s.done)).map((e) => `<div class="entry"><b>${esc(exById(e.ex).name)}</b><div class="sets">${e.sets.filter((s) => s.done).map((s) => `<span class="chip ${s.pr ? "gold" : ""}">${s.pr ? "🏆 " : ""}${fmt(s.w)} kg × ${s.r}</span>`).join("")}</div></div>`).join("");
      html += `</div><div class="row" style="margin-top:12px"><button class="btn small" data-act="edit-workout" data-id="${w.id}">Bearbeiten</button><button class="btn small danger" data-act="delete-workout" data-id="${w.id}">Löschen</button></div></div>`;
    }
    if (hasFood) html += `<div class="tile"><p class="label">Ernährung</p><p style="margin:0"><b>${fmt0(tot.k)} kcal</b> · ${fmt0(tot.p)} g Protein · ${fmt0(tot.c)} g KH · ${fmt0(tot.f)} g Fett</p></div>`;
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
      chartPart = `<div class="tile">
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
      ${chartPart}
      <div class="grid2" style="margin-top:12px">
        <div class="tile"><p class="label">Trainings</p><p class="big">${st.workouts}</p></div>
        <div class="tile"><p class="label">Rekorde</p><p class="big gold-text">${st.prs}</p></div>
      </div>
      <h2>Abzeichen <span class="muted" style="font-weight:500;font-size:15px">${earnedCount} von ${window.BADGES.length}</span></h2>
      <div class="badges">${visible}</div>`;
  }
  function drawChart() {
    const svg = $("#chart");
    if (!svg || !progEx) return;
    const pts = seriesFor(progEx, progMetric);
    const W = svg.clientWidth || 320, H = 220, pl = 40, pr = 12, pt = 14, pb = 26;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    if (pts.length === 0) { svg.innerHTML = ""; return; }
    let min = Math.min(...pts.map((p) => p.v)), max = Math.max(...pts.map((p) => p.v));
    if (min === max) { min = min * 0.9; max = max * 1.1 || 1; }
    const padv = (max - min) * 0.15; min = Math.max(0, min - padv); max += padv;
    const x = (i) => pts.length === 1 ? pl + (W - pl - pr) / 2 : pl + (i / (pts.length - 1)) * (W - pl - pr);
    const y = (v) => pt + (1 - (v - min) / (max - min)) * (H - pt - pb);
    let grid = "";
    for (let i = 0; i <= 3; i++) {
      const v = min + ((max - min) * i) / 3, yy = y(v);
      grid += `<line x1="${pl}" x2="${W - pr}" y1="${yy}" y2="${yy}" stroke="rgba(149,163,236,.15)"/><text x="${pl - 6}" y="${yy + 4}" text-anchor="end">${fmt0(v)}</text>`;
    }
    const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.v)}`).join(" ");
    const area = `${line} L${x(pts.length - 1)},${H - pb} L${x(0)},${H - pb} Z`;
    const bestI = pts.reduce((bi, p, i) => (p.v >= pts[bi].v ? i : bi), 0);
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

  // ---------- Ernährung ----------
  function viewFood() {
    const t = targets(), tot = dayTotals(foodDate);
    const items = S.food[foodDate] || [];
    const R = 80, C = 2 * Math.PI * R, frac = Math.min(1, tot.k / t.k);
    const isToday = foodDate === today();
    const macro = (label, v, goal, cls) => `<div class="macro"><div class="spread"><b>${label}</b><span class="muted small">${fmt0(v)} / ${fmt0(goal)} g</span></div><div class="bar ${cls}"><div style="width:${Math.min(100, (v / goal) * 100)}%"></div></div></div>`;
    return `<div class="head"><div><p class="sub">${isToday ? "Heute" : longDate(foodDate)}</p><h1>Ernährung</h1></div>
        <div class="row"><button class="icon-btn" data-act="food-prev" aria-label="Vorheriger Tag"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
        <button class="icon-btn" data-act="food-next" aria-label="Nächster Tag" ${isToday ? 'style="opacity:.35"' : ""}><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button></div></div>
      <div class="tile">
        <div class="ring-wrap"><div class="ring">
          <svg viewBox="0 0 190 190"><circle cx="95" cy="95" r="${R}" fill="none" stroke="rgba(60,71,114,.8)" stroke-width="14"/>
          <circle cx="95" cy="95" r="${R}" fill="none" stroke="url(#rg)" stroke-width="14" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}"/>
          <defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#505DC3"/><stop offset="1" stop-color="#95A3EC"/></linearGradient></defs></svg>
          <div class="c"><p class="huge">${fmt0(tot.k)}</p><p class="muted small" style="margin:0">von ${fmt0(t.k)} kcal</p></div>
        </div></div>
        ${macro("Protein", tot.p, t.p, "protein")}
        ${macro("Kohlenhydrate", tot.c, t.c, "")}
        ${macro("Fett", tot.f, t.f, "")}
      </div>
      <div class="grid2" style="margin-top:12px">
        <button class="btn primary" data-act="food-search">🔍 Suchen</button>
        <button class="btn" data-act="food-scan">📷 Barcode</button>
      </div>
      ${S.recentFoods.length ? `<h2>Zuletzt gegessen</h2><div class="recent">${S.recentFoods.map((f, i) => `<button data-act="recent" data-i="${i}">${esc(f.name)} · ${fmt0(f.g)} g</button>`).join("")}</div>` : ""}
      <h2>${isToday ? "Heute gegessen" : "Gegessen"}</h2>
      <div class="tile">${items.length ? items.map((it, i) => `<button class="food-item" style="width:100%;text-align:left" data-act="food-item" data-i="${i}"><div class="grow"><div class="name">${esc(it.name)}</div><div class="muted small">${fmt0(it.g)} g · ${fmt0(it.p * it.g / 100)} g Protein</div></div><div class="kcal">${fmt0(it.k * it.g / 100)} kcal</div></button>`).join("") : `<div class="empty">Noch nichts eingetragen.</div>`}</div>`;
  }

  function searchSheet() {
    openSheet(`<h2>Lebensmittel suchen</h2>
      <input class="input" id="food-q" placeholder="z. B. Haferflocken, Skyr, Döner" autocomplete="off" enterkeyhint="search">
      <div id="food-results" style="margin-top:12px"></div>
      <button class="btn block" style="margin-top:12px" data-act="food-custom">+ Eigenes Lebensmittel anlegen</button>`);
    setTimeout(() => { const q = $("#food-q"); if (q) q.focus(); }, 300);
    renderResults("");
  }
  let searchT, lastResults = [], searchSeq = 0;
  function renderResults(q) {
    const box = $("#food-results");
    if (!box) return;
    const ql = q.trim().toLowerCase();
    const local = S.customFoods.map((f) => Object.assign({ src: "Eigenes" }, f)).concat(window.BASE_FOODS.map((f) => Object.assign({ src: "Grundliste" }, f)));
    const hits = ql ? local.filter((f) => f.name.toLowerCase().includes(ql)) : local.slice(0, 12);
    lastResults = hits.slice(0, 20);
    const draw = (online, status) => {
      const all = lastResults.concat(online || []);
      box.innerHTML = (all.length ? `<div class="tile" style="padding:6px 12px">${all.map((f, i) => `<button class="result" data-act="pick-food" data-i="${i}"><div><div class="name">${esc(f.name)}</div><div class="muted small">${esc(f.src)}${f.brand ? " · " + esc(f.brand) : ""}</div></div><div class="small" style="text-align:right;white-space:nowrap"><b>${fmt0(f.k)} kcal</b><div class="muted">${fmt(f.p)} g P / 100 g</div></div></button>`).join("")}</div>` : "") + (status ? `<p class="muted small" style="text-align:center">${status}</p>` : "");
      box._all = all;
    };
    draw([], ql.length >= 3 ? "Suche online …" : "");
    clearTimeout(searchT);
    if (ql.length < 3) return;
    const seq = ++searchSeq;
    searchT = setTimeout(async () => {
      try {
        const url = "https://world.openfoodfacts.org/cgi/search.pl?search_terms=" + encodeURIComponent(q.trim()) + "&search_simple=1&action=process&json=1&page_size=20&sort_by=unique_scans_n&lc=de&fields=product_name,product_name_de,brands,nutriments,code";
        const r = await fetch(url);
        const j = await r.json();
        if (seq !== searchSeq) return;
        const online = (j.products || []).map(offToFood).filter(Boolean);
        draw(online, online.length ? "" : "Online nichts gefunden");
      } catch (e) {
        if (seq === searchSeq) draw([], "Online-Suche gerade nicht erreichbar – Grundliste wird angezeigt");
      }
    }, 800);
  }
  function offToFood(p) {
    const n = p.nutriments || {};
    let k = n["energy-kcal_100g"];
    if (k == null && n["energy_100g"] != null) k = n["energy_100g"] / 4.184;
    const name = p.product_name_de || p.product_name;
    if (!name || k == null) return null;
    return { name, brand: p.brands || "", src: "Open Food Facts", k: +k || 0, p: +n.proteins_100g || 0, c: +n.carbohydrates_100g || 0, f: +n.fat_100g || 0 };
  }
  let pendingFood = null, editIdx = null;
  function amountSheet(food, grams, idx) {
    pendingFood = food; editIdx = idx == null ? null : idx;
    const g = grams || 100;
    openSheet(`<h2>${esc(food.name)}</h2>
      <p class="muted small" style="margin-top:-4px">Pro 100 g: ${fmt0(food.k)} kcal · ${fmt(food.p)} g P · ${fmt(food.c)} g KH · ${fmt(food.f)} g F</p>
      <label class="field"><span>Menge in Gramm</span><input class="input" id="food-g" inputmode="decimal" value="${fmt(g)}"></label>
      <div class="row" style="flex-wrap:wrap">${[50, 100, 150, 200, 300].map((v) => `<button class="btn small" data-act="set-g" data-v="${v}">${v} g</button>`).join("")}</div>
      <div class="tile" style="margin-top:14px" id="food-preview"></div>
      <button class="btn primary block" style="margin-top:14px" data-act="food-save">${editIdx == null ? "Hinzufügen" : "Speichern"}</button>
      ${editIdx != null ? `<button class="btn block danger" style="margin-top:10px" data-act="food-delete">Löschen</button>` : ""}`);
    updatePreview();
  }
  function updatePreview() {
    const el = $("#food-preview"), inp = $("#food-g");
    if (!el || !inp || !pendingFood) return;
    const m = num(inp.value) / 100, f = pendingFood;
    el.innerHTML = `<div class="spread"><b style="font-size:22px">${fmt0(f.k * m)} kcal</b><span class="muted small">${fmt0(f.p * m)} g P · ${fmt0(f.c * m)} g KH · ${fmt0(f.f * m)} g F</span></div>`;
  }
  function customFoodSheet(prefill) {
    openSheet(`<h2>Eigenes Lebensmittel</h2>
      <p class="muted small" style="margin-top:-4px">Werte pro 100 g (stehen auf der Verpackung).</p>
      <form id="custom-food">
        <label class="field"><span>Name</span><input class="input" name="name" value="${esc(prefill || "")}"></label>
        <div class="grid2">
          <label class="field"><span>Kalorien (kcal)</span><input class="input" name="k" inputmode="decimal"></label>
          <label class="field"><span>Protein (g)</span><input class="input" name="p" inputmode="decimal"></label>
          <label class="field"><span>Kohlenhydrate (g)</span><input class="input" name="c" inputmode="decimal"></label>
          <label class="field"><span>Fett (g)</span><input class="input" name="f" inputmode="decimal"></label>
        </div>
        <button class="btn primary block" type="submit">Weiter</button>
      </form>`);
  }

  // Barcode
  let scanReader = null;
  function scanSheet() {
    openSheet(`<h2>Barcode scannen</h2>
      <div class="scanner"><video id="scan-video" playsinline muted></video><div class="frame"></div></div>
      <p class="muted small" id="scan-status" style="text-align:center">Kamera wird gestartet …</p>
      <div class="row"><input class="input" id="scan-manual" inputmode="numeric" placeholder="Oder Nummer eintippen"><button class="btn" data-act="scan-manual">OK</button></div>`);
    startScan();
  }
  function loadZXing() {
    if (window.ZXing) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js";
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  async function startScan() {
    const status = () => $("#scan-status");
    try {
      await loadZXing();
      if (!$("#scan-video")) return;
      scanReader = new window.ZXing.BrowserMultiFormatReader();
      await scanReader.decodeFromConstraints({ video: { facingMode: "environment" } }, "scan-video", (result) => {
        if (result) { const code = result.getText(); stopScan(); lookupBarcode(code); }
      });
      if (status()) status().textContent = "Halte den Barcode in den Rahmen";
    } catch (e) {
      if (status()) status().textContent = "Kamera nicht verfügbar. Tippe die Nummer unter dem Barcode ein.";
    }
  }
  function stopScan() { try { if (scanReader) scanReader.reset(); } catch (e) { } scanReader = null; }
  async function lookupBarcode(code) {
    code = String(code).replace(/\D/g, "");
    if (!code) return;
    openSheet(`<h2>Suche Produkt …</h2><p class="muted">Barcode ${esc(code)}</p>`);
    try {
      const r = await fetch("https://world.openfoodfacts.org/api/v2/product/" + code + ".json?fields=product_name,product_name_de,brands,nutriments");
      const j = await r.json();
      const f = j.status === 1 ? offToFood(j.product) : null;
      if (f) { amountSheet(f, 100); return; }
      openSheet(`<h2>Nicht gefunden</h2><p class="muted">Das Produkt mit Barcode ${esc(code)} ist nicht in der Datenbank. Du kannst es selbst anlegen.</p><button class="btn primary block" data-act="food-custom">Eigenes Lebensmittel anlegen</button>`);
    } catch (e) {
      openSheet(`<h2>Keine Verbindung</h2><p class="muted">Für die Barcode-Suche brauchst du Internet.</p>`);
    }
  }

  // ---------- Einstellungen ----------
  function settingsSheet() {
    const t = targets();
    openSheet(`<h2>Einstellungen</h2>
      <div class="tile" style="margin-bottom:12px"><p class="label">Deine Tagesziele</p>
        <p style="margin:0"><b>${fmt0(t.k)} kcal</b> · ${t.p} g Protein · ${t.c} g KH · ${t.f} g Fett</p>
        <p class="muted small" style="margin:6px 0 0">Berechnet mit der Mifflin-St-Jeor-Formel, +300 kcal für Muskelaufbau, 1,8 g Protein pro kg Körpergewicht, 25 % Fett.</p></div>
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
  function closeSheet() { stopScan(); $("#sheet").classList.add("hidden"); $("#sheet").innerHTML = ""; document.body.style.overflow = ""; }

  // ---------- Aktionen ----------
  function addFood(food, g) {
    const list = S.food[foodDate] || (S.food[foodDate] = []);
    const item = { id: uid(), name: food.name, g, k: food.k, p: food.p, c: food.c, f: food.f };
    list.push(item);
    S.recentFoods = [{ name: food.name, g, k: food.k, p: food.p, c: food.c, f: food.f }].concat(S.recentFoods.filter((r) => r.name !== food.name)).slice(0, 15);
    save();
  }

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

      case "badge": badgeSheet(a.dataset.id); break;
      case "info": { const p = $("#info-text"); if (p) { p.textContent = window.INFO_TEXT[a.dataset.kind] || ""; p.classList.toggle("hidden"); } break; }

      case "food-prev": foodDate = addDays(foodDate, -1); render(); break;
      case "food-next": if (foodDate < today()) { foodDate = addDays(foodDate, 1); render(); } break;
      case "food-search": searchSheet(); break;
      case "food-scan": scanSheet(); break;
      case "scan-manual": { const v = $("#scan-manual").value; stopScan(); lookupBarcode(v); break; }
      case "food-custom": customFoodSheet($("#food-q") ? $("#food-q").value : ""); break;
      case "pick-food": { const all = $("#food-results")._all || []; const f = all[Number(a.dataset.i)]; if (f) amountSheet(f, 100); break; }
      case "recent": { const f = S.recentFoods[Number(a.dataset.i)]; if (f) amountSheet(f, f.g); break; }
      case "food-item": { const it = (S.food[foodDate] || [])[Number(a.dataset.i)]; if (it) amountSheet(it, it.g, Number(a.dataset.i)); break; }
      case "set-g": $("#food-g").value = a.dataset.v; updatePreview(); break;
      case "food-save": {
        const g = num($("#food-g").value);
        if (g <= 0) { toast("Bitte eine Menge eingeben"); break; }
        if (editIdx != null) { S.food[foodDate][editIdx].g = g; save(); }
        else addFood(pendingFood, g);
        closeSheet(); render(); checkBadges(); break;
      }
      case "food-delete": S.food[foodDate].splice(editIdx, 1); save(); closeSheet(); render(); break;

      case "export": exportData(); break;
      case "reset":
        if (confirm("Wirklich ALLE Daten löschen? Trainings, Ernährung und Abzeichen sind danach weg. Das kann nicht rückgängig gemacht werden.")) {
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
    } else if (t.id === "food-q") renderResults(t.value);
    else if (t.id === "food-g") updatePreview();
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
          S = Object.assign(blank(), data); save(); checkBadges(true); closeSheet(); go("home"); toast("Backup geladen");
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
      S.profile = p; save(); closeSheet();
      if (first) { tab = "home"; }
      render(); toast(first ? "Willkommen, " + p.name : "Profil gespeichert");
    } else if (f.id === "custom-ex") {
      const fd = new FormData(f); const name = String(fd.get("name") || "").trim();
      if (!name) { toast("Bitte einen Namen eingeben"); return; }
      S.customExercises.push({ id: "own-" + uid(), m: fd.get("m"), name, t: fd.get("t") === "c" ? "c" : "i" });
      save(); f.reset(); toast("Übung hinzugefügt");
    } else if (f.id === "custom-food") {
      const fd = new FormData(f); const name = String(fd.get("name") || "").trim();
      if (!name) { toast("Bitte einen Namen eingeben"); return; }
      const food = { name, k: num(fd.get("k")), p: num(fd.get("p")), c: num(fd.get("c")), f: num(fd.get("f")) };
      S.customFoods = [food].concat(S.customFoods.filter((x) => x.name !== name)); save();
      amountSheet(food, 100);
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
