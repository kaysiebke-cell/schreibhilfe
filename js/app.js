/* ============================================================
   Schreib | hilfe — App-Logik
   Läuft komplett im Handy-Browser. Ohne Internet funktioniert
   alles außer dem KI-Knopf.
   ============================================================ */

'use strict';

const $ = (id) => document.getElementById(id);

const el = {
  text:          $('text'),
  zaehler:       $('zaehler'),
  btnLeeren:     $('btn-leeren'),
  btnPruefen:    $('btn-pruefen'),
  btnKi:         $('btn-ki'),
  btnZurueck:    $('btn-zurueck'),
  status:        $('status'),
  funde:         $('funde'),
  btnTeilen:     $('btn-teilen'),
  btnKopieren:   $('btn-kopieren'),
  dlg:           $('dlg-settings'),
  btnSettings:   $('btn-settings'),
  btnSettingsZu: $('btn-settings-zu'),
  apiKey:        $('api-key'),
  modell:        $('modell'),
  btnSpeichern:  $('btn-speichern'),
  btnSchluesselWeg: $('btn-schluessel-weg'),
  btnKleiner:    $('btn-kleiner'),
  btnGroesser:   $('btn-groesser'),
  btnTheme:      $('btn-theme'),
  themeSymbol:   $('theme-symbol'),
  feldSystemfarben: $('feld-systemfarben'),
  systemfarben:  $('systemfarben'),
};

/* ------------------------------------------------------------
   Speicher — bleibt auf diesem Gerät
   ------------------------------------------------------------ */
const Speicher = {
  lies(schluessel, ersatz) {
    try {
      const wert = localStorage.getItem('sh.' + schluessel);
      return wert === null ? ersatz : JSON.parse(wert);
    } catch { return ersatz; }
  },
  schreib(schluessel, wert) {
    try { localStorage.setItem('sh.' + schluessel, JSON.stringify(wert)); } catch {}
  },
  loesch(schluessel) {
    try { localStorage.removeItem('sh.' + schluessel); } catch {}
  },
};

/* Kleines Icon-Element bauen (für Meldungen, die im Code entstehen) */
function icon(name, klasse = 'ic') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', klasse);
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#' + name);
  svg.appendChild(use);
  return svg;
}

/* ============================================================
   1. Darstellung: Hell/Dunkel und Schriftgröße
   ============================================================ */

/* Drei Stellungen statt zwei: „auto“ richtet sich nach dem Handy — auch nach
   einem Neustart. Vorher war die einmal getroffene Wahl für immer festgenagelt. */
const THEMEN = ['auto', 'light', 'dark'];
const THEMA_TEXT = {
  auto:  ['i-auto', 'Farben: wie das Handy'],
  light: ['i-sun',  'Farben: immer hell'],
  dark:  ['i-moon', 'Farben: immer dunkel'],
};
const systemMag = matchMedia('(prefers-color-scheme: dark)');

function themaLies() {
  const w = Speicher.lies('theme', 'auto');
  return THEMEN.includes(w) ? w : 'auto';
}

function themaAnwenden() {
  const wahl = themaLies();
  const dunkel = wahl === 'dark' || (wahl === 'auto' && systemMag.matches);
  document.documentElement.dataset.theme = dunkel ? 'dark' : 'light';

  const [symbol, beschriftung] = THEMA_TEXT[wahl];
  el.themeSymbol.setAttribute('href', '#' + symbol);
  el.btnTheme.title = beschriftung;
  el.btnTheme.setAttribute('aria-label', beschriftung + ' – zum Umschalten tippen');

  meldeLeisten(dunkel);
}

/* Die Systemleisten oben und unten gehören zur App, liegen aber außerhalb der
   Web-Seite. Ohne diese Meldung bliebe eine dunkle App mit hellen Leisten
   stehen, sobald die Wahl in der App vom System abweicht. */
function meldeLeisten(dunkel) {
  const stil = getComputedStyle(document.documentElement);
  const oben  = stil.getPropertyValue('--paper-raised').trim() || '#F7F6F1';
  const unten = stil.getPropertyValue('--paper').trim()        || '#EDECE5';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', oben);
  if (typeof window.AndroidBridge?.leisten === 'function') {
    try { window.AndroidBridge.leisten(dunkel, oben, unten); } catch {}
  }
}

el.btnTheme.addEventListener('click', () => {
  Speicher.schreib('theme', THEMEN[(THEMEN.indexOf(themaLies()) + 1) % THEMEN.length]);
  themaAnwenden();
});

// Nur in der Stellung „auto“ auf einen Wechsel am Handy reagieren.
systemMag.addEventListener('change', () => { if (themaLies() === 'auto') themaAnwenden(); });

/* ------------------------------------------------------------
   Systemfarben (Material You). Die Palette reicht die Android-App
   als window.SystemFarben herein; im Browser gibt es sie nicht.
   Die Bedeutungsfarben (grün/gelb/rot) bleiben unangetastet — ein
   gefundener Fehler muss erkennbar bleiben, egal welches
   Hintergrundbild eingestellt ist.
   ------------------------------------------------------------ */
const FARB_ZUORDNUNG = {
  petrol:'--petrol', petrolDeep:'--petrol-deep', paper:'--paper',
  paperRaised:'--paper-raised', surface:'--surface', ink:'--ink',
  inkSoft:'--ink-soft', line:'--line',
};

function alsRegel(auswahl, satz) {
  const zeilen = Object.entries(FARB_ZUORDNUNG)
    .filter(([k]) => satz[k])
    .map(([k, v]) => v + ':' + satz[k]);
  return auswahl + '{' + zeilen.join(';') + '}';
}

function systemfarbenAnwenden() {
  const palette = window.SystemFarben;
  el.feldSystemfarben.hidden = !palette;
  const an = !!palette && Speicher.lies('systemfarben', true);
  el.systemfarben.checked = an;

  let stil = document.getElementById('systemfarben-stil');
  if (an) {
    if (!stil) {
      stil = document.createElement('style');
      stil.id = 'systemfarben-stil';
      document.head.appendChild(stil);
    }
    stil.textContent =
      alsRegel(':root[data-systemfarben][data-theme="light"]', palette.hell) +
      alsRegel(':root[data-systemfarben][data-theme="dark"]',  palette.dunkel);
    document.documentElement.dataset.systemfarben = 'an';
  } else {
    stil?.remove();
    delete document.documentElement.dataset.systemfarben;
  }
  meldeLeisten(document.documentElement.dataset.theme === 'dark');
}

el.systemfarben.addEventListener('change', () => {
  Speicher.schreib('systemfarben', el.systemfarben.checked);
  systemfarbenAnwenden();
});
// Die Palette trifft erst ein, wenn die Seite fertig geladen ist.
window.addEventListener('systemfarben', systemfarbenAnwenden);

themaAnwenden();
systemfarbenAnwenden();

let schriftgroesse = Speicher.lies('schrift', 1.05);
function setzeSchrift(wert) {
  schriftgroesse = Math.min(1.75, Math.max(0.9, Math.round(wert * 100) / 100));
  document.documentElement.style.setProperty('--schrift', schriftgroesse + 'rem');
  Speicher.schreib('schrift', schriftgroesse);
}
setzeSchrift(schriftgroesse);
el.btnGroesser.addEventListener('click', () => setzeSchrift(schriftgroesse + 0.1));
el.btnKleiner .addEventListener('click', () => setzeSchrift(schriftgroesse - 0.1));

/* ============================================================
   2. Schreibfeld: automatisch sichern, Wörter zählen
   ============================================================ */

el.text.value = Speicher.lies('text', '');

function textGeaendert() {
  Speicher.schreib('text', el.text.value);
  const woerter = el.text.value.trim() ? el.text.value.trim().split(/\s+/).length : 0;
  // Bei leerem Text bleibt der Zähler leer — dann sieht man ihn gar nicht.
  el.zaehler.textContent = woerter === 0 ? '' : woerter === 1 ? '1 Wort' : woerter + ' Wörter';
}
/* Nur echtes Tippen löst „input“ aus. Setzt die App den Text selbst (Löschen,
   Ändern, KI), bleibt das Ereignis aus — der Pfeil überlebt also genau die
   Änderung, die er zurücknehmen soll. */
el.text.addEventListener('input', () => {
  textGeaendert();
  vergissZurueck();
});
textGeaendert();

/* Kein „Wirklich löschen?“-Fenster: In der Android-App gibt es kein
   window.confirm — es liefert wortlos false, und der Knopf täte dann gar
   nichts. Der Text ist auch so nicht weg, „Rückgängig“ holt ihn zurück. */
el.btnLeeren.addEventListener('click', () => {
  if (!el.text.value) return;
  merkeFuerZurueck(el.text.value);
  el.text.value = '';
  textGeaendert();
  el.funde.innerHTML = '';
  el.status.textContent = 'Text gelöscht. Mit dem Pfeil daneben zurückholen.';
});

/* Rückgängig für Korrekturen */
let vorherigerText = null;
function merkeFuerZurueck(t) {
  vorherigerText = t;
  el.btnZurueck.hidden = false;
}

/* Sobald wieder getippt wird, ist der gemerkte Stand überholt: Er stammt von
   vor der Änderung, und ihn jetzt zurückzuholen würde das Neugeschriebene
   wegwerfen. Also verschwindet der Pfeil wieder — und mit ihm der Knopf, der
   die Leiste auf zwei Zeilen auseinandergezogen hat. Vorher blieb sie
   auseinandergeklappt, bis die App neu gestartet wurde. */
function vergissZurueck() {
  if (vorherigerText === null) return;
  vorherigerText = null;
  el.btnZurueck.hidden = true;
  el.status.textContent = '';
}
el.btnZurueck.addEventListener('click', () => {
  if (vorherigerText === null) return;
  el.text.value = vorherigerText;
  vorherigerText = null;
  el.btnZurueck.hidden = true;
  el.funde.innerHTML = '';
  el.status.textContent = '';
  textGeaendert();
});

/* ============================================================
   3. Offline-Prüfung: Rechtschreibung, Grammatik, Satzbau
   ============================================================ */

/* ------------------------------------------------------------
   ABSICHTLICH KURZ.
   Einzelne Tippfehler (seperat, standart, villeicht …) unterringelt die
   Android-Tastatur bereits rot – dafür braucht es hier keine zweite Liste.
   Hier stehen nur die Fälle, die ein Rechtschreibprüfer NICHT finden kann,
   weil beide Schreibweisen für sich genommen richtige Wörter sind, sowie
   Zusammenschreibungen, bei denen die Tastatur zwar meckert, aber nicht
   weiß, wo das Wort getrennt gehört.

   Beginnt die Verbesserung mit einem Großbuchstaben, wird sie genau so
   übernommen (Hauptwörter). Sonst richtet sie sich nach dem Original.
   ------------------------------------------------------------ */
const WOERTERBUCH = {
  /* wider (= gegen) und wieder (= noch einmal): beide Wörter gibt es.
     Der Rechtschreibprüfer sieht hier nichts Falsches. */
  'wiederspiegeln':'widerspiegeln', 'wiederspiegelt':'widerspiegelt',
  'wiedersprechen':'widersprechen', 'wiederspricht':'widerspricht',
  'wiederspruch':'Widerspruch', 'wiederstand':'Widerstand',
  'widerholen':'wiederholen', 'widerholt':'wiederholt', 'widersehen':'Wiedersehen',

  /* ss statt ß, wo die falsche Form ebenfalls ein gültiges Wort ist.
     Nicht aufgenommen: masse/Maße und busse/Buße – „Masse“ und „Busse“
     sind selbst richtige Wörter, das gäbe falsche Treffer. */
  'weiss':'weiß', 'gross':'groß',

  /* Zusammengeschrieben: die Tastatur meckert, kennt aber die Trennstelle nicht. */
  'garnicht':'gar nicht', 'garnichts':'gar nichts',
  'garkein':'gar kein', 'garkeine':'gar keine',
  'aufjedenfall':'auf jeden Fall', 'aufeinmal':'auf einmal',
  'ausversehen':'aus Versehen', 'zumbeispiel':'zum Beispiel',
  'immoment':'im Moment', 'inordnung':'in Ordnung', 'imgrunde':'im Grunde',
  'vorallem':'vor allem', 'desweiteren':'des Weiteren',
  'nachwievor':'nach wie vor', 'zumindestens':'zumindest',
  'zumteil':'zum Teil', 'jedesmal':'jedes Mal', 'garkeinen':'gar keinen',

  /* Englisch/Deutsch-Dubletten, die als Wort durchgehen. */
  'tip':'Tipp', 'tips':'Tipps', 'email':'E-Mail', 'emails':'E-Mails',
};

/* Wörter inklusive Umlauten, ß und Bindestrich */
const WORT_MUSTER = /[A-Za-zÄÖÜäöüß]+(?:-[A-Za-zÄÖÜäöüß]+)*/g;

function uebernimmSchreibweise(original, verbesserung) {
  if (/^[A-ZÄÖÜ]/.test(verbesserung)) return verbesserung;          // Hauptwort
  if (original === original.toUpperCase() && original.length > 1) return verbesserung.toUpperCase();
  if (/^[A-ZÄÖÜ]/.test(original)) return verbesserung[0].toUpperCase() + verbesserung.slice(1);
  return verbesserung;
}

/* Leerzeichen sind unsichtbar. Wo genau sie der Fehler sind, muss man sie sehen. */
const zeigeLeer = (s) => s.replace(/ /g, '␣').replace(/\n/g, '⏎');

/* Jeder Fund hat eine von drei Arten:
   fehler  – sicher falsch (oranger Balken)
   tipp    – kommt auf den Zusammenhang an, deshalb selbst noch einmal lesen
   hinweis – nur zum Nachdenken, es gibt nichts zum Ändern (kein Knopf) */
function machFund(von, bis, alt, neu, grund, art, leer) {
  return {
    von, bis, alt, neu,
    zeigeAlt: leer ? zeigeLeer(alt) : alt,
    zeigeNeu: leer ? zeigeLeer(neu) : neu,
    grund, art,
  };
}

/* ------------------------------------------------------------
   Der Regelmotor.
   Eine Regel besteht aus einem Muster, einem Bauplan für den Ersatz und
   einer Begründung in einfachen Worten. Dazu drei Schalter:
     pruefe   – darf einen Treffer nachträglich verwerfen
     gruppe   – grenzt den Fund auf eine Klammer ein: das Muster darf die
                Umgebung mitlesen, angezeigt und ersetzt wird nur die Klammer
     leer     – macht Leerzeichen im Vorher/Nachher sichtbar
   ------------------------------------------------------------ */
function wendeRegelnAn(text, regeln, funde) {
  for (const regel of regeln) {
    for (const treffer of text.matchAll(regel.muster)) {
      if (regel.pruefe && !regel.pruefe(treffer, text)) continue;
      const versatz = regel.gruppe ? treffer.slice(1, regel.gruppe).join('').length : 0;
      const alt = regel.gruppe ? treffer[regel.gruppe] : treffer[0];
      const neu = regel.bau(...treffer);
      if (neu === alt) continue;
      const von = treffer.index + versatz;
      funde.push(machFund(von, von + alt.length, alt, neu,
                          regel.grund, regel.art || 'fehler', regel.leer));
    }
  }
}

/* ------------------------------------------------------------
   a) Wörter aus der Liste oben
   ------------------------------------------------------------ */
function pruefeWoerter(text, funde) {
  for (const treffer of text.matchAll(WORT_MUSTER)) {
    const wort = treffer[0];
    const richtig = WOERTERBUCH[wort.toLowerCase()];
    if (!richtig) continue;
    const ersatz = uebernimmSchreibweise(wort, richtig);
    if (ersatz === wort) continue;
    funde.push(machFund(treffer.index, treffer.index + wort.length,
                        wort, ersatz, 'Schreibweise', 'fehler'));
  }
}

/* ------------------------------------------------------------
   b) Abstände und Satzzeichen
   ------------------------------------------------------------ */

/* Steht direkt vor dieser Stelle eine Abkürzung („z. B.“, „usw.“)? Dann ist der
   Punkt kein Satzende, und weder Leerzeichen noch Großschreibung fehlen. */
const ABKUERZUNG = /(?:^|[\s(„"])(?:[A-Za-zÄÖÜäöüß]|ca|bzw|usw|evtl|ggf|inkl|exkl|vgl|bspw|Nr|Dr|Prof|Abs|Mio|Mrd|Tel|Str)\.$/;
const istAbkuerzung = (text, punkt) => ABKUERZUNG.test(text.slice(Math.max(0, punkt - 9), punkt + 1));

/* Web- und E-Mail-Adressen haben ihre eigenen Punkte. */
const istAdresse = (text, stelle) =>
  /[@]|https?:|www\.|\.(de|com|org|net|eu)\b/i.test(text.slice(Math.max(0, stelle - 25), stelle + 25));

/* Folgt hinter dem Treffer ein großgeschriebenes Wort?
   Muss außerhalb des Musters stehen: Regeln mit „i“ sehen den Unterschied
   zwischen groß und klein nicht mehr — auch nicht in [A-ZÄÖÜ]. */
const grossDahinter = (treffer, text) =>
  /^[ \t]+[A-ZÄÖÜ]/.test(text.slice(treffer.index + treffer[0].length));

const ZEICHEN_REGELN = [
  { muster:/ {2,}/g,                        bau:() => ' ', leer:true,
    grund:'Mehrere Leerzeichen hintereinander' },
  { muster:/[ \t]+([,.;:!?])/g,             bau:(m, z) => z, leer:true,
    grund:'Vor dem Satzzeichen gehört kein Leerzeichen' },
  { muster:/([,;:])([A-Za-zÄÖÜäöüß])/g,     bau:(m, z, b) => z + ' ' + b, leer:true,
    grund:'Nach dem Satzzeichen fehlt ein Leerzeichen' },
  /* Punkt/Ausrufe-/Fragezeichen, direkt gefolgt vom nächsten Satz.
     Mindestens zwei Buchstaben davor, damit Abkürzungen wie „z.B.“ in Ruhe
     gelassen werden – die beiden Wächter halten den Rest raus. */
  { muster:/([A-Za-zÄÖÜäöüß]{2}[.!?])([A-Za-zÄÖÜäöüß])/g,
    bau:(m, z, b) => z + ' ' + b, leer:true,
    pruefe:(treffer, text) => !istAdresse(text, treffer.index)
                           && !istAbkuerzung(text, treffer.index + 2),
    grund:'Nach dem Satzzeichen fehlt ein Leerzeichen' },
  /* Drei Punkte sind Absicht, zwei sind ein Versehen. */
  { muster:/,{2,}/g,                        bau:() => ',',
    grund:'Das Komma steht doppelt da' },
  { muster:/([;:!?])\1+/g,                  bau:(m, z) => z,
    grund:'Das Satzzeichen steht doppelt da' },
  { muster:/\b([A-Za-zÄÖÜäöüß]+)([ \t]+)\1\b/gi, bau:(m, w) => w,
    grund:'Das Wort steht doppelt da' },
  /* „Peter's Auto“ – der Apostroph kommt aus dem Englischen. */
  { muster:/\b([A-ZÄÖÜ][A-Za-zÄÖÜäöüß]{1,})['’´`]s\b/g, bau:(m, name) => name + 's',
    art:'tipp',
    grund:'Vor dem Genitiv-s steht im Deutschen kein Apostroph.' },
];

/* ------------------------------------------------------------
   c) Großschreibung
   ------------------------------------------------------------ */

/* Nach „beim/zum/vom“ wird aus dem Tunwort ein Hauptwort: „beim Schreiben“.
   Diese Wörter sehen genauso aus, sind aber keine Hauptwörter — sie stehen
   vor einem Hauptwort oder bilden eine feste Wendung („zum einen“). */
const KEIN_HAUPTWORT = new Set([
  'einen','anderen','ersten','zweiten','dritten','vierten','letzten','meisten',
  'wenigsten','besten','ganzen','großen','kleinen','neuen','alten','guten',
  'schönen','gleichen','selben','vergangenen','nächsten','kommenden','langen',
  'kurzen','jungen','hohen','tiefen','warmen','kalten','richtigen','falschen',
  'eigenen','beiden','vielen','wenigen','allen','keinen','solchen','diesen',
  'jenen','meinen','deinen','seinen','ihren','unseren','euren','teuren',
]);

const GROSS_REGELN = [
  // Der allererste Buchstabe
  { muster:/(^[ \t]*)([a-zäöüß])/g, gruppe:2,
    bau:(m, vor, b) => b.toUpperCase(),
    grund:'Satzanfang großschreiben' },
  /* Nach Punkt, Ausrufe- oder Fragezeichen — auch über einen Zeilenumbruch
     hinweg. Eine neue Zeile allein ist kein Satzanfang: nach der Anrede
     („Liebe Anna,“) geht es klein weiter, und umbrochene Absätze aus anderen
     Apps stünden sonst voller falscher Funde.
     Auslassungspunkte („warte … dann“) sind ebenfalls kein Satzende. */
  { muster:/([.!?]+["»›)]?\s+)([a-zäöüß])/g, gruppe:2,
    bau:(m, vor, b) => b.toUpperCase(),
    pruefe:(treffer, text) => !/^\.{2,}/.test(treffer[1])
                           && !istAbkuerzung(text, treffer.index)
                           && !istAdresse(text, treffer.index),
    grund:'Satzanfang großschreiben' },
  // „beim schreiben“ → „beim Schreiben“. Folgt ein großgeschriebenes Wort,
  // ist das -en-Wort ein Eigenschaftswort davor („zum neuen Haus“) — Finger weg.
  { muster:/\b(beim|zum|vom|ans|aufs)([ \t]+)([a-zäöüß]{3,}en)\b/gi,
    gruppe:3,
    bau:(m, vor, l, wort) => wort[0].toUpperCase() + wort.slice(1),
    pruefe:(treffer, text) => !KEIN_HAUPTWORT.has(treffer[3].toLowerCase())
                           && !/sten$/i.test(treffer[3])
                           && !grossDahinter(treffer, text),
    art:'tipp',
    grund:'Nach „beim/zum/vom“ wird aus dem Tunwort ein Hauptwort.' },
];

/* ------------------------------------------------------------
   d) Grammatik: die Verwechslungen, die kein Rechtschreibprüfer sieht
   ------------------------------------------------------------ */

const FUERWOERTER = 'ich|du|er|sie|es|wir|ihr|man';

/* Zeitwörter, nach denen „dass“ folgt. Absichtlich nur die gebeugten Formen:
   nach einem Mittelwort („das Buch gelesen, das ich …“) steht oft ein
   Bezugswort, da wäre „das“ richtig. */
const DENK_ZEITWOERTER =
  'denke|denkst|denkt|dachte|dachtest|dachten|glaube|glaubst|glaubt|glaubte|glaubten|' +
  'hoffe|hoffst|hofft|hoffte|meine|meinst|meint|meinte|finde|findest|findet|fand|' +
  'weiß|weißt|wissen|wusste|wusstest|wussten|sage|sagst|sagt|sagte|sagten|' +
  'erzähle|erzählst|erzählt|erzählte|verstehe|verstehst|versteht|vermute|vermutest|vermutet|' +
  'fürchte|fürchtest|fürchtet|bedeutet|heißt|hieß|merke|merkst|merkt|merkte|' +
  'sehe|siehst|sieht|höre|hörst|hört|schreibe|schreibst|schreibt|schrieb|' +
  'verspreche|versprichst|verspricht|bemerke|bemerkt|entschuldige';

/* Zeitangaben nach „seit“. */
const ZEITANGABEN =
  'einem|einer|dem|der|den|ein|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|' +
  'vielen|mehreren|einigen|kurzem|langem|längerem|geraumer|damals|gestern|heute|' +
  'neuestem|jeher|wann|Jahren?|Monaten?|Wochen?|Tagen?|Stunden?|Minuten?|' +
  'Jahrzehnten?|Ewigkeiten|Anfang|Beginn|Montag|Dienstag|Mittwoch|Donnerstag|' +
  'Freitag|Samstag|Sonntag';

/* Steigerungsformen. Danach heißt es „als“, nie „wie“. Bewusst als Liste und
   nicht als Endung „-er“: sonst geriete jedes „der wie …“ in die Fänge. */
const STEIGERUNGEN =
  'größer|kleiner|besser|schlechter|schneller|langsamer|älter|jünger|höher|tiefer|' +
  'länger|kürzer|stärker|schwächer|lieber|teurer|billiger|schöner|hässlicher|' +
  'einfacher|leichter|schwerer|öfter|näher|dicker|dünner|wärmer|kälter|klüger|' +
  'dümmer|lauter|leiser|glücklicher|müder|wichtiger|schlimmer|ruhiger|netter|' +
  'freundlicher|klarer|heller|dunkler|weicher|härter|süßer|gesünder|reicher|' +
  'ärmer|sicherer|genauer|deutlicher|häufiger|seltener|breiter|schmaler|' +
  'hübscher|mehr|weniger|anders';

/* Zeitwörter ohne Wem-Fall: „Ich glaube, dass der Zug kommt“. Nach „sagen“ oder
   „schreiben“ darf hinter dem „das“ auch ein Wem-Fall stehen („Ich schreibe das
   der Firma“) — deshalb stehen die hier nicht mit drin. */
const DENK_ZEITWOERTER_ENG =
  'glaube|glaubst|glaubt|glaubte|denke|denkst|denkt|dachte|meine|meinst|meint|meinte|' +
  'hoffe|hoffst|hofft|hoffte|weiß|weißt|wusste|vermute|vermutet|fürchte|fürchtet|' +
  'verstehe|versteht|bedeutet|heißt';

/* Eigenschaftswörter, nach denen ein „dass“-Satz folgt: „Es ist gut, dass …“ */
const DASS_EIGENSCHAFTEN =
  'wichtig|wichtiger|gut|schön|schade|klar|froh|sicher|möglich|schlimm|toll|' +
  'blöd|traurig|nett|richtig|falsch|schlecht|logisch|normal|selten';

/* Was hinter dem „dass“ stehen darf, ohne dass es ein Bezugswort sein könnte.
   „ein/eine“ fehlt mit Absicht: „das eine Auto“ ist richtig so. */
const FOLGT_NEBENSATZ = FUERWOERTER + '|die|der|den|dem|kein|keine|keinen';

const GRAMMATIK_REGELN = [
  /* das/dass nach einem Zeitwort des Denkens und Sagens. Fehlt auch noch das
     Komma, kommt es gleich mit — beides gehört zusammen. */
  { muster:new RegExp('\\b(' + DENK_ZEITWOERTER + ')(,?)([ \\t]+)das\\b' +
                      '(?=[ \\t]+(?:' + FUERWOERTER + ')\\b)', 'gi'),
    bau:(m, verb, komma, l) => verb + ',' + l + 'dass',
    art:'tipp',
    grund:'Hier leitet „dass“ den Nebensatz ein – mit Komma davor.' },
  { muster:new RegExp('\\b(' + DENK_ZEITWOERTER_ENG + ')(,?)([ \\t]+)das\\b' +
                      '(?=[ \\t]+(?:' + FOLGT_NEBENSATZ + ')\\b)', 'gi'),
    bau:(m, verb, komma, l) => verb + ',' + l + 'dass',
    art:'tipp',
    grund:'Hier leitet „dass“ den Nebensatz ein – mit Komma davor.' },
  { muster:new RegExp('\\b(' + DASS_EIGENSCHAFTEN + ')(,?)([ \\t]+)das\\b' +
                      '(?=[ \\t]+(?:' + FOLGT_NEBENSATZ + ')\\b)', 'gi'),
    bau:(m, wort, komma, l) => wort + ',' + l + 'dass',
    art:'tipp',
    grund:'Hier leitet „dass“ den Nebensatz ein – mit Komma davor.' },

  /* seit/seid */
  { muster:new RegExp('\\bseid([ \\t]+)(?=(?:' + ZEITANGABEN + ')\\b)', 'gi'),
    bau:(m, l) => 'seit' + l,
    grund:'Bei Zeitangaben heißt es „seit“ – „seid“ nur bei „ihr seid“.' },
  /* „Seit ihr das wisst …“ – aber „Seit ihr Vater gestorben ist“ bleibt stehen:
     folgt ein Hauptwort, gehört „ihr“ dazu und „seit“ ist richtig. */
  { muster:/\bseit([ \t]+)ihr\b/gi,
    bau:(m, l) => 'seid' + l + 'ihr',
    pruefe:(treffer, text) => !grossDahinter(treffer, text),
    grund:'„ihr seid“ – hier gehört ein d ans Ende.' },
  { muster:new RegExp('\\bihr([ \\t]+)seit\\b(?![ \\t]+(?:' + ZEITANGABEN + ')\\b)', 'gi'),
    bau:(m, l) => 'ihr' + l + 'seid',
    grund:'„ihr seid“ – hier gehört ein d ans Ende.' },
  { muster:/\bseit([ \t]+)(ruhig|still|nett|lieb|vorsichtig|ehrlich|froh|gegrüßt|willkommen|gespannt|unbesorgt|bereit)\b/gi,
    bau:(m, l, wort) => 'seid' + l + wort,
    grund:'Aufforderung an mehrere: „seid ruhig“ mit d.' },

  /* Vergleich: größer als, nicht größer wie */
  { muster:new RegExp('\\b(' + STEIGERUNGEN + ')([ \\t]+)wie\\b', 'gi'),
    bau:(m, wort, l) => wort + l + 'als',
    grund:'Nach der Steigerung heißt es „als“: größer als, lieber als.' },
  { muster:/\bals([ \t]+)wie\b/gi,
    bau:() => 'als',
    grund:'„als wie“ ist doppelt gemoppelt – „als“ reicht.' },
];

/* ------------------------------------------------------------
   e) Komma vor dem Nebensatz
   ------------------------------------------------------------ */

/* Nach diesen Wörtern folgt kein Komma: „auch wenn“, „und weil“, „so dass“
   gehören zusammen, das Komma stünde davor. */
const KEIN_KOMMA_DAVOR = new Set([
  'und','oder','aber','sondern','denn','so','als','auch','selbst','sogar','außer',
  'nur','immer','je','erst','schon','gerade','eben','besonders','allem','dann',
  'noch','kaum','wie','egal','ganz','vor','doch','geschweige',
]);

/* Wort → braucht es ein Fürwort dahinter, damit es sicher ein Nebensatz ist?
   „damit“ und „während“ gibt es auch ohne Nebensatz („damit bin ich zufrieden“,
   „während des Essens“) — da wäre ein Komma falsch. */
const NEBENSATZ_WOERTER = [
  ['dass', false], ['weil', false], ['obwohl', false], ['sodass', false],
  ['sobald', false], ['solange', false], ['bevor', false], ['nachdem', false],
  ['falls', false], ['sofern', false], ['indem', false], ['wenn', false],
  ['ob', false], ['damit', true], ['während', true],
];

const KOMMA_REGELN = NEBENSATZ_WOERTER.map(([wort, nurVorFuerwort]) => ({
  muster: new RegExp('\\b([A-Za-zÄÖÜäöüß]{2,})([ \\t]+)(' + wort + ')\\b' +
                     (nurVorFuerwort ? '(?=[ \\t]+(?:' + FUERWOERTER + ')\\b)' : ''), 'gi'),
  bau: (m, davor, l, schluessel) => davor + ',' + l + schluessel,
  pruefe: (treffer) => !KEIN_KOMMA_DAVOR.has(treffer[1].toLowerCase()),
  art: 'tipp',
  grund: 'Vor „' + wort + '“ beginnt ein Nebensatz – da gehört ein Komma hin.',
})).concat([
  /* „aber/sondern/denn“ verbinden zwei Sätze — dann steht ein Komma davor.
     Nur mit Fürwort dahinter, sonst gerät „Das ist aber schön“ mit hinein. */
  { muster:new RegExp('\\b([A-Za-zÄÖÜäöüß]{2,})([ \\t]+)(aber|sondern|denn)\\b' +
                      '(?=[ \\t]+(?:' + FUERWOERTER + ')\\b)', 'gi'),
    bau:(m, davor, l, wort) => davor + ',' + l + wort,
    pruefe:(treffer) => !KEIN_KOMMA_DAVOR.has(treffer[1].toLowerCase()),
    art:'tipp',
    grund:'Hier stoßen zwei Sätze aneinander – davor gehört ein Komma.' },
]);

/* ------------------------------------------------------------
   f) Passt das Zeitwort zum Fürwort?

   „ich habe“, „du hast“, „er hat“ — wer da durcheinanderkommt, hört es beim
   eigenen Lesen oft nicht. Geprüft werden die acht häufigsten Zeitwörter und
   nur die Fürwörter, die eindeutig sind: „sie“, „ihr“ und „es“ bleiben außen
   vor, weil dort beide Formen richtig sein können („sie ist“ und „sie sind“,
   „ihr ist kalt“, „es sind viele gekommen“).
   ------------------------------------------------------------ */
const ZEITWOERTER = [
  { ich:'bin',   du:'bist',   er:'ist',  wir:'sind'   },
  { ich:'habe',  du:'hast',   er:'hat',  wir:'haben'  },
  { ich:'werde', du:'wirst',  er:'wird', wir:'werden' },
  { ich:'kann',  du:'kannst', er:'kann', wir:'können' },
  { ich:'muss',  du:'musst',  er:'muss', wir:'müssen' },
  { ich:'will',  du:'willst', er:'will', wir:'wollen' },
  { ich:'soll',  du:'sollst', er:'soll', wir:'sollen' },
  { ich:'darf',  du:'darfst', er:'darf', wir:'dürfen' },
];
const SPALTE = { ich:'ich', du:'du', er:'er', man:'er', wir:'wir' };
const FORM_ZU_ZEITWORT = new Map();
for (const zeile of ZEITWOERTER) {
  for (const form of Object.values(zeile)) FORM_ZU_ZEITWORT.set(form, zeile);
}

const KONGRUENZ_MUSTER = [
  // „wir hat“
  { muster:/\b(ich|du|er|man|wir)([ \t]+)([a-zäöüß]+)\b/gi, fuerwort:1, form:3 },
  // „hat wir“ — in Fragen und nach vorangestelltem Satzteil
  { muster:/\b([a-zäöüß]+)([ \t]+)(ich|du|er|man|wir)\b/gi, fuerwort:3, form:1 },
];

function pruefeKongruenz(text, funde) {
  for (const stelle of KONGRUENZ_MUSTER) {
    for (const treffer of text.matchAll(stelle.muster)) {
      const fuerwort = treffer[stelle.fuerwort];
      const form = treffer[stelle.form];
      const zeile = FORM_ZU_ZEITWORT.get(form.toLowerCase());
      if (!zeile) continue;
      const richtig = zeile[SPALTE[fuerwort.toLowerCase()]];
      if (!richtig || richtig === form.toLowerCase()) continue;

      const alt = treffer[0];
      const neu = stelle.form === 1
        ? uebernimmSchreibweise(form, richtig) + treffer[2] + fuerwort
        : fuerwort + treffer[2] + uebernimmSchreibweise(form, richtig);
      funde.push(machFund(treffer.index, treffer.index + alt.length, alt, neu,
        'So passt das Zeitwort zum Fürwort: „' + fuerwort.toLowerCase() + ' ' + richtig + '“.',
        'fehler'));
    }
  }
}

/* ------------------------------------------------------------
   g) Der Punkt am Ende
   ------------------------------------------------------------ */
function pruefeSatzende(text, funde) {
  const bisEnde = text.replace(/\s+$/, '');
  if (!bisEnde || /[.!?:…»"'\)\]]$/.test(bisEnde)) return;
  /* Gezählt wird nur die letzte Zeile: „Herzliche Grüße“ und ein Name darunter
     sind ganze Sätze, brauchen aber keinen Punkt. */
  const woerter = bisEnde.slice(bisEnde.lastIndexOf('\n') + 1).trim().split(/\s+/);
  if (woerter.length < 5) return;
  const letztes = woerter[woerter.length - 1];
  if (!/[A-Za-zÄÖÜäöüß0-9]$/.test(letztes)) return;
  const von = bisEnde.length - letztes.length;
  funde.push(machFund(von, bisEnde.length, letztes, letztes + '.',
                      'Am Ende fehlt der Punkt.', 'tipp'));
}

/* ------------------------------------------------------------
   h) Satzbau: Hinweise ohne Knopf

   Hier gibt es nichts zu ersetzen — der Satz ist nicht falsch, er ist nur
   schwer zu lesen. Deshalb steht kein „Ändern“ daneben, nur der Hinweis.
   ------------------------------------------------------------ */
function machHinweis(von, bis, grund, stelle) {
  return { von, bis, alt:'', neu:'', grund, stelle, art:'hinweis' };
}

function pruefeSatzbau(text, hinweise) {
  for (const treffer of text.matchAll(/[^.!?\n]+/g)) {
    const roh = treffer[0];
    const satz = roh.trim();
    if (!satz) continue;
    const anfang = treffer.index + roh.indexOf(satz[0]);
    const woerter = satz.split(/\s+/).length;
    const binder = (satz.match(/\b(und|oder|aber|dann|weil)\b/gi) || []).length;

    if (woerter > 25) {
      hinweise.push(machHinweis(anfang, anfang + satz.length,
        'Langer Satz: ' + woerter + ' Wörter. Zwei kürzere Sätze liest man leichter.', satz));
    } else if (woerter >= 12 && binder >= 3) {
      hinweise.push(machHinweis(anfang, anfang + satz.length,
        'Der Satz hängt an vielen Bindewörtern. Ein Punkt dazwischen tut ihm gut.', satz));
    }
  }

  /* Zeichen, die immer zu zweit auftreten. Fehlt der Partner, merkt man es
     beim Schreiben selten. */
  const paare = [
    ['(', ')', 'Klammern'],
    ['„', '“', 'Anführungszeichen'],
  ];
  for (const [auf, zu, name] of paare) {
    const offen = text.split(auf).length - 1;
    const geschlossen = text.split(zu).length - 1;
    if (offen !== geschlossen) {
      hinweise.push(machHinweis(text.length, text.length,
        name + ': ' + offen + '-mal geöffnet, ' + geschlossen + '-mal geschlossen.', ''));
    }
  }
  const geraden = text.split('"').length - 1;
  if (geraden % 2 === 1) {
    hinweise.push(machHinweis(text.length, text.length,
      'Ein Anführungszeichen steht allein da.', ''));
  }
}

/* ------------------------------------------------------------
   Zwei Funde an derselben Stelle gehen nicht: die erste Änderung würde die
   zweite ins Leere laufen lassen. Nach dem Ändern wird ohnehin neu gesucht,
   dann taucht der verdeckte Fund von selbst wieder auf.
   ------------------------------------------------------------ */
function ohneUeberschneidung(funde) {
  funde.sort((a, b) => a.von - b.von || (b.bis - b.von) - (a.bis - a.von));
  const behalten = [];
  let bisher = -1;
  for (const fund of funde) {
    if (fund.von < bisher) continue;
    behalten.push(fund);
    bisher = fund.bis;
  }
  return behalten;
}

/* Sucht alle Stellen, die auffällig sind. */
function findeProbleme(text) {
  const korrekturen = [];
  pruefeWoerter(text, korrekturen);
  wendeRegelnAn(text, ZEICHEN_REGELN, korrekturen);
  wendeRegelnAn(text, GROSS_REGELN, korrekturen);
  wendeRegelnAn(text, GRAMMATIK_REGELN, korrekturen);
  wendeRegelnAn(text, KOMMA_REGELN, korrekturen);
  pruefeKongruenz(text, korrekturen);
  pruefeSatzende(text, korrekturen);

  const hinweise = [];
  pruefeSatzbau(text, hinweise);

  // Erst das zum Ändern, danach das zum Nachdenken.
  return ohneUeberschneidung(korrekturen).concat(hinweise);
}

function zeigeFunde() {
  el.funde.innerHTML = '';
  el.status.textContent = '';
  const text = el.text.value;

  if (!text.trim()) { el.status.textContent = 'Es steht noch kein Text da.'; return; }

  const funde = findeProbleme(text);

  if (funde.length === 0) { el.status.textContent = 'Nichts gefunden.'; return; }

  for (const fund of funde) {
    const karte = document.createElement('div');
    karte.className = 'fund fund--' + fund.art;

    const beschreibung = document.createElement('div');
    beschreibung.className = 'fund__text';

    if (fund.art === 'hinweis') {
      // Nichts zu ersetzen: statt „falsch → richtig“ steht hier der Satz selbst.
      if (fund.stelle) {
        const stelle = document.createElement('div');
        stelle.className = 'fund__stelle';
        stelle.textContent = '„' + kuerze(fund.stelle) + '“';
        beschreibung.appendChild(stelle);
      }
    } else {
      const zeile = document.createElement('div');
      zeile.className = 'fund__wort';
      const alt = document.createElement('span'); alt.className = 'fund__falsch';  alt.textContent = fund.zeigeAlt;
      const pfeil = document.createElement('span'); pfeil.className = 'fund__pfeil'; pfeil.textContent = '→';
      const neu = document.createElement('span'); neu.className = 'fund__richtig'; neu.textContent = fund.zeigeNeu;
      zeile.append(alt, pfeil, neu);
      beschreibung.appendChild(zeile);
    }

    const grund = document.createElement('small');
    grund.className = 'fund__grund';
    grund.textContent = fund.grund;
    beschreibung.appendChild(grund);
    karte.appendChild(beschreibung);

    if (fund.art !== 'hinweis') {
      const knopf = document.createElement('button');
      knopf.className = 'btn btn--primary btn--small';
      knopf.append(icon('i-check'), document.createTextNode(' Ändern'));
      knopf.addEventListener('click', () => {
        const jetzt = el.text.value;
        // Sicherheitsprüfung: Steht an dieser Stelle noch dasselbe?
        if (jetzt.slice(fund.von, fund.bis) !== fund.alt) { zeigeFunde(); return; }
        merkeFuerZurueck(jetzt);
        el.text.value = jetzt.slice(0, fund.von) + fund.neu + jetzt.slice(fund.bis);
        textGeaendert();
        zeigeFunde();   // neu suchen, damit die Positionen wieder stimmen
      });
      karte.appendChild(knopf);
    }

    el.funde.appendChild(karte);
  }

  el.status.textContent = zusammenfassung(funde);
}

const kuerze = (satz) => satz.length > 70 ? satz.slice(0, 70).trimEnd() + ' …' : satz;

/* Eine Zeile, die sich vorlesen lässt: wie viel ist es, und was davon ist was. */
function zusammenfassung(funde) {
  const hinweise = funde.filter((f) => f.art === 'hinweis').length;
  const aendern = funde.length - hinweise;
  const teile = [];
  if (aendern)  teile.push(aendern === 1 ? '1 Stelle zum Ändern' : aendern + ' Stellen zum Ändern');
  if (hinweise) teile.push(hinweise === 1 ? '1 Hinweis zum Satzbau' : hinweise + ' Hinweise zum Satzbau');
  return teile.join(' · ') + '.';
}

el.btnPruefen.addEventListener('click', zeigeFunde);

/* ============================================================
   4. KI-Korrektur — braucht Internet und einen API-Schlüssel
   ============================================================ */

const KI_ANWEISUNG =
  'Du bist eine Schreibhilfe für einen Menschen mit Legasthenie. ' +
  'Korrigiere im folgenden deutschen Text die Rechtschreibung, die Grammatik ' +
  'und die Zeichensetzung. Behalte Wortwahl, Tonfall und Inhalt bei – ändere ' +
  'nichts am Sinn und erfinde nichts dazu. Antworte ausschließlich mit dem ' +
  'korrigierten Text: keine Erklärung, keine Anführungszeichen, keine Vorrede.';

function kiVerfuegbar() {
  const vorhanden = !!Speicher.lies('apiKey', '');
  el.btnKi.hidden = !vorhanden;
  return vorhanden;
}

async function kiKorrektur() {
  const text = el.text.value.trim();
  if (!text) { el.status.textContent = 'Es steht noch kein Text da.'; return; }

  const schluessel = Speicher.lies('apiKey', '');
  const modell = Speicher.lies('modell', 'claude-opus-5');

  el.btnKi.disabled = true;
  el.btnKi.classList.add('btn--laeuft');
  el.status.textContent = 'Die KI liest deinen Text … einen Moment.';

  const anfrage = {
    model: modell,
    max_tokens: 4000,
    system: KI_ANWEISUNG,
    messages: [{ role: 'user', content: text }],
  };
  if (modell !== 'claude-haiku-4-5') {
    // „effort“ gibt es nur bei den neueren Modellen – Haiku würde damit einen Fehler werfen.
    anfrage.output_config = { effort: 'low' };
    // Opus 5 und Sonnet 5 denken von sich aus nach, und dieses Nachdenken zählt
    // gegen dieselben 4000 Tokens wie die Antwort. Bei einem langen Brief bliebe
    // dann womöglich nur ein abgeschnittener Text übrig. Rechtschreibung
    // korrigieren braucht kein Nachdenken – also aus.
    anfrage.thinking = { type: 'disabled' };
  }

  // Ohne Abbruch wartet „fetch“ notfalls ewig – etwa wenn das Handy mitten in
  // der Anfrage das Netz verliert. Dann bliebe der Knopf für immer grau.
  const abbruch = new AbortController();
  const wecker = setTimeout(() => abbruch.abort(), 90000);

  try {
    const antwort = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': schluessel,
        'anthropic-version': '2023-06-01',
        // Erlaubt den Aufruf direkt aus dem Browser heraus
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(anfrage),
      signal: abbruch.signal,
    });

    if (!antwort.ok) {
      const texte = {
        401: 'Der API-Schlüssel stimmt nicht. Bitte in den Einstellungen prüfen.',
        400: 'Die Anfrage wurde abgelehnt.',
        429: 'Zu viele Anfragen. Bitte kurz warten und noch einmal versuchen.',
      };
      let zusatz = '';
      try { zusatz = (await antwort.json())?.error?.message || ''; } catch {}
      throw new Error((texte[antwort.status] || 'Fehler ' + antwort.status) + (zusatz ? ' (' + zusatz + ')' : ''));
    }

    const daten = await antwort.json();

    if (daten.stop_reason === 'refusal') {
      el.status.textContent = 'Die KI wollte diesen Text nicht bearbeiten.';
      return;
    }

    const korrigiert = (daten.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();

    if (!korrigiert) { el.status.textContent = 'Es kam keine Antwort zurück.'; return; }

    merkeFuerZurueck(el.text.value);
    el.text.value = korrigiert;
    textGeaendert();
    el.funde.innerHTML = '';
    el.status.textContent = 'Fertig korrigiert. Nicht einverstanden? Oben auf „Rückgängig“ tippen.';

  } catch (fehler) {
    // Reihenfolge wichtig: „navigator.onLine“ meldet auf Android auch dann noch
    // „online“, wenn die Verbindung längst hängt. Der Abbruch ist das sichere Zeichen.
    if (fehler.name === 'AbortError') {
      el.status.textContent = 'Die KI hat zu lange gebraucht. Bitte noch einmal versuchen.';
    } else if (!navigator.onLine) {
      el.status.textContent = 'Kein Internet. Die KI-Korrektur braucht eine Verbindung.';
    } else {
      el.status.textContent = 'Es hat nicht geklappt: ' + fehler.message;
    }
  } finally {
    clearTimeout(wecker);
    el.btnKi.disabled = false;
    el.btnKi.classList.remove('btn--laeuft');
  }
}
el.btnKi.addEventListener('click', kiKorrektur);

/* ============================================================
   5. Weiterleiten in andere Apps
   ============================================================ */

function holeText() {
  const text = el.text.value.trim();
  if (!text) { el.status.textContent = 'Es steht noch kein Text da.'; return null; }
  el.status.textContent = '';
  return text;
}

/* Läuft die Seite in der Android-App, gibt es weder „navigator.share“ noch eine
   zuverlässige Zwischenablage — die WebView kennt beides nicht. Dann macht die
   App selbst das System-Teilen-Menü auf bzw. legt den Text in die Zwischenablage.
   „Teilen“ deckt WhatsApp, SMS und E-Mail mit ab: das sind genau die Einträge
   im Menü, das Android aufmacht. Im normalen Browser bleiben die Web-Wege. */
const bruecke = window.AndroidBridge;
const kannBrueckeTeilen   = typeof bruecke?.teilen   === 'function';
const kannBrueckeKopieren = typeof bruecke?.kopieren === 'function';

el.btnTeilen.addEventListener('click', async () => {
  const text = holeText(); if (!text) return;

  if (kannBrueckeTeilen) { bruecke.teilen(text); return; }

  if (navigator.share) {
    try { await navigator.share({ text }); return; }
    catch (fehler) { if (fehler.name === 'AbortError') return; }
  }
  // Kein Teilen möglich: dann wenigstens kopieren, damit der Knopf etwas tut.
  kopiere(text, 'Teilen geht hier nicht — der Text ist kopiert.');
});

el.btnKopieren.addEventListener('click', () => {
  const text = holeText(); if (!text) return;
  kopiere(text, 'Text kopiert.');
});

async function kopiere(text, meldung) {
  if (kannBrueckeKopieren) {
    bruecke.kopieren(text);
    el.status.textContent = meldung;
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    el.status.textContent = meldung;
  } catch {
    // Ohne Zwischenablage-Recht: markieren und über den alten Weg kopieren.
    el.text.focus();
    el.text.select();
    const geklappt = document.execCommand('copy');
    el.status.textContent = geklappt
      ? meldung
      : 'Kopieren hat nicht geklappt. Der Text ist markiert — lange tippen und „Kopieren“ wählen.';
  }
}

/* ============================================================
   6. Einstellungen
   ============================================================ */

el.btnSettings.addEventListener('click', () => {
  el.apiKey.value = Speicher.lies('apiKey', '');
  el.modell.value = Speicher.lies('modell', 'claude-opus-5');
  el.dlg.showModal();
});
el.btnSettingsZu.addEventListener('click', () => el.dlg.close());

el.btnSpeichern.addEventListener('click', () => {
  const schluessel = el.apiKey.value.trim();
  if (schluessel) Speicher.schreib('apiKey', schluessel);
  else Speicher.loesch('apiKey');
  Speicher.schreib('modell', el.modell.value);
  kiVerfuegbar();
  el.dlg.close();
});

el.btnSchluesselWeg.addEventListener('click', () => {
  Speicher.loesch('apiKey');
  el.apiKey.value = '';
  kiVerfuegbar();
  el.dlg.close();
});

kiVerfuegbar();

/* ============================================================
   7. Offline-Betrieb
   ============================================================ */

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* App läuft auch ohne */ });
  });
}
