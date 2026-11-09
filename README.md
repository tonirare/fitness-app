# Fitness-App

Persönliche Web-App für Krafttraining und Ernährung. Läuft im Browser und kann auf dem iPhone wie eine echte App installiert werden. Alle Daten bleiben auf dem Handy.

## Aufbau
- `index.html`, `styles.css`: Seite und Design
- `js/app.js`: die ganze App-Logik
- `js/exercises.js`: Muskeln und Übungen (hier kannst du Übungen ergänzen)
- `js/badges.js`: Abzeichen und Prozentangaben
- `js/foods.js`: Lebensmittel-Grundliste (funktioniert offline)
- `sw.js`: Offline-Speicher. **Nach jeder Änderung `CACHE` hochzählen** (z. B. `fitness-v2`)

## Lokal testen
```bash
python -m http.server 8765
```
Dann http://localhost:8765 öffnen.

## Aufs iPhone bringen
Die App braucht eine HTTPS-Adresse (für Kamera und Offline-Modus), z. B. kostenlos über GitHub Pages:
1. Dateien in ein GitHub-Repository hochladen
2. Settings → Pages → Branch `main` auswählen
3. Den Link auf dem iPhone in **Safari** öffnen → Teilen → **Zum Home-Bildschirm**

## Später
- Fitness-Chat mit Claude
- KI-Schätzung von Mahlzeiten aus Freitext
