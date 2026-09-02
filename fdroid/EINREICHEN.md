# Die App in einen freien Laden bringen

Es gibt zwei Wege. **Der erste verlangt kein Konto mit Kreditkarte, der
zweite schon** — deshalb steht er zuerst.

---

## Weg 1: IzzyOnDroid (empfohlen)

IzzyOnDroid ist der größte fremde F-Droid-Laden, rund 1300 Apps. Wer F-Droid
auf dem Handy hat, kann diesen Laden mit zwei Klicks dazuschalten — viele
tun das.

**Der entscheidende Unterschied:** IzzyOnDroid baut nicht selbst, sondern
nimmt **deine eigene, von dir signierte APK** aus den GitHub-Releases. Die
Leute bekommen also genau die Datei, die du gebaut hast. Bei F-Droid wäre es
eine andere, mit deren Signatur.

Der Antrag läuft über **Codeberg** — ein gemeinnütziger deutscher Verein.
Dort braucht es nur Benutzernamen, E-Mail und Passwort. Keine Kreditkarte,
keine Ausweisprüfung.

### Die Bedingungen — alle geprüft am 2. September 2026

| | |
|---|---|
| Freie Lizenz (OSI) | MIT |
| Quelltext offen zugänglich | GitHub |
| Keine Werbung, keine Verfolgung | nur `androidx.core`, `appcompat`, `webkit` |
| `usesCleartextTraffic` | nicht gesetzt |
| Für Endnutzer, keine Bibliothek | ja |
| Eigener Paketname | `de.schreibhilfe.app` |
| Kein Fork | ja |
| Fastlane-Angaben mit Bildern | `fastlane/metadata/android/` |
| Mit Release-Schlüssel signiert | `CN=Schreibhilfe, O=Kay Siebke` |
| Nicht `debuggable`, nicht `testOnly` | geprüft, beides nicht gesetzt |
| APK unter 30 MB | 3,5 MB |
| APK liegt in den Releases | ja, ab `v1.0.1` |

### So geht es

1. Konto bei <https://codeberg.org> anlegen — Name, E-Mail, Passwort.
2. <https://codeberg.org/IzzyOnDroid/repo/issues> aufrufen und **New Issue**
   drücken.
3. Ein Issue für diese eine App. Hineinschreiben:

   * Was die App macht (zwei Sätze — der kurze Text aus
     `fastlane/metadata/android/en-US/short_description.txt` reicht)
   * Quelltext: <https://github.com/kaysiebke-cell/schreibhilfe>
   * Releases: <https://github.com/kaysiebke-cell/schreibhilfe/releases>
   * Lizenz: MIT
   * Hinweis, dass die Fastlane-Angaben samt Bildern im Verzeichnis liegen

Danach sieht sich jemand die App an. Es dauert meist Tage bis wenige Wochen.

---

## Weg 2: F-Droid selbst — nur wenn du das Konto willst

F-Droid ist größer und hat den bekannteren Katalog. Aber:

* Der Katalog liegt auf **gitlab.com**, und GitLab verlangt bei neuen Konten
  inzwischen eine Prüfung per **Kreditkarte** oder Telefonnummer. Für das
  Einreichen einer kostenlosen App ist das viel verlangt.
* F-Droid **baut selbst** und signiert mit eigenem Schlüssel. Wer die App
  vorher von GitHub installiert hat, kann nicht auf die F-Droid-Fassung
  aktualisieren — die Signaturen passen nicht zueinander. Er müsste erst
  deinstallieren, und dabei geht der gespeicherte Text verloren.

Wenn du es trotzdem willst, liegt die fertige Bau-Anleitung in
`fdroid/de.schreibhilfe.app.yml`:

1. Konto bei <https://gitlab.com>
2. <https://gitlab.com/fdroid/fdroiddata> forken
3. Datei `metadata/de.schreibhilfe.app.yml` anlegen, Inhalt aus
   `fdroid/de.schreibhilfe.app.yml` — **ohne** die Kommentarzeilen oben
4. Merge Request, Titel `New app: Schreibhilfe`

**Du musst das nicht selbst tun.** F-Droid nimmt Anträge auch von anderen an.
Wenn das Projekt irgendwo auffällt, macht das oft jemand mit vorhandenem
Konto.

---

## Weg 3: ganz ohne Laden

**Obtainium** ist eine Android-App, die andere Apps direkt aus
GitHub-Releases installiert und aktualisiert — kein Laden, kein Konto,
nirgends. Wer sie hat, fügt die Adresse

    https://github.com/kaysiebke-cell/schreibhilfe

ein und bekommt ab dann jedes Update von selbst.

Das funktioniert **heute schon**. Es fehlt nur die Auffindbarkeit: Man muss
die Adresse kennen.

---

## Bei jeder neuen Fassung

1. `versionCode` und `versionName` in `android/app/build.gradle` hochsetzen
2. Eintrag unter `fastlane/metadata/android/de-DE/changelogs/<versionCode>.txt`
   — das zeigen beide Läden als „Was ist neu"
3. Tag setzen und pushen:

```bash
git tag -a v1.0.2 -m "was neu ist" && git push origin v1.0.2
```

GitHub baut dann von selbst und legt ein Release an. **Nur ein Tag macht ein
Release** — ein Push auf `main` baut bloß zur Probe. So gibt es immer genau
eine neueste Fassung, und `/releases/latest/` zeigt immer darauf. IzzyOnDroid
holt sie sich von dort; bei F-Droid sorgt `UpdateCheckMode: Tags` dafür.
Ein zweiter Antrag ist in beiden Fällen nie wieder nötig.
