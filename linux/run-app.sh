#!/usr/bin/env bash
#
# run-app.sh — startet die Schreibhilfe als eigenes Fenster, KEIN Browser.
#
# Nach demselben Muster wie die Aktenlage, weil es sich dort bewährt hat:
# Der Menüeintrag wird bei JEDEM Start frisch geschrieben. Eine .desktop-Datei
# braucht feste Pfade, und Pfade ändern sich — verschiebt man den Ordner oder
# benennt ihn um, zeigt der Eintrag ins Leere. Einmal von hier starten genügt,
# dann stimmt er wieder.
#
# Das Symbol wandert dabei in den festen Symbol-Ordner des Systems und wird
# im Eintrag nur noch beim Namen gerufen. Ein Symbol, das über den Projektpfad
# gesucht wird, verschwindet beim ersten Verschieben.
#
# Aufruf:  ./linux/run-app.sh              startet die App
#          ./linux/run-app.sh --nur-eintrag   legt nur den Menüeintrag an
#          ./linux/run-app.sh --weg           nimmt den Eintrag zurück

set -euo pipefail
HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"     # …/linux
WURZEL="$(cd "$HIER/.." && pwd)"                          # Projektwurzel
EINTRAG="$HOME/.local/share/applications/schreibhilfe.desktop"
SYMBOLE="$HOME/.local/share/icons/hicolor/512x512/apps"

eintrag_schreiben() {
  mkdir -p "$(dirname "$EINTRAG")" "$SYMBOLE"
  cp -f "$WURZEL/online/icon-512.png" "$SYMBOLE/schreibhilfe.png" 2>/dev/null || true
  cat > "$EINTRAG" <<DESKTOP
[Desktop Entry]
Version=1.0
Type=Application
Name=Schreibhilfe
GenericName=Rechtschreibhilfe
Comment=Text prüfen und korrigieren — dieselbe App wie auf dem Handy, ohne Browser
Exec="$HIER/run-app.sh"
Path=$HIER
Icon=schreibhilfe
StartupWMClass=schreibhilfe
Terminal=false
Categories=Office;Utility;
Keywords=Rechtschreibung;Korrektur;Legasthenie;Schreiben;Ollama;
StartupNotify=true
DESKTOP
  chmod +x "$EINTRAG" "$HIER/schreibhilfe.py"
  gtk-update-icon-cache "$HOME/.local/share/icons/hicolor" 2>/dev/null || true
  update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
}

if [ "${1:-}" = "--weg" ]; then
  rm -f "$EINTRAG" "$SYMBOLE/schreibhilfe.png"
  update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
  echo "Menüeintrag entfernt."
  exit 0
fi

eintrag_schreiben

if [ "${1:-}" = "--nur-eintrag" ]; then
  echo "Menüeintrag „Schreibhilfe“ zeigt jetzt auf: $WURZEL"
  exit 0
fi

# Fällt WebKit/GTK aus, wenigstens einen Hinweis geben statt still zu scheitern.
if ! python3 -c "import gi; gi.require_version('WebKit2','4.1')" 2>/dev/null; then
  command -v zenity >/dev/null && zenity --error \
    --text="WebKit2GTK 4.1 fehlt.\nBitte installieren:\n  sudo apt install gir1.2-webkit2-4.1 python3-gi" 2>/dev/null || \
    echo "WebKit2GTK 4.1 fehlt: sudo apt install gir1.2-webkit2-4.1 python3-gi" >&2
  exit 1
fi

exec python3 "$HIER/schreibhilfe.py"
