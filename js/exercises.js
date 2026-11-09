// Muskelgruppen und Übungen.
// t: "c" = Grundübung (lange Pause), "i" = Isolationsübung (kurze Pause)
window.MUSCLES = [
  { id: "brust", name: "Brust", day: "A" },
  { id: "ruecken", name: "Rücken", day: "A" },
  { id: "nacken", name: "Nacken / Trapez", day: "B" },
  { id: "schultern", name: "Schultern", day: "B" },
  { id: "bizeps", name: "Bizeps", day: "B" },
  { id: "trizeps", name: "Trizeps", day: "B" },
  { id: "unterarme", name: "Unterarme", day: "B" },
  { id: "quadrizeps", name: "Beine vorne (Quadrizeps)", day: "C" },
  { id: "beinbeuger", name: "Beine hinten (Beinbeuger)", day: "C" },
  { id: "gesaess", name: "Gesäß", day: "C" },
  { id: "waden", name: "Waden", day: "C" },
  { id: "bauch", name: "Bauch", day: "C" }
];

window.DAYS = {
  A: { name: "Brust und Rücken", short: "Brust / Rücken" },
  B: { name: "Nacken, Schultern und Arme", short: "Schultern / Arme" },
  C: { name: "Beine und Bauch", short: "Beine / Bauch" }
};

window.EXERCISES = [
  // Brust
  { id: "bankdruecken", m: "brust", name: "Bankdrücken (Langhantel)", t: "c" },
  { id: "schraegbank-lh", m: "brust", name: "Schrägbankdrücken (Langhantel)", t: "c" },
  { id: "bank-kh", m: "brust", name: "Bankdrücken (Kurzhanteln)", t: "c" },
  { id: "schraegbank-kh", m: "brust", name: "Schrägbankdrücken (Kurzhanteln)", t: "c" },
  { id: "brustpresse", m: "brust", name: "Brustpresse (Maschine)", t: "c" },
  { id: "dips-brust", m: "brust", name: "Dips (Brustfokus)", t: "c" },
  { id: "butterfly", m: "brust", name: "Butterfly (Maschine)", t: "i" },
  { id: "kabelzug-fly", m: "brust", name: "Kabelzug-Fliegende", t: "i" },
  { id: "fliegende-kh", m: "brust", name: "Fliegende (Kurzhanteln)", t: "i" },
  { id: "liegestuetze", m: "brust", name: "Liegestütze", t: "c" },

  // Rücken
  { id: "klimmzuege", m: "ruecken", name: "Klimmzüge", t: "c" },
  { id: "latzug", m: "ruecken", name: "Latzug (breit)", t: "c" },
  { id: "latzug-eng", m: "ruecken", name: "Latzug (eng / neutral)", t: "c" },
  { id: "rudern-lh", m: "ruecken", name: "Langhantelrudern", t: "c" },
  { id: "rudern-kh", m: "ruecken", name: "Kurzhantelrudern (einarmig)", t: "c" },
  { id: "kabelrudern", m: "ruecken", name: "Kabelrudern (sitzend)", t: "c" },
  { id: "rudermaschine", m: "ruecken", name: "Rudermaschine (brustgestützt)", t: "c" },
  { id: "t-bar", m: "ruecken", name: "T-Bar-Rudern", t: "c" },
  { id: "kreuzheben", m: "ruecken", name: "Kreuzheben", t: "c" },
  { id: "pullover", m: "ruecken", name: "Überzüge am Kabel (Pullover)", t: "i" },
  { id: "rueckenstrecker", m: "ruecken", name: "Rückenstrecker (Hyperextensions)", t: "i" },

  // Nacken / Trapez
  { id: "shrugs-lh", m: "nacken", name: "Shrugs (Langhantel)", t: "i" },
  { id: "shrugs-kh", m: "nacken", name: "Shrugs (Kurzhanteln)", t: "i" },
  { id: "shrugs-maschine", m: "nacken", name: "Shrugs (Maschine)", t: "i" },
  { id: "face-pulls", m: "nacken", name: "Face Pulls", t: "i" },
  { id: "nacken-flexion", m: "nacken", name: "Nackencurls (Flexion)", t: "i" },
  { id: "nacken-extension", m: "nacken", name: "Nackenstrecken (Extension)", t: "i" },

  // Schultern
  { id: "schulterdruecken-lh", m: "schultern", name: "Schulterdrücken (Langhantel, stehend)", t: "c" },
  { id: "schulterdruecken-kh", m: "schultern", name: "Schulterdrücken (Kurzhanteln)", t: "c" },
  { id: "schulterpresse", m: "schultern", name: "Schulterpresse (Maschine)", t: "c" },
  { id: "arnold", m: "schultern", name: "Arnold Press", t: "c" },
  { id: "seitheben-kh", m: "schultern", name: "Seitheben (Kurzhanteln)", t: "i" },
  { id: "seitheben-kabel", m: "schultern", name: "Seitheben (Kabel)", t: "i" },
  { id: "seitheben-maschine", m: "schultern", name: "Seitheben (Maschine)", t: "i" },
  { id: "frontheben", m: "schultern", name: "Frontheben", t: "i" },
  { id: "reverse-fly", m: "schultern", name: "Reverse Butterfly (hintere Schulter)", t: "i" },
  { id: "aufrechtes-rudern", m: "schultern", name: "Aufrechtes Rudern", t: "i" },

  // Bizeps
  { id: "curl-lh", m: "bizeps", name: "Langhantelcurls", t: "i" },
  { id: "curl-sz", m: "bizeps", name: "SZ-Curls", t: "i" },
  { id: "curl-kh", m: "bizeps", name: "Kurzhantelcurls", t: "i" },
  { id: "hammercurls", m: "bizeps", name: "Hammercurls", t: "i" },
  { id: "schraegbankcurls", m: "bizeps", name: "Schrägbankcurls", t: "i" },
  { id: "preacher", m: "bizeps", name: "Scottcurls (Preacher)", t: "i" },
  { id: "kabelcurls", m: "bizeps", name: "Kabelcurls", t: "i" },
  { id: "konzentrationscurls", m: "bizeps", name: "Konzentrationscurls", t: "i" },

  // Trizeps
  { id: "trizepsdruecken-kabel", m: "trizeps", name: "Trizepsdrücken am Kabel", t: "i" },
  { id: "overhead-kabel", m: "trizeps", name: "Überkopf-Trizepsstrecken (Kabel)", t: "i" },
  { id: "overhead-kh", m: "trizeps", name: "Überkopf-Trizepsstrecken (Kurzhantel)", t: "i" },
  { id: "french-press", m: "trizeps", name: "French Press / Skull Crusher", t: "i" },
  { id: "enges-bank", m: "trizeps", name: "Enges Bankdrücken", t: "c" },
  { id: "dips-trizeps", m: "trizeps", name: "Dips (Trizepsfokus)", t: "c" },
  { id: "kickbacks", m: "trizeps", name: "Kickbacks", t: "i" },

  // Unterarme
  { id: "handgelenkcurls", m: "unterarme", name: "Handgelenkcurls", t: "i" },
  { id: "reverse-handgelenk", m: "unterarme", name: "Reverse Handgelenkcurls", t: "i" },
  { id: "reverse-curls", m: "unterarme", name: "Reverse Curls", t: "i" },
  { id: "farmers-walk", m: "unterarme", name: "Farmer's Walk", t: "c" },

  // Quadrizeps
  { id: "kniebeuge", m: "quadrizeps", name: "Kniebeuge (Langhantel)", t: "c" },
  { id: "frontkniebeuge", m: "quadrizeps", name: "Frontkniebeuge", t: "c" },
  { id: "hackenschmidt", m: "quadrizeps", name: "Hackenschmidt-Kniebeuge", t: "c" },
  { id: "beinpresse", m: "quadrizeps", name: "Beinpresse", t: "c" },
  { id: "bulgarian", m: "quadrizeps", name: "Bulgarian Split Squats", t: "c" },
  { id: "ausfallschritte", m: "quadrizeps", name: "Ausfallschritte", t: "c" },
  { id: "beinstrecker", m: "quadrizeps", name: "Beinstrecker (Maschine)", t: "i" },

  // Beinbeuger
  { id: "rumaenisches-kh", m: "beinbeuger", name: "Rumänisches Kreuzheben", t: "c" },
  { id: "beincurl-sitzend", m: "beinbeuger", name: "Beinbeuger sitzend", t: "i" },
  { id: "beincurl-liegend", m: "beinbeuger", name: "Beinbeuger liegend", t: "i" },
  { id: "nordic-curls", m: "beinbeuger", name: "Nordic Curls", t: "i" },

  // Gesäß
  { id: "hip-thrust", m: "gesaess", name: "Hip Thrust", t: "c" },
  { id: "glute-bridge", m: "gesaess", name: "Glute Bridge", t: "c" },
  { id: "abduktoren", m: "gesaess", name: "Abduktorenmaschine", t: "i" },
  { id: "kabel-kickback", m: "gesaess", name: "Kabel-Kickbacks", t: "i" },

  // Waden
  { id: "wadenheben-stehend", m: "waden", name: "Wadenheben stehend", t: "i" },
  { id: "wadenheben-sitzend", m: "waden", name: "Wadenheben sitzend", t: "i" },
  { id: "wadenheben-beinpresse", m: "waden", name: "Wadendrücken an der Beinpresse", t: "i" },

  // Bauch
  { id: "crunches-kabel", m: "bauch", name: "Kabelcrunches", t: "i" },
  { id: "crunches", m: "bauch", name: "Crunches", t: "i" },
  { id: "beinheben-haengend", m: "bauch", name: "Beinheben hängend", t: "i" },
  { id: "bauchmaschine", m: "bauch", name: "Bauchmaschine", t: "i" },
  { id: "ab-wheel", m: "bauch", name: "Ab Wheel (Bauchroller)", t: "i" },
  { id: "plank", m: "bauch", name: "Plank (Sekunden statt Wdh.)", t: "i" }
];
