#!/bin/sh
# Packt die Erweiterung zu schreibhilfe.oxt (eine ZIP-Datei mit fester Endung).
#
# Wörterliste und Wortschatz werden aus online/daten/ hereingeholt: Es sind
# dieselben, die auch in der Handy-App stecken — eine Quelle, kein zweiter Stand.
set -e
cd "$(dirname "$0")"
cp ../online/daten/woerter.txt schreibhilfe/woerter.txt
cp ../online/daten/regeln.js  schreibhilfe/regeln.js
rm -f schreibhilfe.oxt
cd schreibhilfe
zip -r -q ../schreibhilfe.oxt . -x '*.pyc' -x '__pycache__/*'
cd ..
rm -f schreibhilfe/woerter.txt schreibhilfe/regeln.js   # nur zum Packen
echo "schreibhilfe.oxt gebaut ($(du -h schreibhilfe.oxt | cut -f1))"
