# Was liegt wo

Ein Projekt, drei Wege: Handy, PC-Browser, LibreOffice.

## Gemeinsam — die App selbst
Handy und PC-Browser benutzen dieselben Dateien. Nichts davon liegt doppelt.

    index.html            die Oberfläche
    css/style.css         das Aussehen
    js/app.js             die ganze Arbeit: Prüfer, KI, Gedächtnis, Kosten
    js/systempruefer.js   Brücke zum Rechtschreibprüfer von Android
    sw.js                 damit die App ohne Internet startet
    manifest.webmanifest  Name und Symbole der App
    daten/woerter.txt     die deutsche Wörterliste — die EINE Quelle

## Nur Android
    android/              der Kotlin-Rahmen um die App herum

Die App wird beim Bauen nach `android/app/src/main/assets/www/` kopiert.
Dieser Ordner ist von git ausgenommen; im Projekt liegt die App kein
zweites Mal.

## Nur LibreOffice
    libreoffice/schreibhilfe/schreibhilfe.py   Menü, Fenster, KI
    libreoffice/schreibhilfe/pruefung.py       der Prüfer ohne Internet
    libreoffice/schreibhilfe/tafel.py          die Tafel unten am Fenster
    libreoffice/schreibhilfe/*.xcu             meldet Menü und Befehle an
    libreoffice/bauen.sh                       packt schreibhilfe.oxt
    libreoffice/vergleiche.py / .js            hält beide Prüfer gleich

`bauen.sh` holt die Wörterliste beim Packen aus `daten/` und löscht sie
danach wieder — ein Stand, keine Kopie.

## Vorsicht: der Prüfer steht doppelt da

Einmal als JavaScript in `js/app.js`, einmal als Python in
`libreoffice/schreibhilfe/pruefung.py`. LibreOffice führt kein JavaScript
aus, deshalb geht es nicht anders. Auch die KI-Anweisungen und die
Tonfälle gibt es zweimal.

**Wer eine Regel ändert, muss sie an BEIDEN Stellen ändern.**

Danach prüfen, ob beide noch dasselbe finden:

    cd libreoffice && python3 vergleiche.py

## Auf dem PC, außerhalb dieses Ordners

    ~/.config/schreibhilfe/einstellungen.json
        Schlüssel, Tonfall, Gedächtnis, Kostenzähler (nur du: Rechte 600)

    ~/.config/libreoffice/4/user/uno_packages/…
        die installierte Erweiterung

Sicherungen des Gedächtnisses landen dort, wo man sie im Datei-Fenster
hinlegt.

## Erweiterung neu einspielen

LibreOffice ganz schließen, dann:

    cd libreoffice && ./bauen.sh
    unopkg remove de.schreibhilfe.writer
    unopkg add libreoffice/schreibhilfe.oxt
