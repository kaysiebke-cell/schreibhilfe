# Die App bei F-Droid einreichen

F-Droid ist der freie App-Laden für Android. Er nimmt keine fertige APK
entgegen, sondern **baut selbst aus dem Quelltext** — deshalb steht in der
Anleitung unten nur, wo der Quelltext liegt und wie er gebaut wird.

Das ist der größte Hebel für Sichtbarkeit, den dieses Projekt hat: Dort
suchen Menschen aktiv nach Werkzeugen, und es kostet nichts.

## Vorher prüfen

* [x] Lizenz ist MIT und liegt im Verzeichnis
* [x] Keine unfreien Abhängigkeiten — nur `androidx.core`, `androidx.appcompat`,
      `androidx.webkit`
* [x] Der Bau läuft **ohne** Signaturschlüssel durch (dann Debug-Schlüssel)
* [x] `versionCode` und `versionName` stehen fest im Quelltext, nicht nur in
      einer Umgebungsvariablen — F-Droid baut ohne die
* [x] Beschreibungen und Bilder liegen unter `fastlane/metadata/android/`
* [x] Ein Git-Tag `v1.0.1` zeigt auf den Stand, der gebaut werden soll
      — gesetzt am 2. September 2026, Stand `cb94d67`

Damit ist alles bereit. Für die nächste Fassung geht das so:

```bash
git tag -a v1.0.2 -m "was neu ist"
git push origin v1.0.2
```

## Einreichen

1. Konto bei <https://gitlab.com> anlegen (nicht GitHub — F-Droid liegt auf
   GitLab).
2. <https://gitlab.com/fdroid/fdroiddata> aufrufen und **Fork** drücken.
3. In deinem Fork die Datei `metadata/de.schreibhilfe.app.yml` anlegen und den
   Inhalt aus `fdroid/de.schreibhilfe.app.yml` hineinkopieren — **ohne** die
   Kommentarzeilen ganz oben.
4. **Merge Request** auf `fdroid/fdroiddata` stellen. Titel: `New app:
   Schreibhilfe`.

Danach baut die F-Droid-Maschine die App und meldet sich, wenn etwas fehlt.
Es dauert meist einige Wochen und es kommen Rückfragen — das ist normal und
kein schlechtes Zeichen.

## Bei jeder neuen Fassung

1. `versionCode` und `versionName` in `android/app/build.gradle` hochsetzen
2. Einen Eintrag unter `fastlane/metadata/android/de-DE/changelogs/<versionCode>.txt`
   anlegen — F-Droid zeigt ihn im Laden als „Was ist neu"
3. Tag setzen und pushen

`UpdateCheckMode: Tags` sorgt dafür, dass F-Droid neue Tags von selbst findet.
Ein zweiter Merge Request ist dann nicht nötig.

## Was im Laden steht

| | |
|---|---|
| Titel | `fastlane/metadata/android/de-DE/title.txt` |
| Ein Satz | `short_description.txt` |
| Der lange Text | `full_description.txt` |
| Bilder | `images/` — Symbol, Kopfbild, drei Bildschirmfotos |

Alles auf Deutsch **und** Englisch. Die englische Fassung sagt ausdrücklich,
dass die App nur Deutsch prüft — sonst laden sie Leute herunter, denen sie
nicht helfen kann.
