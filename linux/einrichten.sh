#!/bin/sh
# Legt den Menüeintrag für das eigene Fenster an.
#
# Kein Installieren im eigentlichen Sinn: Es wird nur eine Verknüpfung
# geschrieben, die auf diesen Ordner zeigt. Verschiebt man den Ordner, muss
# das Skript noch einmal laufen. Entfernen geht mit --weg.

set -e
ORDNER=$(cd "$(dirname "$0")/.." && pwd)
ZIEL="$HOME/.local/share/applications/schreibhilfe-eigen.desktop"

if [ "$1" = "--weg" ]; then
  rm -f "$ZIEL"
  update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
  echo "Menüeintrag entfernt."
  exit 0
fi

# Ohne WebKitGTK geht es nicht — lieber jetzt sagen als beim ersten Klick.
if ! python3 -c "import gi; gi.require_version('WebKit2','4.1')" 2>/dev/null; then
  echo "Es fehlt WebKitGTK. Einmalig nachinstallieren:" >&2
  echo "    sudo apt install python3-gi gir1.2-webkit2-4.1" >&2
  exit 1
fi

chmod +x "$ORDNER/linux/schreibhilfe.py"
mkdir -p "$(dirname "$ZIEL")"
sed "s|ORDNER|$ORDNER|g" "$ORDNER/linux/schreibhilfe.desktop" > "$ZIEL"
chmod +x "$ZIEL"
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true

echo "Fertig. „Schreibhilfe (eigenes Fenster)“ steht jetzt im Menü."
echo "Ordner: $ORDNER"
