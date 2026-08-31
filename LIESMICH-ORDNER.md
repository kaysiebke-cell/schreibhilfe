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
    online/daten/regeln.js       der Wortschatz der Prüfung — die EINE Quelle

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
    libreoffice/vergleiche-anweisungen.py      hält beide KI-Anweisungen gleich
    libreoffice/anweisungen.js                 liefert dafür die App-Seite

`bauen.sh` holt Wörterliste und Wortschatz beim Packen aus `online/daten/`
und löscht sie danach wieder — ein Stand, keine Kopie.

## Vorsicht: der Prüfer steht halb doppelt da

**Der Wortschatz nicht mehr.** Wörterbuch, Wortgruppen, Nebensatzwörter,
Zeitwortformen — alles steht einmal in `online/daten/regeln.js`, und beide
Seiten lesen von dort. JavaScript über ein `<script>`-Element, Python über
`json.loads`. Wer ein Wort hinzufügt, fügt es einmal hinzu.

Dass das nötig war, hat sich gezeigt, als die beiden Abschriften verglichen
wurden: `FOLGT_NEBENSATZ` stand in Python mit dreizehn Wörtern mehr da als in
JavaScript — seit dem Tag, an dem die Übersetzung angelegt wurde. Über 7183
Prüfsätze gemessen waren das 1644 Sätze, in denen die beiden Fassungen etwas
anderes fanden. `vergleiche.py` lief die ganze Zeit grün durch, weil keiner
seiner 56 Sätze diese Wörter benutzte.

**Die Regeln selbst stehen weiter doppelt da** — einmal als JavaScript in
`online/js/app.js`, einmal als Python in `libreoffice/schreibhilfe/pruefung.py`.
Sie tragen Baustücke und Prüfungen als Code und lassen sich nicht als Daten
hinschreiben. LibreOffice führt kein JavaScript aus, deshalb geht es nicht
anders. Auch die KI-Anweisungen und die sechs Empfänger gibt es zweimal.

**Wer eine REGEL ändert, muss sie an BEIDEN Stellen ändern.**

Danach prüfen, ob beide noch dasselbe finden:

    cd libreoffice && python3 vergleiche.py

Und daran denken, was der Fund oben zeigt: Grün heißt nur, dass die 56 Sätze
nichts gemerkt haben. Wer eine Regel anfasst, legt einen Satz dazu, der sie
auch trifft.

**Dasselbe gilt für die KI-ANWEISUNGEN.** Sie standen jahrelang doppelt da mit
dem Versprechen „Wort für Wort dieselben", das niemand nachgerechnet hat. Ein
verlorenes Leerzeichen klebt zwei Sätze zusammen, ein geändertes Wort lässt den
PC anders korrigieren als das Handy — beides sieht man einer Anweisung nicht
an. Seit August 2026 gibt es dafür ein eigenes Werkzeug:

    cd libreoffice && python3 vergleiche-anweisungen.py

Es baut jede Anweisung auf beiden Seiten und vergleicht sie zeichengenau: alle
sechs Empfänger, mit und ohne Zettel, mit und ohne Gedächtnis, dazu das
Übersetzen und die Frage, welchen Empfänger eine alte Einstellungsdatei
ergibt. Für die JavaScript-Seite schneidet `anweisungen.js` denselben Bereich
aus `app.js` heraus, wie es `vergleiche.js` beim Prüfteil tut; die
Python-Seite lädt `schreibhilfe.py` mit untergeschobenen UNO-Hüllen, damit es
ohne LibreOffice geht.

## Auf dem PC, außerhalb dieses Ordners

    ~/.config/schreibhilfe/einstellungen.json
        Schlüssel, Empfänger, Gedächtnis, Kostenzähler (nur du: Rechte 600)
        Der Zettel „Worum geht's?" steht NICHT darin — er gehört zum Text
        und lebt nur, solange die Tafel offen ist.

    ~/.config/libreoffice/4/user/uno_packages/…
        die installierte Erweiterung

Sicherungen des Gedächtnisses landen dort, wo man sie im Datei-Fenster
hinlegt.

## Erweiterung neu einspielen

LibreOffice ganz schließen, dann:

    cd libreoffice && ./bauen.sh
    unopkg remove de.schreibhilfe.writer
    unopkg add libreoffice/schreibhilfe.oxt
