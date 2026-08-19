# Was liegt wo

Ein Projekt, drei Wege — und jeder hat seinen eigenen Ordner:

    online/       Handy und PC-Browser (das, was im Netz steht)
    android/      der Rahmen um die App herum, daraus wird die APK
    libreoffice/  die Erweiterung für Writer
    .github/      die Abläufe, die APK und Netz-Seite bauen

## online/ — die App selbst
Handy und PC-Browser benutzen dieselben Dateien. Nichts davon liegt doppelt.

    online/index.html            die Oberfläche
    online/css/style.css         das Aussehen
    online/js/app.js             die ganze Arbeit: Prüfer, KI, Gedächtnis, Kosten
    online/js/systempruefer.js   Brücke zum Rechtschreibprüfer von Android
    online/sw.js                 damit die App ohne Internet startet
    online/manifest.webmanifest  Name und Symbole der App
    online/daten/woerter.txt     die deutsche Wörterliste — die EINE Quelle

Dieser Ordner — und nur dieser — wird im Netz veröffentlicht, unter
https://kaysiebke-cell.github.io/schreibhilfe/ . Dafür sorgt
`.github/workflows/seite.yml`. Was hier nicht drinliegt, ist im Netz nicht
zu haben: Deshalb wohnt auch `daten/` mit hier drin.

## Nur Android
    android/              der Kotlin-Rahmen um die App herum

Die App wird beim Bauen aus `online/` nach
`android/app/src/main/assets/www/` kopiert.
Dieser Ordner ist von git ausgenommen; im Projekt liegt die App kein
zweites Mal.

## Nur LibreOffice
    libreoffice/schreibhilfe/schreibhilfe.py   Menü, Fenster, KI
    libreoffice/schreibhilfe/pruefung.py       der Prüfer ohne Internet
    libreoffice/schreibhilfe/tafel.py          die Tafel unten am Fenster
    libreoffice/schreibhilfe/*.xcu             meldet Menü und Befehle an
    libreoffice/bauen.sh                       packt schreibhilfe.oxt
    libreoffice/vergleiche.py / .js            hält beide Prüfer gleich

`bauen.sh` holt die Wörterliste beim Packen aus `online/daten/` und löscht
sie danach wieder — ein Stand, keine Kopie.

## Vorsicht: der Prüfer steht doppelt da

Einmal als JavaScript in `online/js/app.js`, einmal als Python in
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
