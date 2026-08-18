#!/bin/sh
# Packt die Erweiterung zu schreibhilfe.oxt (eine ZIP-Datei mit fester Endung).
set -e
cd "$(dirname "$0")"
rm -f schreibhilfe.oxt
cd schreibhilfe
zip -r -q ../schreibhilfe.oxt . -x '*.pyc' -x '__pycache__/*'
cd ..
echo "schreibhilfe.oxt gebaut ($(du -h schreibhilfe.oxt | cut -f1))"
