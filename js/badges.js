// Abzeichen.
// prog(s) liefert den Fortschritt 0..1 (1 = geschafft). s = Statistik aus app.js.
// pct: Text zur Seltenheit. kind: "study" = belegt durch Studie, "est" = grobe Schätzung.
(function () {
  const best = (s, id) => s.bestWeight[id] || 0;
  const strength = (id, kg) => (s) => Math.min(1, best(s, id) / kg);

  window.INFO_TEXT = {
    study: "Belegt: Eine Meta-Analyse mit rund 3,3 Millionen Menschen aus über 30 Ländern (British Journal of Sports Medicine, 2023) zeigt, dass nur etwa 1 von 5 Erwachsenen regelmäßig Krafttraining nach Empfehlung macht (mind. 2× pro Woche).",
    est: "Grobe Schätzung: Kraftdaten gibt es nur von Menschen, die trainieren (z. B. StrengthLog, Strength Level). Für alle Menschen wurde eingerechnet, dass rund 80 % der Erwachsenen gar kein regelmäßiges Krafttraining machen. Die Zahl ist eine Orientierung, kein exakter Messwert."
  };

  window.BADGES = [
    // Durchhalten
    { id: "first", icon: "🔥", name: "Erster Schritt", desc: "1. Training eingetragen", prog: s => Math.min(1, s.workouts / 1) },
    { id: "w10", icon: "💪", name: "10 Trainings", desc: "10 Trainings absolviert", prog: s => Math.min(1, s.workouts / 10) },
    { id: "w50", icon: "⚡", name: "50 Trainings", desc: "50 Trainings absolviert", prog: s => Math.min(1, s.workouts / 50) },
    { id: "w100", icon: "🏛️", name: "100 Trainings", desc: "100 Trainings absolviert", prog: s => Math.min(1, s.workouts / 100) },
    { id: "w250", icon: "👑", name: "250 Trainings", desc: "250 Trainings absolviert", prog: s => Math.min(1, s.workouts / 250) },
    { id: "streak4", icon: "📆", name: "4 Wochen dran", desc: "4 Wochen am Stück mind. 2× pro Woche", pct: "Das schaffen nur rund 20 % der Erwachsenen", kind: "study", prog: s => Math.min(1, s.streakWeeks / 4) },
    { id: "streak12", icon: "🗓️", name: "12 Wochen dran", desc: "12 Wochen am Stück mind. 2× pro Woche", pct: "Geschätzt: weniger als 10 % aller Menschen", kind: "est", prog: s => Math.min(1, s.streakWeeks / 12) },
    { id: "streak52", icon: "🌍", name: "Ein ganzes Jahr", desc: "52 Wochen am Stück mind. 2× pro Woche", pct: "Geschätzt: weniger als 3 % aller Menschen", kind: "est", prog: s => Math.min(1, s.streakWeeks / 52) },

    // Kraft
    { id: "bp60", icon: "🏋️", name: "60 kg Bank", desc: "60 kg Bankdrücken", pct: "Geschätzt stärker als 85 % aller Menschen", kind: "est", prog: strength("bankdruecken", 60) },
    { id: "bp80", icon: "🏋️", name: "80 kg Bank", desc: "80 kg Bankdrücken", pct: "Geschätzt stärker als 94 % aller Menschen", kind: "est", prog: strength("bankdruecken", 80) },
    { id: "bp100", icon: "💯", name: "100 kg Club", desc: "100 kg Bankdrücken", pct: "Geschätzt stärker als 98 % aller Menschen", kind: "est", prog: strength("bankdruecken", 100) },
    { id: "bp120", icon: "🦍", name: "120 kg Bank", desc: "120 kg Bankdrücken", pct: "Geschätzt stärker als 99,5 % aller Menschen", kind: "est", prog: strength("bankdruecken", 120) },
    { id: "bpbw", icon: "⚖️", name: "Eigengewicht", desc: "Bankdrücken mit deinem Körpergewicht", pct: "Geschätzt stärker als 95 % aller Menschen", kind: "est", prog: s => s.bodyweight ? Math.min(1, best(s, "bankdruecken") / s.bodyweight) : 0 },
    { id: "sq100", icon: "🦵", name: "100 kg Kniebeuge", desc: "100 kg Kniebeuge", pct: "Geschätzt stärker als 92 % aller Menschen", kind: "est", prog: strength("kniebeuge", 100) },
    { id: "sq140", icon: "🦵", name: "140 kg Kniebeuge", desc: "140 kg Kniebeuge", pct: "Geschätzt stärker als 98 % aller Menschen", kind: "est", prog: strength("kniebeuge", 140) },
    { id: "sq180", icon: "🗿", name: "180 kg Kniebeuge", desc: "180 kg Kniebeuge", pct: "Geschätzt stärker als 99,5 % aller Menschen", kind: "est", prog: strength("kniebeuge", 180) },
    { id: "dl140", icon: "⛓️", name: "140 kg Kreuzheben", desc: "140 kg Kreuzheben", pct: "Geschätzt stärker als 95 % aller Menschen", kind: "est", prog: strength("kreuzheben", 140) },
    { id: "dl180", icon: "⛓️", name: "180 kg Kreuzheben", desc: "180 kg Kreuzheben", pct: "Geschätzt stärker als 99 % aller Menschen", kind: "est", prog: strength("kreuzheben", 180) },
    { id: "dl220", icon: "🐉", name: "220 kg Kreuzheben", desc: "220 kg Kreuzheben", pct: "Geschätzt stärker als 99,7 % aller Menschen", kind: "est", prog: strength("kreuzheben", 220) },
    { id: "pullup", icon: "🧗", name: "Klimmzug-Profi", desc: "10 Klimmzüge in einem Satz", pct: "Geschätzt besser als 95 % aller Menschen", kind: "est", prog: s => Math.min(1, (s.bestReps["klimmzuege"] || 0) / 10) },

    // Fortschritt
    { id: "pr1", icon: "🏆", name: "Erster Rekord", desc: "Deinen ersten persönlichen Rekord aufgestellt", prog: s => Math.min(1, s.prs / 1) },
    { id: "pr25", icon: "🏆", name: "Rekordjäger", desc: "25 persönliche Rekorde", prog: s => Math.min(1, s.prs / 25) },
    { id: "pr100", icon: "🏆", name: "Rekordmaschine", desc: "100 persönliche Rekorde", prog: s => Math.min(1, s.prs / 100) },
    { id: "vol100t", icon: "🚚", name: "100 Tonnen", desc: "Insgesamt 100.000 kg bewegt", prog: s => Math.min(1, s.totalVolume / 100000) },
    { id: "vol1000t", icon: "🚢", name: "1.000 Tonnen", desc: "Insgesamt 1.000.000 kg bewegt", prog: s => Math.min(1, s.totalVolume / 1000000) },

    // Gewicht & Kalorien
    { id: "food7", icon: "🥗", name: "Kalorien-Woche", desc: "An 7 Tagen Kalorien eingetragen", prog: s => Math.min(1, s.foodDays / 7) },
    { id: "weigh7", icon: "⚖️", name: "Waage-Routine", desc: "7 Tage am Stück dein Gewicht eingetragen", prog: s => Math.min(1, s.weightStreak / 7) },

    // Geheim
    { id: "early", secret: true, icon: "🌅", name: "Frühaufsteher", desc: "Ein Training vor 7 Uhr begonnen", prog: s => s.early ? 1 : 0 },
    { id: "night", secret: true, icon: "🌙", name: "Nachteule", desc: "Ein Training nach 22 Uhr begonnen", prog: s => s.night ? 1 : 0 },
    { id: "perfect", secret: true, icon: "✨", name: "Perfekte Woche", desc: "5 Trainings in einer Woche", prog: s => s.maxWeek >= 5 ? 1 : 0 },
    { id: "beast", secret: true, icon: "🦁", name: "Biest-Modus", desc: "Über 10.000 kg in einem einzigen Training", prog: s => s.maxSessionVolume >= 10000 ? 1 : 0 },
    { id: "triple", secret: true, icon: "🎯", name: "Hattrick", desc: "3 Rekorde in einem Training", prog: s => s.maxPrsInSession >= 3 ? 1 : 0 }
  ];
})();
