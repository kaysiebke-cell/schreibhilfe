/*
 * Läuft den Prüfteil aus js/app.js in node — ohne Browser, ohne Oberfläche.
 *
 * Zweck: Die Python-Übersetzung (schreibhilfe/pruefung.py) muss genau dasselbe
 * finden. Dieses Programm liefert die JavaScript-Seite des Vergleichs.
 *
 * Aufruf:  node vergleiche.js < saetze.txt   (ein Satz je Zeile, \n als \\n)
 * Ausgabe: eine JSON-Zeile je Satz
 */
'use strict';
const fs = require('fs');
const pfad = require('path');

const wurzel = pfad.join(__dirname, '..');
const quelle = fs.readFileSync(pfad.join(wurzel, 'js/app.js'), 'utf8');

/* Denselben Bereich herausschneiden wie beim Prüfen von Hand: von der
   Wörterliste bis zum Ende von findeProbleme(). */
const von = quelle.indexOf('const WOERTERBUCH = {');
let bis = quelle.indexOf('function findeProbleme');
bis = quelle.indexOf('\n}\n', bis) + 3;
const teil = quelle.slice(von, bis)
  /* Im Browser holt die App die Wörterliste selbst per fetch. Hier wird sie
     von außen hereingereicht — die eigene Deklaration muss deshalb weg, sonst
     stünde derselbe Name zweimal da. Der fetch-Aufruf dahinter läuft in seinen
     eigenen try/catch und bleibt wirkungslos. */
  .replace('let WOERTERBUCH_GROSS = null;', '');

/* Die vier Stellen, an denen der Prüfteil das Gedächtnis fragt. Für den
   Vergleich wird es von außen gesetzt. */
let GEDAECHTNIS = { woerter: {}, inRuhe: {} };
const Gelernt = {
  wort: (w) => GEDAECHTNIS.woerter[String(w).toLowerCase()] || null,
  inRuhe: (w) => !!GEDAECHTNIS.inRuhe[String(w).toLowerCase()],
  wortEbene: (fund) =>
    !!fund && fund.wortEbene === true &&
    typeof fund.alt === 'string' && typeof fund.neu === 'string' &&
    /^[A-Za-zÄÖÜäöüß-]+$/.test(fund.alt) &&
    fund.neu.trim() === fund.neu && fund.neu !== '',
};

const WOERTERBUCH_GROSS = new Set(
  fs.readFileSync(pfad.join(wurzel, 'daten/woerter.txt'), 'utf8').split('\n')
);

const bauen = new Function('Gelernt', 'WOERTERBUCH_GROSS',
  teil + '\nreturn { findeProbleme };');
const { findeProbleme } = bauen(Gelernt, WOERTERBUCH_GROSS);

const zeilen = fs.readFileSync(0, 'utf8').split('\n').filter((z) => z.length);
for (const zeile of zeilen) {
  const eingabe = JSON.parse(zeile);
  GEDAECHTNIS = eingabe.gelernt || { woerter: {}, inRuhe: {} };
  const funde = findeProbleme(eingabe.text).map((f) => ({
    von: f.von, bis: f.bis, alt: f.alt, neu: f.neu, grund: f.grund, art: f.art,
  }));
  process.stdout.write(JSON.stringify(funde) + '\n');
}
