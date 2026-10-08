#!/usr/bin/env bash
#
# start.sh — startet die native GTK-Fassung der Schreibhilfe.
#
# Wie linux/run-app.sh: Der Menüeintrag wird bei jedem Start frisch geschrieben,
# damit er nach einem Verschieben des Ordners wieder stimmt. Der Eintrag
# „Schreibhilfe" im Menü zeigt danach auf DIESE Fassung.
#
# Aufruf:  ./linux-native/start.sh               startet die App
#          ./linux-native/start.sh --desklet     rahmenlos rechts auf dem Desktop
#          ./linux-native/start.sh --nur-eintrag legt nur den Menüeintrag an

set -euo pipefail
HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WURZEL="$(cd "$HIER/.." && pwd)"
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
Comment=Text prüfen und korrigieren — als richtiges Linux-Programm
Exec="$HIER/start.sh"
Path=$HIER
Icon=$WURZEL/online/icon-512.png
StartupWMClass=schreibhilfe
Terminal=false
Categories=Office;
Keywords=Rechtschreibung;Korrektur;Legasthenie;Schreiben;
StartupNotify=true
DESKTOP
  chmod +x "$EINTRAG" "$HIER/schreibhilfe_gtk.py"
  update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
}

eintrag_schreiben
[ "${1:-}" = "--nur-eintrag" ] && { echo "Menüeintrag zeigt auf: $WURZEL"; exit 0; }

if ! python3 -c "import gi; gi.require_version('WebKit2','4.1'); gi.require_version('Gtk','3.0')" 2>/dev/null; then
  echo "Es fehlt etwas: sudo apt install gir1.2-webkit2-4.1 python3-gi gir1.2-gtk-3.0" >&2
  exit 1
fi
exec python3 "$HIER/schreibhilfe_gtk.py" "$@"
