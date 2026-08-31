/*
 * Gibt die KI-Anweisungen aus online/js/app.js als JSON aus — ohne Browser.
 *
 * Zweck: Die Python-Übersetzung in schreibhilfe/schreibhilfe.py behauptet,
 * Wort für Wort dieselben Anweisungen zu schicken. Behauptet hat das die Datei
 * schon immer; nachgewiesen war es nie. Dieses Programm liefert die
 * JavaScript-Seite des Nachweises, vergleiche-anweisungen.py die andere.
 *
 * Aufruf:  node anweisungen.js
 * Ausgabe: ein JSON-Objekt, Name der Anweisung → fertiger Text
 */
'use strict';
const fs = require('fs');
const pfad = require('path');

const quelle = fs.readFileSync(
  pfad.join(__dirname, '..', 'online/js/app.js'), 'utf8');

/* Denselben Bereich herausschneiden wie vergleiche.js beim Prüfteil: von
   EMPFAENGER bis zum Ende von kiVorschlagAnweisung. Alles davor und danach
   hängt am Browser und ginge hier gar nicht erst zu laden. */
const von = quelle.indexOf('const EMPFAENGER = {');
const bis = quelle.indexOf('/* Der Bauplan der Antwort.');
if (von === -1 || bis <= von) {
  throw new Error('Der Anweisungsteil steht nicht mehr da, wo er stand.');
}
const teil = quelle.slice(von, bis);

/* Die zwei Stellen, an denen der Anweisungsteil nach außen greift. Für den
   Vergleich werden sie von hier gesetzt — die Python-Seite bekommt dieselben
   Werte gereicht. */
const Speicher = { lies: (name, ersatz) => STAND[name] !== undefined ? STAND[name] : ersatz };
const Gelernt = { steckbrief: () => STECKBRIEF };
let STAND = {};
let STECKBRIEF = '';

const teile = new Function('Speicher', 'Gelernt', teil +
  '\nreturn { EMPFAENGER, kiKorrektur, kiUebersetzung, kiVorschlagAnweisung, ' +
  'empfaengerLies, zettelLies, alsZettel };')(Speicher, Gelernt);

const ZETTEL = 'Widerspruch gegen die Kürzung — kurz und höflich';
const raus = {};

for (const name of Object.keys(teile.EMPFAENGER)) {
  raus['korrektur/' + name] = teile.kiKorrektur(name, '');
  raus['korrektur+zettel/' + name] = teile.kiKorrektur(name, ZETTEL);
  raus['vorschlaege/' + name] = teile.kiVorschlagAnweisung(name, '');
  raus['vorschlaege+zettel/' + name] = teile.kiVorschlagAnweisung(name, ZETTEL);
}
/* Ein unbekannter Name muss auf beiden Seiten dieselbe Rückfallstufe treffen. */
raus['korrektur/unbekannt'] = teile.kiKorrektur('Rumpelstilzchen', '');

/* Mit Gedächtnis: Der Steckbrief steht zwischen Zettel und Schlusssatz — genau
   dort ist beim Übersetzen von Hand am ehesten ein Leerzeichen zu verlieren. */
STECKBRIEF = ' Dieser Mensch schreibt erfahrungsgemäß diese Wörter falsch — '
  + 'achte besonders darauf: halloch statt hallo.';
raus['korrektur+steckbrief/Amt'] = teile.kiKorrektur('Amt', '');
raus['korrektur+zettel+steckbrief/Amt'] = teile.kiKorrektur('Amt', ZETTEL);
STECKBRIEF = '';

for (const sprache of ['Englisch', 'Türkisch']) {
  raus['uebersetzung/' + sprache] = teile.kiUebersetzung(sprache);
}

/* Die Wahl selbst: Was liest die App, wenn nichts, etwas Altes oder etwas
   Unbekanntes gespeichert ist? Die Python-Seite muss dieselbe Antwort geben. */
const wahlen = {};
for (const [beschreibung, stand] of [
  ['leer', {}],
  ['neu', { empfaenger: 'Forum' }],
  ['alt-amt', { tonfall: 'Förmlich (Amt)' }],
  ['alt-freundlich', { tonfall: 'Freundlich' }],
  ['alt-kurz', { tonfall: 'Kurz und sachlich' }],
  ['alt-wie-geschrieben', { tonfall: 'Wie geschrieben' }],
  ['unbekannt', { empfaenger: 'Rumpelstilzchen' }],
  ['beides', { empfaenger: 'Bewerbung', tonfall: 'Förmlich (Amt)' }],
]) {
  STAND = stand;
  wahlen[beschreibung] = teile.empfaengerLies();
}
STAND = {};

process.stdout.write(JSON.stringify({ anweisungen: raus, wahlen }, null, 1));
