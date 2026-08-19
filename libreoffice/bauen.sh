#!/bin/sh
# Packt die Erweiterung zu schreibhilfe.oxt (eine ZIP-Datei mit fester Endung).
#
# Die deutsche Wörterliste wird aus online/daten/ hereingeholt: Sie ist dieselbe,
# die auch in der Handy-App steckt — eine Quelle, kein zweiter Stand.
set -e
cd "$(dirname "$0")"
cp ../online/daten/woerter.txt schreibhilfe/woerter.txt
rm -f schreibhilfe.oxt
cd schreibhilfe
zip -r -q ../schreibhilfe.oxt . -x '*.pyc' -x '__pycache__/*'
cd ..
rm -f schreibhilfe/woerter.txt          # nur zum Packen, nicht ins Repo
echo "schreibhilfe.oxt gebaut ($(du -h schreibhilfe.oxt | cut -f1))"
