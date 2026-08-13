# Schreib | hilfe

Eine Schreibhilfe fürs Handy. Kein App Store, keine Anmeldung. Ohne den
KI-Knopf verlässt kein Wort das Gerät.

## ⬇️ Aufs Handy — die App herunterladen

**➡️ [schreibhilfe.apk herunterladen](https://github.com/kaysiebke-cell/schreibhilfe/releases/download/v1.0/schreibhilfe.apk)**

Den Link **im Handy-Browser** öffnen → Datei antippen → *„Aus dieser Quelle
installieren"* erlauben → **Installieren**. Fertig.

Der Link bleibt bei jeder neuen Fassung derselbe — am besten als **Lesezeichen**
speichern. Ausführlich, samt Stolpersteinen: **[APK-HERUNTERLADEN.md](APK-HERUNTERLADEN.md)**

**Ohne Installation** geht es auch im Browser:
<https://kaysiebke-cell.github.io/schreibhilfe/>

## ✍️ Der schnelle Weg: gar nicht erst die App öffnen

Du musst **nicht** in die App wechseln, um dort zu schreiben. Schreib wie immer
in WhatsApp, Facebook oder der Mail-App:

1. Text **markieren**
2. **Teilen** → **Schreibhilfe** (oder im Markier-Menü direkt auf *Schreibhilfe*)
3. Der Text steht sofort da — **und ist schon geprüft**
4. Korrigieren → **Teilen** → zurück, wo er herkam

## Was die App macht — und was Android schon macht

Die App baut **nicht** nach, was das Handy schon kann. Sie ergänzt nur, was fehlt:

| Aufgabe | Wer macht das |
|---|---|
| Diktieren (sprechen statt tippen) | **Deine Tastatur** – Mikrofon-Taste auf Gboard |
| Wortvorschläge, Textbausteine | **Deine Tastatur** – Wörterbuch / Textersetzung |
| Einzelne Tippfehler rot unterringeln | **Deine Tastatur** – antippen, Vorschlag wählen |
| Teilen an WhatsApp, Facebook, Kontakte | **Android** – das System-Teilen-Menü |
| Vorlesen lassen | **Android** – „Vorlesen" / Auswahl vorlesen |
| Hell/Dunkel, Schriftgröße, Farbpalette | **Android** – die App übernimmt sie |
| das/dass, seit/seid, wider/wieder | ➜ **diese App** |
| „größer wie" → „größer als" | ➜ **diese App** |
| „wir hat" → „wir haben" | ➜ **diese App** |
| Komma vor „weil", „dass", „wenn", „aber" | ➜ **diese App** |
| Doppelte Wörter, Abstände, Satzanfänge | ➜ **diese App** |
| Zu lange Sätze, fehlender Punkt am Ende | ➜ **diese App** |
| Ganzen Text auf einmal korrigieren lassen | ➜ **diese App** (KI-Knopf) |
| Text aufbewahren und weiterreichen | ➜ **diese App** |

Der Knopf **„Prüfen"** sucht deshalb ausdrücklich nur nach Fehlern, die ein
Rechtschreibprüfer nicht finden *kann* — weil beide Schreibweisen für sich
genommen richtige Wörter sind. Jeder Fund wird einzeln angezeigt; nichts ändert
sich von allein, und **„Rückgängig"** holt jede Änderung zurück.

Die Funde haben drei Sorten, am farbigen Balken links zu erkennen:

* **Orange** — sicher falsch. „Wir hat" wird zu „Wir haben", der Satzanfang
  wird großgeschrieben, das doppelte Wort fliegt raus.
* **Blau mit Knopf** — kommt auf den Zusammenhang an: das fehlende Komma vor
  „weil", „dass" aus „das", der Punkt am Ende. Lies die Stelle noch einmal,
  bevor du änderst.
* **Blau ohne Knopf** — ein Hinweis zum Satzbau, kein Fehler: ein Satz mit
  30 Wörtern, eine Kette aus lauter „und", eine Klammer ohne Gegenstück. Hier
  gibt es nichts zu ersetzen, das entscheidest du selbst.

Lieber eine Lücke als ein falscher Alarm: Regeln, die auch richtige Sätze
anmeckern würden, sind bewusst nicht drin. „Das Buch, das ich gelesen habe"
bleibt deshalb in Ruhe, und „seit ihr Vater krank ist" ebenso.

**„Teilen"** öffnet das System-Teilen-Menü von Android — darin stehen WhatsApp,
SMS, E-Mail und alles andere. Eigene Knöpfe dafür hat die App nicht, das wäre
dieselbe Liste ein zweites Mal.

## 🎨 Was die App vom Handy übernimmt

* **Hell/Dunkel** — das Symbol oben rechts schaltet zwischen *wie das Handy*,
  *immer hell* und *immer dunkel*. In der ersten Stellung folgt die App der
  Systemeinstellung, auch nach einem Neustart.
* **Schriftgröße** — die Android-Einstellung wirkt in der App. A− / A+ kommen
  obendrauf.
* **Systemfarben** — ab Android 12 kann die App die Palette übernehmen, die
  Android aus deinem Hintergrundbild ableitet. Schalter im Zahnrad, lässt sich
  jederzeit abstellen. Grün, Gelb und Rot der Fundliste bleiben davon
  unberührt, damit ein gefundener Fehler erkennbar bleibt.

## 🤖 KI-Korrektur einschalten (freiwillig)

Ohne das funktioniert alles außer dem KI-Knopf — der taucht erst auf, wenn ein
Schlüssel hinterlegt ist.

1. Schlüssel holen auf <https://console.anthropic.com> ➜ *API Keys*
2. In der App oben rechts aufs Zahnrad ➜ Schlüssel einfügen ➜ *Speichern*

Der Schlüssel bleibt **nur auf diesem Handy** und geht an niemanden außer an
Anthropic beim Korrigieren.

Kosten je eine Million „Token" (eine normale E-Mail sind ein paar hundert):

| Modell | hinein | heraus |
|---|---|---|
| Opus 5 (beste Qualität) | 5 $ | 25 $ |
| Sonnet 5 (Mittelweg) | 3 $ | 15 $ |
| Haiku 4.5 (günstig, schnell) | 1 $ | 5 $ |

Für Briefe und Nachrichten reicht **Haiku 4.5** dicke — eine Korrektur kostet
dort Bruchteile eines Cents.

## 🔒 Datenschutz

* Der Text wird nur auf dem Handy gespeichert, beim Tippen automatisch.
* Ohne KI-Knopf verlässt **nichts** das Gerät.
* Beim KI-Knopf geht der Text an die Anthropic-Schnittstelle und kommt
  korrigiert zurück. Sonst nirgendwohin.
* „Löschen" räumt das Schreibfeld, das Zahnrad räumt den Schlüssel.

---

## Für die Werkbank

### Aufbau

```
index.html                    Aufbau der Seite
css/style.css                 Gestaltung (Papier-Optik, hell und dunkel)
js/app.js                     Prüfen, KI, Teilen, Einstellungen
sw.js                         Offline-Betrieb im Browser
manifest.webmanifest          Angaben für den Startbildschirm
icon.svg                      App-Symbol (Quelle)
icon-maskable.svg             dasselbe Motiv mit Rand — Android schneidet rund zu
icon-*.png                    daraus erzeugt, für den Startbildschirm im Browser

android/                      Rahmen für die APK (WebView um dieselbe Web-App)
.github/workflows/android.yml  baut die APK bei jedem Push
APK-HERUNTERLADEN.md          Anleitung fürs Handy + Signaturschlüssel
```

Die Dateien im Wurzelverzeichnis sind die **einzige Quelle**: dieselbe Web-App
bedient GitHub Pages *und* steckt in der APK. Der Android-Build kopiert sie beim
Bauen nach `assets/www`.

Geladen wird in der App über den `WebViewAssetLoader` unter
`https://appassets.androidplatform.net` statt über `file://` — nur so gelten
`localStorage` und die KI-Anfrage als sicherer Ursprung.

### Etwas ändern

```bash
git add -A && git commit -m "Änderung" && git push
```

Danach passiert von allein:

* **GitHub Pages** aktualisiert sich in ~1 Minute
* **GitHub Actions** baut eine neue APK und hängt sie an das Release `v1.0` —
  gleicher Link wie immer, ~3 Minuten

Der Workflow prüft nach dem Bauen selbst nach, ob `assets/www` wirklich in der
APK steckt, und bricht sonst ab. Ein früherer Lauf war grün und lieferte
trotzdem eine leere APK — die App wäre auf dem Handy weiß geblieben.

### Symbole neu erzeugen

Nur nötig, wenn sich `icon.svg` oder `icon-maskable.svg` ändert:

```bash
inkscape icon.svg -w 192 -h 192 -o icon-192.png && inkscape icon.svg -w 512 -h 512 -o icon-512.png && inkscape icon-maskable.svg -w 512 -h 512 -o icon-maskable-512.png
```

Danach die Zahl in `sw.js` (`schreibhilfe-vN`) hochsetzen, sonst behalten
bereits installierte Browser-Fassungen die alten Dateien.

### Am PC ausprobieren

```bash
python3 -m http.server 8321
```

Dann <http://localhost:8321> öffnen.

### Signaturschlüssel

Liegt außerhalb des Repos unter `~/schreibhilfe-signatur/` und ist als vier
Secrets im Repo hinterlegt. **Die `.jks`-Datei gut sichern** — geht sie
verloren, lässt sich nie wieder ein Update über eine bestehende Installation
legen. Einzelheiten in [APK-HERUNTERLADEN.md](APK-HERUNTERLADEN.md).
