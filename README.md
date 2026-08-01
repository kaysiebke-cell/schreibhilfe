# Schreib | hilfe

Eine Schreibhilfe fürs Handy. Kein App Store, keine Anmeldung, keine Daten
gehen irgendwohin. Die App legt sich auf den Startbildschirm und startet
danach auch ohne Internet.

## Was die App macht — und was Android schon macht

Die App baut **nicht** nach, was das Handy schon kann. Sie ergänzt nur das,
was fehlt:

| Aufgabe | Wer macht das |
|---|---|
| Diktieren (sprechen statt tippen) | **Deine Tastatur** – Mikrofon-Taste auf Gboard |
| Wortvorschläge, Textbausteine | **Deine Tastatur** – Wörterbuch / Textersetzung |
| Einzelne Tippfehler rot unterringeln | **Deine Tastatur** – antippen, Vorschlag wählen |
| Teilen an WhatsApp, Facebook, Kontakte | **Android** – das System-Teilen-Menü |
| Vorlesen lassen | **Android** – „Vorlesen“ / Auswahl vorlesen |
| das/dass, seit/seid, wider/wieder | ➜ **diese App** |
| Doppelte Wörter, Abstände, Satzanfänge | ➜ **diese App** |
| Ganzen Text auf einmal korrigieren lassen | ➜ **diese App** (KI-Knopf) |
| Text sicher aufbewahren und weiterreichen | ➜ **diese App** |

Der Knopf **„Text prüfen“** sucht deshalb ausdrücklich nur nach Fehlern, die
ein Rechtschreibprüfer nicht finden *kann* — weil beide Schreibweisen für sich
genommen richtige Wörter sind.

## Aufs Handy bringen

Die App braucht eine `https`-Adresse, sonst lässt Android sie nicht
installieren. Zwei einfache Wege:

**A) Netlify Drop** (am schnellsten, kein Konto nötig)
1. <https://app.netlify.com/drop> öffnen
2. Diesen Ordner ins Fenster ziehen
3. Die angezeigte Adresse auf dem Handy öffnen
4. Browser-Menü ➜ *Zum Startbildschirm hinzufügen*

**B) GitHub Pages**
1. Ordner in ein GitHub-Repository legen
2. *Settings ➜ Pages ➜ Deploy from branch ➜ main / root*
3. Adresse auf dem Handy öffnen und zum Startbildschirm hinzufügen

### Zum Ausprobieren am PC

```bash
python3 -m http.server 8321
```

Dann <http://localhost:8321> öffnen.

## KI-Korrektur einschalten (freiwillig)

Ohne das funktioniert alles außer dem Knopf „Mit KI korrigieren“.

1. Schlüssel holen auf <https://console.anthropic.com> ➜ *API Keys*
2. In der App oben rechts auf das Zahnrad ➜ Schlüssel einfügen ➜ *Speichern*

Der Schlüssel bleibt **nur auf diesem Handy** (im Speicher des Browsers) und
geht an niemanden außer an Anthropic beim Korrigieren.

Drei Modelle stehen zur Wahl. Kosten pro einer Million Zeichenbausteine
(„Token“ — eine normale E-Mail liegt bei ein paar hundert):

| Modell | hinein | heraus |
|---|---|---|
| Opus 5 (beste Qualität) | 5 $ | 25 $ |
| Sonnet 5 (Mittelweg) | 3 $ | 15 $ |
| Haiku 4.5 (günstig, schnell) | 1 $ | 5 $ |

Für Briefe und Nachrichten reicht **Haiku 4.5** dicke — da kostet eine
Korrektur Bruchteile eines Cents.

Nach jeder KI-Korrektur steht oben ein **Rückgängig**-Knopf. Der Text ist nie
verloren.

## Dateien

```
index.html            Aufbau der Seite
css/style.css         Gestaltung (Papier-Optik, hell und dunkel)
js/app.js             Ablauf: Prüfen, KI, Teilen, Einstellungen
sw.js                 Offline-Betrieb
manifest.webmanifest  Angaben für den Startbildschirm
icon.svg              App-Symbol
```

## Datenschutz

* Der Text wird nur im Browser des Handys gespeichert und beim Tippen
  automatisch gesichert.
* Ohne KI-Knopf verlässt **nichts** das Gerät.
* Beim KI-Knopf geht der Text an die Anthropic-Schnittstelle und kommt
  korrigiert zurück. Sonst nirgendwohin.
* „Alles löschen“ räumt das Schreibfeld, das Zahnrad räumt den Schlüssel.
