# 📱 Schreibhilfe aufs Handy laden

## ⬇️ Direkt herunterladen (immer die neueste Fassung)

**➡️ [schreibhilfe.apk herunterladen](https://github.com/kaysiebke-cell/schreibhilfe/releases/latest/download/schreibhilfe.apk)**

Diese Datei wird bei **jeder Änderung automatisch aktualisiert** — der Link bleibt
aber immer derselbe. Am besten im Handy-Browser als **Lesezeichen** speichern.

*(Falls der Link mal klemmt: [alle Fassungen ansehen](https://github.com/kaysiebke-cell/schreibhilfe/releases/latest) → unter „Assets" auf `schreibhilfe.apk`.)*

## 📲 Installieren — 3 Schritte

1. Den Link oben **im Handy-Browser** öffnen → `schreibhilfe.apk` lädt herunter.
2. Die Datei **öffnen** (Benachrichtigung antippen oder in „Downloads").
3. Wenn gefragt: **„Aus dieser Quelle installieren" erlauben** → **Installieren**.

Passiert beim Antippen nichts, fehlt die Freigabe:
**Einstellungen → Apps → Spezieller App-Zugriff → Unbekannte Apps installieren** →
Browser bzw. Dateien-App erlauben.

## ✍️ So sparst du dir den Umweg

Du musst die App **nicht** erst öffnen und dort schreiben. Schreib wie immer in
WhatsApp, Facebook oder der Mail-App — und lass dann prüfen:

1. Text **markieren**
2. **Teilen** (oder im Markier-Menü auf **Schreibhilfe**)
3. **Schreibhilfe** wählen → der Text steht sofort da und ist schon geprüft
4. Korrigieren → **Teilen** → zurück in die App, aus der er kam

## ⚠️ Beim Aktualisieren

- **Nicht vorher deinstallieren** — einfach die neue APK **über die alte drüber
  installieren**. Dann bleiben dein gespeicherter Text und dein API-Schlüssel erhalten.
- Behält der Browser die alte Datei in „Downloads"? Dann die alte
  `schreibhilfe.apk` dort löschen, damit du sicher die neue erwischst.

## 🔑 Einmalig: Signaturschlüssel anlegen

Ohne festen Schlüssel bekommt jede APK eine andere Signatur — Android verweigert
dann das Drüber-Installieren, und du müsstest jedes Mal deinstallieren (Text und
API-Schlüssel wären weg).

Einmal am PC anlegen:

```bash
keytool -genkeypair -v -keystore schreibhilfe.jks -keyalg RSA -keysize 2048 \
        -validity 10000 -alias schreibhilfe
```

Dann in GitHub hinterlegen (*Settings → Secrets and variables → Actions*):

| Name | Inhalt |
|---|---|
| `SIGNIER_KEYSTORE_B64` | Ausgabe von `base64 -w0 schreibhilfe.jks` |
| `SIGNIER_KEYSTORE_PASSWORT` | das Passwort für die Datei |
| `SIGNIER_ALIAS` | `schreibhilfe` |
| `SIGNIER_ALIAS_PASSWORT` | das Passwort für den Alias |

**Die `.jks`-Datei gut aufheben** — geht sie verloren, lässt sich nie wieder ein
Update über die bestehende Installation legen.

Solange die Schlüssel fehlen, baut GitHub eine Debug-APK. Die lässt sich
installieren und benutzen, nur Updates darüber gehen dann nicht.

## Ohne Installation: im Browser

Geht auch ohne APK: <https://kaysiebke-cell.github.io/schreibhilfe/>
