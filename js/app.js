/* ============================================================
   Schreib | hilfe — App-Logik
   Läuft komplett im Handy-Browser. Ohne Internet funktioniert
   alles außer dem KI-Knopf.
   ============================================================ */

'use strict';

/* Beim Aufräumen sind Schaltflächen weggefallen, deren Verdrahtung weiter
   unten noch steht. Fehlt ein Element, liefert $ einen stillen Platzhalter
   statt null — sonst risse eine einzige entfernte Schaltfläche die ganze
   Datei mit. In der Konsole steht, welche es war. */
function platzhalter(id) {
  console.warn('Element fehlt (Verdrahtung läuft ins Leere):', id);
  // Ein echtes, nur nicht eingehängtes Element: es versteht hidden,
  // addEventListener, textContent und alles Übrige von sich aus. Ein Proxy
  // wäre hier falsch — DOM-Eigenschaften wie „hidden" sind Zugriffsmethoden
  // und stolpern über einen fremden Empfänger („Illegal invocation").
  return document.createElement('span');
}

const $ = (id) => document.getElementById(id) || platzhalter(id);

const el = {
  text:          $('text'),
  spiegel:       $('spiegel'),
  zaehler:       $('zaehler'),
  btnLeeren:     $('btn-leeren'),
  btnPruefen:    $('btn-pruefen'),
  btnKi:         $('btn-ki'),
  btnZurueck:    $('btn-zurueck'),
  btnZurueckgeben: $('btn-zurueckgeben'),
  btnEinfuegen:  $('btn-einfuegen'),
  status:        $('status'),
  funde:         $('funde'),
  danach:        $('danach'),
  ergebnis:      $('ergebnis'),
  btnTeilen:     $('btn-teilen'),
  btnKopieren:   $('btn-kopieren'),
  dlg:           $('dlg-settings'),
  dlgKi:         $('dlg-ki'),
  dlgMehr:       $('dlg-mehr'),
  btnMehr:       $('btn-mehr'),
  btnMehrZu:     $('btn-mehr-zu'),
  btnKiZu:       $('btn-ki-zu'),
  btnKorrigieren: $('btn-korrigieren'),
  btnUebersetzen: $('btn-uebersetzen'),
  btnFormulieren: $('btn-formulieren'),
  zielsprache:   $('zielsprache'),
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
  wortmarker:    $('wortmarker'),
  schluesselStand: $('schluessel-stand'),
  kostenStand:   $('kosten-stand'),
  fassung:       $('fassung'),
  btnKostenWeg:  $('btn-kosten-weg'),
};

/* ------------------------------------------------------------
   Speicher — bleibt auf diesem Gerät
   ------------------------------------------------------------ */
/** Stellen der letzten Korrektur; beim nächsten Tippen erlischt das Grün.
    Steht bewusst weit oben: markiereWort() läuft schon beim Start und fragt
    danach — eine Deklaration weiter unten wäre zu spät und bräche die Datei ab. */
let gruenStellen = null;

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

/* ------------------------------------------------------------
   Die Knopfleiste soll auf eine Zeile passen.

   Wie breit ein Wort wirklich wird, hängt am Gerät: Bildschirmbreite,
   Systemschriftgröße, Schriftart. Ein fester Wert im Stylesheet trifft das
   nicht. Also misst die App nach: bricht die Reihe um, fallen die Wörter
   hinter den Sinnbildern weg. Ist wieder Platz — etwa wenn das Handy quer
   gedreht wird —, kommen sie zurück.
   ------------------------------------------------------------ */
const leiste = document.querySelector('.leiste');

function zeilenInDerLeiste() {
  const oben = new Set();
  for (const knopf of leiste.querySelectorAll('button')) {
    if (!knopf.hidden) oben.add(Math.round(knopf.getBoundingClientRect().top));
  }
  return oben.size;
}

/* In zwei Stufen, damit das wichtigste Wort am längsten bleibt:
   erst gehen „Teilen“ und „Kopieren“ (Pfeil und Doppelblatt kennt man),
   und erst wenn es dann immer noch nicht reicht, auch „KI“. */
function leisteAnpassen() {
  // Erst mit allen Wörtern messen: Vielleicht ist inzwischen wieder Platz.
  leiste.classList.remove('leiste--eng', 'leiste--sehr-eng');
  if (zeilenInDerLeiste() === 1) return;
  leiste.classList.add('leiste--eng');
  if (zeilenInDerLeiste() === 1) return;
  leiste.classList.add('leiste--sehr-eng');
}

addEventListener('resize', leisteAnpassen);
leisteAnpassen();

let schriftgroesse = Speicher.lies('schrift', 1.05);
function setzeSchrift(wert) {
  schriftgroesse = Math.min(1.75, Math.max(0.9, Math.round(wert * 100) / 100));
  document.documentElement.style.setProperty('--schrift', schriftgroesse + 'rem');
  Speicher.schreib('schrift', schriftgroesse);
  // Andere Schriftgröße heißt anderer Zeilenfall — der Streifen muss mit.
  if (el.spiegel) markiereWort();
  if (typeof leiste !== 'undefined' && leiste) leisteAnpassen();
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
  // Auch wenn die App den Text selbst setzt (Löschen, Ändern, KI), muss der
  // Zwilling dahinter wieder stimmen.
  markiereWort();
  if (typeof zeigeEinfuegen === 'function') zeigeEinfuegen();
}
/* Nur echtes Tippen löst „input“ aus. Setzt die App den Text selbst (Löschen,
   Ändern, KI), bleibt das Ereignis aus — der Pfeil überlebt also genau die
   Änderung, die er zurücknehmen soll. */
el.text.addEventListener('input', () => {
  textGeaendert();
  vergissZurueck();
});
textGeaendert();

/* ------------------------------------------------------------
   Das Wort hervorheben, an dem gerade geschrieben wird.

   Ein <textarea> lässt sich innen nicht einfärben — es kennt nur eine Farbe
   für den ganzen Text. Deshalb liegt dahinter der Zwilling: derselbe Text,
   durchsichtig geschrieben, und nur um das eine Wort ein <mark>. Zu sehen ist
   davon einzig der farbige Streifen; die Buchstaben darüber sind weiterhin die
   des Feldes. Das ist der Punkt: Tastatur, Markieren, Diktieren und die roten
   Ringel bleiben unberührt, weil am Feld selbst nichts geändert wird.
   ------------------------------------------------------------ */
const WORT_ZEICHEN = /[A-Za-zÄÖÜäöüß0-9'’-]/;

function hervorhebenAn() {
  return Speicher.lies('wortmarker', true);
}

/* Vom Schreibzeiger aus nach beiden Seiten bis zum ersten Nicht-Buchstaben.
   Steht der Zeiger zwischen zwei Leerzeichen, gibt es nichts hervorzuheben. */
function wortGrenzen(text, stelle) {
  let von = stelle, bis = stelle;
  while (von > 0   && WORT_ZEICHEN.test(text[von - 1])) von--;
  while (bis < text.length && WORT_ZEICHEN.test(text[bis])) bis++;
  return von === bis ? null : { von, bis };
}

const alsHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function markiereWort() {
  const zeigerImFeld = document.activeElement === el.text
                    && el.text.selectionStart === el.text.selectionEnd;
  const grenzen = hervorhebenAn() && zeigerImFeld
    ? wortGrenzen(el.text.value, el.text.selectionStart)
    : null;

  if (!grenzen) { el.spiegel.textContent = ''; return; }

  const t = el.text.value;
  // Die letzte Zeile bräuchte sonst keinen Platz — der Streifen stünde zu hoch.
  el.spiegel.innerHTML = alsHtml(t.slice(0, grenzen.von))
    + '<mark>' + alsHtml(t.slice(grenzen.von, grenzen.bis)) + '</mark>'
    + alsHtml(t.slice(grenzen.bis)) + '\n';

  // Ein Rollbalken nimmt Breite weg. Der Zwilling hat keinen und müsste sonst
  // anders umbrechen als das Feld — dann sitzt der Streifen unter dem Wort.
  el.spiegel.style.width = el.text.clientWidth + 'px';
  el.spiegel.scrollTop = el.text.scrollTop;
}

/* „selectionchange“ deckt alles ab, was den Zeiger bewegt: tippen, antippen,
   Pfeiltasten, Vorschlag der Tastatur. */
document.addEventListener('selectionchange', markiereWort);
el.text.addEventListener('scroll', () => { el.spiegel.scrollTop = el.text.scrollTop; });
el.text.addEventListener('focus', markiereWort);
el.text.addEventListener('blur', markiereWort);
addEventListener('resize', markiereWort);

/* Kein „Wirklich löschen?“-Fenster: In der Android-App gibt es kein
   window.confirm — es liefert wortlos false, und der Knopf täte dann gar
   nichts. Der Text ist auch so nicht weg, ein zweites Tippen holt ihn zurück.

   Genau dafür wechselt der Knopf sein Bild: Nach dem Löschen zeigt er einen
   Rückholpfeil und tut auch das. Zwei Bedeutungen auf einem Knopf sind sonst
   heikel — hier nicht, weil man sie sieht. Sobald wieder getippt wird, steht
   dort wieder der Mülleimer. */
el.btnLeeren.addEventListener('click', () => {
  if (zurueckImEimer && vorherigerText !== null) { holeZurueck(); return; }
  if (!el.text.value) return;
  merkeFuerZurueck(el.text.value, true);
  el.text.value = '';
  textGeaendert();
  el.funde.innerHTML = '';
  el.status.textContent = 'Text gelöscht. Der Pfeil daneben holt ihn zurück.';
});

/* ------------------------------------------------------------
   Zurückholen — an zwei Stellen, aber nie an beiden gleichzeitig.

   Nach dem Löschen liegt es auf dem Mülleimer selbst: Der Daumen ist schon
   dort, und der Knopf zeigt dann einen Rückholpfeil statt des Eimers.

   Nach einer Korrektur (KI oder „Ändern“) geht das nicht — dort wäre der
   Mülleimer weiterhin der Löschknopf, und wer löschen will, holte
   versehentlich den alten Text zurück. Dafür ist der beschriftete Knopf über
   der Leiste da. Er ist auch der wichtigere Fall: Einen gelöschten Text tippt
   man neu, die eigene Formulierung von vor der KI-Korrektur nicht.
   ------------------------------------------------------------ */
let vorherigerText = null;
let zurueckImEimer = false;

function merkeFuerZurueck(t, aufDemEimer = false) {
  vorherigerText = t;
  zurueckImEimer = aufDemEimer;
  el.btnZurueck.hidden = aufDemEimer;   // entweder der Eimer oder der Knopf
  zeigeEimerAls();
}

/* Das Bild im Knopf muss sagen, was das Tippen tut. */
function zeigeEimerAls() {
  const pfeil = zurueckImEimer && vorherigerText !== null;
  el.btnLeeren.querySelector('use').setAttribute('href', pfeil ? '#i-undo' : '#i-trash');
  const was = pfeil ? 'Text zurückholen' : 'Text löschen';
  el.btnLeeren.title = was;
  el.btnLeeren.setAttribute('aria-label', was);
}

function holeZurueck() {
  if (vorherigerText === null) return;
  el.text.value = vorherigerText;
  vorherigerText = null;
  zurueckImEimer = false;
  el.btnZurueck.hidden = true;
  zeigeEimerAls();
  el.funde.innerHTML = '';
  el.status.textContent = '';
  textGeaendert();
}

/* Sobald wieder getippt wird, ist der gemerkte Stand überholt: Er stammt von
   vor der Änderung, und ihn jetzt zurückzuholen würde das Neugeschriebene
   wegwerfen. Also verschwindet der Pfeil wieder — und mit ihm der Knopf, der
   die Leiste auf zwei Zeilen auseinandergezogen hat. Vorher blieb sie
   auseinandergeklappt, bis die App neu gestartet wurde. */
function vergissZurueck() {
  if (vorherigerText === null) return;
  vorherigerText = null;
  zurueckImEimer = false;
  el.btnZurueck.hidden = true;
  zeigeEimerAls();
  el.status.textContent = '';
}
el.btnZurueck.addEventListener('click', holeZurueck);

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

/* ------------------------------------------------------------
   Zusammengeschriebene Wörter trennen: „halloich“ → „hallo ich“.

   Die Tastatur unterringelt so etwas zwar rot, weiß aber nicht, WO die
   Lücke hingehört. Genau da hilft diese Regel.

   Getrennt wird nur, wenn der zweite Teil ein kurzes Funktionswort ist —
   Pronomen, Artikel, Hilfsverb. Deutsche Zusammensetzungen enden praktisch
   nie darauf: „Haustür“ ja, „Hausich“ nein. Das hält die Regel eng.

   Die Schutzliste ist nicht geraten, sondern gemessen: die Regel lief gegen
   die 356.010 Wörter von /usr/share/dict/ngerman, und genau diese Wörter
   hätte sie fälschlich zerlegt. „wieder“ und „werden“ sind die wichtigsten.
   ------------------------------------------------------------ */
const TRENN_ANFANG = new Set(`hallo halli tschüss danke bitte guten gute lieber liebe viele herzliche
ja nein ok okay hey moin servus grüße gruß bis
ich du er sie es wir man das dies alles nichts
ist sind bin bist war warst hab habe hat haben hatte
kann kannst will willst muss musst soll sollst mag darf
komme kommst kommt gehe gehst geht mache machst macht
wie was wo wann warum wer wem wen welche
sehr ganz mal jetzt heute morgen gestern dann noch schon
und aber oder denn weil wenn dass ob`.split(/\s+/));

const TRENN_FUNKTION = new Set(`ich du er sie es wir ihr mir dir uns euch mich dich
man das den dem der die ein eine einen einem einer
nicht noch schon auch mal dann denn doch nur
ist sind bin bist war hat habe hab`.split(/\s+/));

/* Echte Wörter, die die Regel sonst zerreißen würde. */
const TRENN_SCHUTZ = new Set(`binder dasein grußes schoner sieder weiler werder binden
dennschon dieser dieses diesmal ganzer ganzes habendem habenden habender
lieberer lieberes nochmal sieden wenden wennschon werden wieder`.split(/\s+/));

function trenneZusammen(wort) {
  const w = wort.toLowerCase();
  if (w.length < 6 || TRENN_SCHUTZ.has(w)) return null;
  for (let i = 3; i < w.length - 1; i++) {
    const vorn = w.slice(0, i);
    const hinten = w.slice(i);
    if (hinten.length < 2) continue;
    if (TRENN_ANFANG.has(vorn) && TRENN_FUNKTION.has(hinten)) return vorn + ' ' + hinten;
  }
  return null;
}

function pruefeZusammengeschrieben(text, funde) {
  for (const treffer of text.matchAll(WORT_MUSTER)) {
    const wort = treffer[0];
    const getrennt = trenneZusammen(wort);
    if (!getrennt) continue;
    /* Großschreibung übertragen — und am Satzanfang gleich mit erledigen.
       Sonst bliebe „halloich" → „hallo ich" klein: die Regel für den
       Satzanfang greift auf dieselbe Stelle zu und wird als Überschneidung
       verworfen. */
    const davor = text.slice(0, treffer.index);
    const satzAnfang = davor.trim() === '' || /[.!?]\s+$/.test(davor);
    const gross = /^[A-ZÄÖÜ]/.test(wort) || satzAnfang;
    const neu = gross ? getrennt[0].toUpperCase() + getrennt.slice(1) : getrennt;
    funde.push(machFund(
      treffer.index, treffer.index + wort.length, wort, neu,
      'Zwei Wörter ohne Lücke', 'wort', false
    ));
  }
}

function findeProbleme(text) {
  const korrekturen = [];
  pruefeWoerter(text, korrekturen);
  pruefeZusammengeschrieben(text, korrekturen);
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

/* ------------------------------------------------------------
   Für die Bedienungshilfe: Text hinein, korrigierter Text heraus.

   Die Bedienungshilfe kann keine Liste anzeigen und niemanden fragen —
   sie ersetzt den Text im fremden Textfeld in einem Rutsch. Deshalb hier
   nur die eindeutigen Funde: Hinweise („der Satz ist lang“) bleiben außen
   vor, die brauchen eine Entscheidung.

   Von hinten nach vorn ersetzen, sonst verschieben sich die Stellen der
   noch nicht angewandten Funde.
   ------------------------------------------------------------ */
function korrigiereAlles(text) {
  const funde = findeProbleme(text)
    .filter((f) => f.art !== 'hinweis' && f.alt && f.neu)
    .sort((a, b) => b.von - a.von);

  let neu = text;
  let anzahl = 0;
  for (const fund of funde) {
    if (neu.slice(fund.von, fund.bis) !== fund.alt) continue;   // Stelle passt nicht mehr
    neu = neu.slice(0, fund.von) + fund.neu + neu.slice(fund.bis);
    anzahl++;
  }
  return { text: neu, anzahl };
}
window.korrigiereAlles = korrigiereAlles;


/* ------------------------------------------------------------
   Ein Knopf, ein Ergebnis.

   Statt einer Liste zum Durchtippen wird alles Eindeutige sofort angewandt,
   und die geänderten Stellen leuchten IM Text grün. Ein Blick genügt: passt
   es, weitermachen; passt es nicht, „Rückgängig“.

   Die grünen Stellen zeigt derselbe Zwilling, der sonst das Wort unter dem
   Zeiger markiert — dadurch sitzt die Farbe genau unter den Buchstaben, ohne
   dass das Schreibfeld etwas davon merkt.
   ------------------------------------------------------------ */
function korrigiereMitStellen(text) {
  const funde = findeProbleme(text)
    .filter((f) => f.art !== 'hinweis' && f.alt && f.neu)
    .sort((a, b) => a.von - b.von);

  let ergebnis = text;
  let versatz = 0;
  const stellen = [];

  for (const fund of funde) {
    const von = fund.von + versatz;
    const bis = fund.bis + versatz;
    if (ergebnis.slice(von, bis) !== fund.alt) continue;   // Stelle passt nicht mehr
    ergebnis = ergebnis.slice(0, von) + fund.neu + ergebnis.slice(bis);
    stellen.push({ von, bis: von + fund.neu.length });
    versatz += fund.neu.length - fund.alt.length;
  }
  return { text: ergebnis, anzahl: stellen.length, stellen };
}

function zeigeGruen() {
  const t = el.text.value;
  let html = '';
  let letzte = 0;
  for (const stelle of gruenStellen) {
    html += alsHtml(t.slice(letzte, stelle.von))
          + '<span class="neu">' + alsHtml(t.slice(stelle.von, stelle.bis)) + '</span>';
    letzte = stelle.bis;
  }
  html += alsHtml(t.slice(letzte));
  el.ergebnis.innerHTML = html;
  el.ergebnis.hidden = false;
  el.ergebnis.scrollTop = 0;
}

/** Zurück ins Schreibfeld — sobald man weiterschreiben will. */
function verbergeErgebnis() {
  if (el.ergebnis.hidden) return;
  el.ergebnis.hidden = true;
  gruenStellen = null;
}

/* Woher die angezeigte Liste stammt: aus der eigenen Prüfung (null) oder von
   der KI. Beim Übernehmen eines Vorschlags muss die App wissen, was danach
   neu zu zeichnen ist — die eigenen Regeln laufen einfach noch einmal, die
   Vorschläge der KI dagegen müssen ihre Stellen neu suchen. */
let kiVorschlaege = null;

function zeigeFunde() {
  verbergeErgebnis();
  kiVorschlaege = null;
  el.funde.innerHTML = '';
  el.status.textContent = '';
  const text = el.text.value;

  if (!text.trim()) { el.status.textContent = 'Es steht noch kein Text da.'; return; }

  const funde = findeProbleme(text);

  if (funde.length === 0) { el.status.textContent = 'Nichts gefunden.'; return; }

  zeichneFunde(funde);
  el.status.textContent = zusammenfassung(funde);
}

/* Eine Änderung übernehmen. Danach stimmen alle Stellen dahinter nicht mehr —
   deshalb wird die Liste jedes Mal neu aufgebaut. */
function uebernimm(fund) {
  const jetzt = el.text.value;
  // Sicherheitsprüfung: Steht an dieser Stelle noch dasselbe?
  if (jetzt.slice(fund.von, fund.bis) !== fund.alt) {
    kiVorschlaege ? zeigeKiVorschlaege() : zeigeFunde();
    return;
  }
  merkeFuerZurueck(jetzt);
  el.text.value = jetzt.slice(0, fund.von) + fund.neu + jetzt.slice(fund.bis);
  textGeaendert();

  if (kiVorschlaege) {
    kiVorschlaege = kiVorschlaege.filter((v) => v !== fund);
    zeigeKiVorschlaege();
  } else {
    zeigeFunde();
  }

  /* Ist nichts mehr zu ändern, tritt „Korrigieren" ab und der Weg zurück
     erscheint — so steht immer nur ein großer Knopf da. */
  if (!el.funde.querySelector('.fund button')) zeigeDanach(true);
}

function zeichneFunde(funde) {
  el.funde.innerHTML = '';
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
    } else if (fund.art === 'vorschlag') {
      /* Ganze Sätze: untereinander statt nebeneinander, sonst passt nichts
         auf den Bildschirm. Durchgestrichen wäre hier falsch — der alte Satz
         ist nicht verkehrt, nur schwerer zu lesen. */
      const vorher = document.createElement('div');
      vorher.className = 'fund__satz fund__satz--alt';
      vorher.textContent = fund.alt;
      const nachher = document.createElement('div');
      nachher.className = 'fund__satz fund__satz--neu';
      nachher.textContent = fund.neu;
      beschreibung.append(vorher, nachher);
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
      knopf.append(icon('i-check'), document.createTextNode(fund.art === 'vorschlag' ? ' Nehmen' : ' Ändern'));
      knopf.addEventListener('click', () => uebernimm(fund));
      karte.appendChild(knopf);
    }

    el.funde.appendChild(karte);
  }
}

/* Die Vorschläge der KI suchen ihre Stellen im Text selbst: Nach jeder
   übernommenen Änderung sitzen die übrigen woanders. Was sich nicht mehr
   wörtlich findet — weil der Satz inzwischen von Hand geändert wurde —,
   fällt still weg. */
function zeigeKiVorschlaege() {
  const text = el.text.value;
  const liste = [];
  for (const vorschlag of kiVorschlaege || []) {
    const von = text.indexOf(vorschlag.alt);
    if (von === -1) continue;
    liste.push(Object.assign(vorschlag, { von, bis: von + vorschlag.alt.length }));
  }
  kiVorschlaege = liste;

  if (liste.length === 0) {
    el.funde.innerHTML = '';
    el.status.textContent = 'Fertig — alle Vorschläge sind durch.';
    return;
  }
  zeichneFunde(ohneUeberschneidung(liste));
  el.status.textContent = liste.length === 1
    ? '1 Vorschlag. „Nehmen“ setzt ihn ein.'
    : liste.length + ' Vorschläge. Jeden einzeln mit „Nehmen“ einsetzen.';
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


/* Der eine Knopf: prüfen, alles Eindeutige anwenden, Ergebnis zeigen.
   Hinweise zum Satzbau lassen sich nicht anwenden — die stehen als Sätze
   darunter, ohne Knopf. */
function korrigiereJetzt() {
  const text = el.text.value;
  if (!text.trim()) {
    el.status.textContent = 'Es steht noch nichts da.';
    return;
  }

  const ergebnis = korrigiereMitStellen(text);
  const hinweise = findeProbleme(ergebnis.text).filter((f) => f.art === 'hinweis');

  if (ergebnis.anzahl > 0) {
    merkeFuerZurueck(text);
    el.text.value = ergebnis.text;
    textGeaendert();
    gruenStellen = ergebnis.stellen;
    zeigeGruen();
  }

  el.status.textContent = ergebnis.anzahl === 0
    ? (hinweise.length ? 'Nichts zu ändern.' : 'Alles in Ordnung.')
    : (ergebnis.anzahl === 1 ? '1 Stelle verbessert' : ergebnis.anzahl + ' Stellen verbessert');
  el.status.classList.toggle('status--gut', ergebnis.anzahl > 0);

  zeigeHinweise(hinweise);
  zeigeDanach(ergebnis.anzahl > 0);
}

/* Hinweise sind Sätze zum Nachdenken, keine Knöpfe zum Drücken. */
function zeigeHinweise(hinweise) {
  el.funde.innerHTML = '';
  for (const hinweis of hinweise) {
    const zeile = document.createElement('p');
    zeile.className = 'hinweis-satz';
    zeile.textContent = hinweis.grund;
    el.funde.appendChild(zeile);
  }
}

/* Nach dem Korrigieren zeigt der Bildschirm nur noch EINEN großen Knopf:
   den Weg zurück. „Korrigieren" tritt so lange ab — es ist gerade getan.
   Beim nächsten Tippen kommt es zurück, und die Reihe verschwindet wieder. */
function zeigeDanach(sichtbar) {
  el.danach.hidden = !sichtbar;
  el.btnPruefen.hidden = sichtbar;   // immer nur EIN großer Knopf
}

/* Der Knopf zeigt die Vorschläge als Kästen, wie gewohnt. Das automatische
   Anwenden mit grüner Anzeige war ein Umbau von mir und hat die Kästen
   verdrängt — die sind aber das eigentliche Arbeitsmittel: Man sieht, WAS
   geändert würde und WARUM, und entscheidet Stück für Stück. */
el.btnPruefen.addEventListener('click', zeigeFunde);

/* Ein Tipp auf das Ergebnis heißt: weiterschreiben. */
el.ergebnis.addEventListener('click', () => {
  verbergeErgebnis();
  zeigeDanach(false);
  el.status.textContent = '';
  el.text.focus();
});

/* ============================================================
   4. KI-Korrektur — braucht Internet und einen API-Schlüssel
   ============================================================ */

const KI_KORREKTUR =
  'Du bist eine Schreibhilfe für einen Menschen mit Legasthenie. ' +
  'Korrigiere im folgenden deutschen Text die Rechtschreibung, die Grammatik ' +
  'und die Zeichensetzung. Behalte Wortwahl, Tonfall und Inhalt bei – ändere ' +
  'nichts am Sinn und erfinde nichts dazu. Antworte ausschließlich mit dem ' +
  'korrigierten Text: keine Erklärung, keine Anführungszeichen, keine Vorrede.';

/* Übersetzen ist dieselbe Anfrage mit einer anderen Anweisung. */
const kiUebersetzung = (sprache) =>
  'Übersetze den folgenden Text nach ' + sprache + '. ' +
  'Behalte Tonfall und Anrede bei: Ein Brief bleibt ein Brief, eine Nachricht ' +
  'an einen Freund bleibt locker. Übersetze sinngemäß und natürlich, nicht Wort ' +
  'für Wort. Ist der Text schon auf ' + sprache + ', gib ihn unverändert zurück. ' +
  'Antworte ausschließlich mit der Übersetzung: keine Erklärung, keine ' +
  'Anführungszeichen, keine Vorrede.';

/* Umformulieren ist etwas anderes als Korrigieren: Hier darf sich die Wortwahl
   ändern. Deshalb kommt es nicht als fertiger Text zurück, sondern als Liste
   einzelner Sätze — jeder mit Begründung, jeder einzeln anzunehmen oder
   liegenzulassen. Der Text gehört dem Menschen, nicht der Maschine. */
const KI_VORSCHLAEGE =
  'Du bist eine Schreibhilfe für einen Menschen mit Legasthenie. Suche im ' +
  'folgenden deutschen Text die Sätze, die schwer zu lesen oder umständlich ' +
  'sind, und schlage für jeden eine klarere Fassung vor. ' +
  'Regeln: Ändere nichts am Inhalt und erfinde nichts dazu. Behalte den ' +
  'Tonfall — ein Brief ans Amt bleibt förmlich, eine Nachricht an einen Freund ' +
  'bleibt locker. Benutze einfache, gebräuchliche Wörter und kurze Sätze. ' +
  'Nimm höchstens sechs Sätze, nur die, bei denen es wirklich hilft; ist der ' +
  'Text schon gut, nimm weniger oder keinen. ' +
  'Antworte ausschließlich mit einer JSON-Liste, ohne Vorrede und ohne ' +
  'Code-Zaun, in dieser Form: ' +
  '[{"alt":"der Satz zeichengenau aus dem Text","neu":"die klarere Fassung",' +
  '"grund":"in höchstens acht Wörtern, warum das leichter ist"}]. ' +
  'Der Wert von "alt" muss zeichengenau so im Text vorkommen — nicht kürzen, ' +
  'nicht glätten, nichts hinzufügen. Gibt es nichts zu verbessern: []';

/* Die Sprachen, die im KI-Fenster zur Wahl stehen. Deutsch steht mit drin —
   für den umgekehrten Weg, wenn ein fremdsprachiger Text im Feld liegt. */
const SPRACHEN = [
  'Englisch', 'Deutsch', 'Türkisch', 'Russisch', 'Ukrainisch', 'Polnisch',
  'Rumänisch', 'Arabisch', 'Französisch', 'Spanisch', 'Italienisch',
  'Griechisch', 'Niederländisch', 'Portugiesisch',
];

/* ------------------------------------------------------------
   Was die letzte Anfrage gekostet hat.

   Die Antwort sagt, wie viele Token hinein- und hinausgegangen sind. Mal dem
   Preis des Modells ergibt das den Betrag — auf den Bruchteil eines Cents
   genau, nicht geschätzt. Gerechnet wird in US-Cent, so rechnet Anthropic ab.
   ------------------------------------------------------------ */
const PREISE = {                       // Dollar je Million Token
  'claude-opus-5':    { hinein: 5, heraus: 25 },
  'claude-sonnet-5':  { hinein: 3, heraus: 15 },
  'claude-haiku-4-5': { hinein: 1, heraus: 5  },
};

function centFuer(modell, verbrauch) {
  if (!verbrauch) return null;
  const name = Object.keys(PREISE).find((k) => String(modell || '').startsWith(k));
  if (!name) return null;
  const preis = PREISE[name];
  const dollar = (verbrauch.input_tokens  || 0) / 1e6 * preis.hinein
               + (verbrauch.output_tokens || 0) / 1e6 * preis.heraus;
  return dollar * 100;
}

/* Kleine Beträge brauchen Nachkommastellen, große nicht. */
function alsGeld(cent) {
  if (cent >= 100) return (cent / 100).toFixed(2).replace('.', ',') + ' $';
  if (cent >= 1)   return cent.toFixed(1).replace('.', ',') + ' Cent';
  return cent.toFixed(2).replace('.', ',') + ' Cent';
}

/* Der Zähler bleibt auf dem Gerät und lässt sich jederzeit zurücksetzen. */
function merkeKosten(cent) {
  const bisher = Speicher.lies('kosten', { anzahl: 0, cent: 0 });
  Speicher.schreib('kosten', { anzahl: bisher.anzahl + 1, cent: bisher.cent + cent });
}

function zeigeKosten() {
  const { anzahl, cent } = Speicher.lies('kosten', { anzahl: 0, cent: 0 });
  el.kostenStand.textContent = anzahl === 0
    ? 'Noch nichts verbraucht.'
    : 'Bisher: ' + anzahl + (anzahl === 1 ? ' Anfrage · ' : ' Anfragen · ') + alsGeld(cent) + ' (US)';
  el.btnKostenWeg.hidden = anzahl === 0;
}

function kiVerfuegbar() {
  const vorhanden = !!Speicher.lies('apiKey', '');
  el.btnKi.hidden = !vorhanden;
  // Ein Knopf mehr in der Reihe: Passt sie noch auf eine Zeile?
  leisteAnpassen();
  return vorhanden;
}

/* ------------------------------------------------------------
   Eine Anfrage, zwei Anwendungen.
   Korrigieren und Übersetzen unterscheiden sich nur in der Anweisung — alles
   andere (Abbruch nach 90 s, Fehlermeldungen, kein Nachdenken) ist dasselbe.
   ------------------------------------------------------------ */
async function kiAnfrage(anweisung, text) {
  const schluessel = Speicher.lies('apiKey', '');
  const modell = Speicher.lies('modell', 'claude-opus-5');

  const anfrage = {
    model: modell,
    max_tokens: 4000,
    system: anweisung,
    messages: [{ role: 'user', content: text }],
  };
  if (modell !== 'claude-haiku-4-5') {
    // „effort“ gibt es nur bei den neueren Modellen – Haiku würde damit einen Fehler werfen.
    anfrage.output_config = { effort: 'low' };
    // Opus 5 und Sonnet 5 denken von sich aus nach, und dieses Nachdenken zählt
    // gegen dieselben 4000 Tokens wie die Antwort. Bei einem langen Brief bliebe
    // dann womöglich nur ein abgeschnittener Text übrig. Korrigieren und
    // Übersetzen brauchen kein Nachdenken – also aus.
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
        401: 'Der Schlüssel wird abgelehnt. Er wird nur bei der Erstellung einmal angezeigt — hast du ihn vollständig kopiert? Sonst auf console.anthropic.com einen neuen anlegen.',
        400: 'Die Anfrage wurde abgelehnt.',
        429: 'Zu viele Anfragen. Bitte kurz warten und noch einmal versuchen.',
      };
      let zusatz = '';
      try { zusatz = (await antwort.json())?.error?.message || ''; } catch {}
      // Kein Guthaben mehr: Das steht als englischer Fließtext in der Antwort,
      // und niemand soll raten müssen, was „credit balance is too low“ heißt.
      if (/credit balance/i.test(zusatz)) {
        throw new Error('Das Guthaben ist aufgebraucht. Im Zahnrad steht ein Verweis zum Aufladen.');
      }
      throw new Error((texte[antwort.status] || 'Fehler ' + antwort.status) + (zusatz ? ' (' + zusatz + ')' : ''));
    }

    const daten = await antwort.json();
    if (daten.stop_reason === 'refusal') return { fehler: 'Die KI wollte diesen Text nicht bearbeiten.' };

    const ergebnis = (daten.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();

    const cent = centFuer(daten.model || modell, daten.usage);
    return ergebnis ? { ergebnis, cent } : { fehler: 'Es kam keine Antwort zurück.' };

  } catch (fehler) {
    // Reihenfolge wichtig: „navigator.onLine“ meldet auf Android auch dann noch
    // „online“, wenn die Verbindung längst hängt. Der Abbruch ist das sichere Zeichen.
    if (fehler.name === 'AbortError') return { fehler: 'Die KI hat zu lange gebraucht. Bitte noch einmal versuchen.' };
    if (!navigator.onLine)            return { fehler: 'Kein Internet. Die KI braucht eine Verbindung.' };
    return { fehler: 'Es hat nicht geklappt: ' + fehler.message };
  } finally {
    clearTimeout(wecker);
  }
}

/* Der gemeinsame Ablauf: Text holen, Knopf sperren, Ergebnis einsetzen. */
async function kiLauf(anweisung, laeuft, fertig) {
  const text = el.text.value.trim();
  if (!text) { el.status.textContent = 'Es steht noch kein Text da.'; return; }

  el.btnKi.disabled = true;
  el.btnKi.classList.add('btn--laeuft');
  el.status.textContent = laeuft;

  const { ergebnis, fehler, cent } = await kiAnfrage(anweisung, text);

  el.btnKi.disabled = false;
  el.btnKi.classList.remove('btn--laeuft');

  if (fehler) { el.status.textContent = fehler; return; }

  merkeFuerZurueck(el.text.value);
  el.text.value = ergebnis;
  textGeaendert();
  el.funde.innerHTML = '';
  if (cent !== null && cent !== undefined) { merkeKosten(cent); zeigeKosten(); }
  el.status.textContent = fertig
    + (cent !== null && cent !== undefined ? ' · ' + alsGeld(cent) : '');
}

/* ------------------------------------------------------------
   Das KI-Fenster: erst wählen, dann laufen lassen.

   Ein eigener Knopf fürs Übersetzen wäre der sechste in der Leiste gewesen —
   dann bräche sie auf schmalen Handys wieder auf zwei Zeilen um. Beides sind
   ohnehin KI-Sachen: Sie brauchen denselben Schlüssel und dasselbe Internet.
   Also stehen sie zusammen hinter einem Knopf.
   ------------------------------------------------------------ */
for (const sprache of SPRACHEN) {
  const eintrag = document.createElement('option');
  eintrag.value = sprache;
  eintrag.textContent = sprache;
  el.zielsprache.appendChild(eintrag);
}

/* Die Sprache zu wählen übersetzt noch nichts — das muss der Knopf sagen.
   Vorher stand dort bloß „Übersetzen“, und wer die Sprache gewählt hatte,
   wartete verständlicherweise darauf, dass etwas passiert. */
function beschrifteUebersetzen() {
  el.btnUebersetzen.querySelector('.btn__wort').textContent =
    ' Nach ' + el.zielsprache.value + ' übersetzen';
}
el.zielsprache.addEventListener('change', beschrifteUebersetzen);

el.btnKi.addEventListener('click', () => {
  el.zielsprache.value = Speicher.lies('sprache', 'Englisch');
  beschrifteUebersetzen();
  el.dlgKi.showModal();
});
el.btnKiZu.addEventListener('click', () => el.dlgKi.close());


el.btnKorrigieren.addEventListener('click', () => {
  el.dlg.close();
  kiLauf(KI_KORREKTUR,
    'Die KI liest deinen Text … einen Moment.',
    'Fertig korrigiert. Nicht einverstanden? „Zurückholen“ darunter.');
});

/* Der dritte Weg: Vorschläge statt fertiger Text. */
el.btnFormulieren.addEventListener('click', async () => {
  el.dlg.close();
  const text = el.text.value.trim();
  if (!text) { el.status.textContent = 'Es steht noch kein Text da.'; return; }

  el.btnKi.disabled = true;
  el.btnKi.classList.add('btn--laeuft');
  el.funde.innerHTML = '';
  el.status.textContent = 'Die KI liest deinen Text … einen Moment.';

  const { ergebnis, fehler, cent } = await kiAnfrage(KI_VORSCHLAEGE, text);

  el.btnKi.disabled = false;
  el.btnKi.classList.remove('btn--laeuft');
  if (fehler) { el.status.textContent = fehler; return; }
  if (cent !== null && cent !== undefined) { merkeKosten(cent); zeigeKosten(); }

  const roh = leseListe(ergebnis);
  if (roh === null) { el.status.textContent = 'Die Antwort war nicht zu lesen. Bitte noch einmal versuchen.'; return; }

  /* Nur was zeichengenau im Text steht, lässt sich auch sicher ersetzen. */
  const jetzt = el.text.value;
  kiVorschlaege = roh
    .filter((v) => v && typeof v.alt === 'string' && typeof v.neu === 'string'
                && v.alt !== v.neu && jetzt.includes(v.alt))
    .map((v) => ({ alt: v.alt, neu: v.neu, art: 'vorschlag',
                   grund: String(v.grund || 'Leichter zu lesen.') }));

  if (kiVorschlaege.length === 0) {
    kiVorschlaege = null;
    el.status.textContent = 'Die KI hatte nichts zu verbessern.'
      + (cent !== null && cent !== undefined ? ' · ' + alsGeld(cent) : '');
    return;
  }
  zeigeKiVorschlaege();
  el.status.textContent += (cent !== null && cent !== undefined ? ' · ' + alsGeld(cent) : '');
});

/* Die Antwort soll eine JSON-Liste sein. Falls doch ein Satz davorsteht oder
   ein Code-Zaun drumherum, wird die Liste herausgeschnitten. */
function leseListe(antwort) {
  const von = antwort.indexOf('[');
  const bis = antwort.lastIndexOf(']');
  if (von === -1 || bis <= von) return null;
  try {
    const liste = JSON.parse(antwort.slice(von, bis + 1));
    return Array.isArray(liste) ? liste : null;
  } catch { return null; }
}

el.btnUebersetzen.addEventListener('click', () => {
  const sprache = el.zielsprache.value;
  Speicher.schreib('sprache', sprache);
  el.dlgKi.close();
  kiLauf(kiUebersetzung(sprache),
    'Die KI übersetzt … einen Moment.',
    'Übersetzt nach ' + sprache + '. Das Deutsche holt „Zurückholen“ darunter wieder.');
});

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

/* ------------------------------------------------------------
   Zurück an die App, aus der der Text kam.

   Kam er aus dem Markier-Menü (WhatsApp, Facebook, Mail — irgendein Feld, in
   dem man Text markieren kann), nimmt diese App ihn auch wieder entgegen: Der
   verbesserte Text ersetzt dort die Markierung, und die Schreibhilfe schließt
   sich. Kein Kopieren, kein Teilen, kein Suchen der richtigen Stelle.

   Die Android-Hülle meldet, ob dieser Rückweg offensteht — beim Teilen gibt es
   ihn nicht, und manche Apps geben den Text ausdrücklich nur zum Lesen heraus.
   ------------------------------------------------------------ */
function zeigeRueckgabe() {
  el.btnZurueckgeben.hidden = !window.KannZurueckgeben;
}
addEventListener('rueckgabe', zeigeRueckgabe);
zeigeRueckgabe();

/* ------------------------------------------------------------
   Der Weg über die Zwischenablage.

   „Schreibhilfe“ steht nicht in jedem Markier-Menü — manche Apps bieten fremde
   Einträge gar nicht an, und Xiaomi schiebt sie hinter das ⋮. „Kopieren“
   dagegen gibt es überall und immer ganz vorn. Also: kopieren, Schreibhilfe
   öffnen, hier einfügen.

   Der Knopf steht immer da, solange die App auf dem Handy läuft. Zuerst zeigte
   er sich nur bei leerem Feld — das war ein Fehlgriff: Die App hebt den letzten
   Text auf, das Feld ist beim Öffnen also fast nie leer, und der Knopf blieb
   unsichtbar. Steht schon Text da, wird er ersetzt und „Zurückholen“ bringt ihn
   wieder. Gelesen wird nur auf Knopfdruck, nie von allein.
   ------------------------------------------------------------ */
/* Nicht über „bruecke“: Diese Konstante entsteht weiter unten in der Datei,
   und der erste Aufruf kommt schon beim Start — dann gäbe es einen Fehler,
   und alles dahinter liefe nicht mehr. window.AndroidBridge ist immer sicher
   zu fragen. */
function zeigeEinfuegen() {
  el.btnEinfuegen.hidden =
    typeof window.AndroidBridge?.frageZwischenablage !== 'function';
}

el.btnEinfuegen.addEventListener('click', () => window.AndroidBridge.frageZwischenablage());

addEventListener('zwischenablage', (ereignis) => {
  const text = String(ereignis.detail || '').trim();
  if (!text) { el.status.textContent = 'In der Zwischenablage steht kein Text.'; return; }
  if (text === el.text.value) { el.status.textContent = 'Das steht schon da.'; return; }

  const stand = el.text.value;
  if (stand.trim()) merkeFuerZurueck(stand);   // der alte Text bleibt erreichbar
  el.text.value = text;
  textGeaendert();
  zeigeFunde();          // gleich prüfen, wie beim Weg über das Markier-Menü
  if (stand.trim()) {
    el.status.textContent += ' · Der alte Text steht hinter „Zurückholen“.';
  }
});

el.btnZurueckgeben.addEventListener('click', () => {
  const text = holeText(); if (!text) return;
  if (typeof bruecke?.zurueckgeben === 'function') bruecke.zurueckgeben(text);
});


/* ------------------------------------------------------------
   Das Menü hinter den drei Punkten.

   Kopieren, Einfügen und Löschen braucht man selten, standen aber dauerhaft
   in der Leiste. Aus vier Knöpfen wurden so sieben. Die Knöpfe selbst sind
   dieselben geblieben — sie stehen nur woanders, ihre Verdrahtung weiter unten
   gilt unverändert. Nach dem Antippen schließt sich das Menü von selbst.
   ------------------------------------------------------------ */
el.btnMehr.addEventListener('click', () => {
  el.dlgMehr.showModal();
});
el.btnMehrZu.addEventListener('click', () => el.dlgMehr.close());
el.dlgMehr.addEventListener('click', (ereignis) => {
  if (ereignis.target.closest('.btn') && ereignis.target.id !== 'btn-mehr-zu') {
    el.dlgMehr.close();
  }
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

/* Was liegt gespeichert? Genug, um es wiederzuerkennen, nicht genug, um es
   abzuschreiben. Ein Schlüssel von Anthropic fängt mit „sk-ant-“ an und ist
   rund hundert Zeichen lang — passt das nicht, steht es hier. */
function zeigeSchluesselStand() {
  const schluessel = Speicher.lies('apiKey', '');
  if (!schluessel) {
    el.schluesselStand.textContent = 'Kein Schlüssel gespeichert — deshalb fehlt der KI-Knopf.';
    return;
  }
  const kurz = schluessel.slice(0, 11) + '…' + schluessel.slice(-4);
  const laenge = schluessel.length + ' Zeichen';
  el.schluesselStand.textContent = schluessel.startsWith('sk-ant-')
    ? 'Gespeichert: ' + kurz + ' · ' + laenge
    : 'Gespeichert: ' + kurz + ' · ' + laenge
      + ' — beginnt nicht mit „sk-ant-“. Das sieht nicht nach einem Anthropic-Schlüssel aus.';
}

el.btnSettings.addEventListener('click', () => {
  el.apiKey.value = Speicher.lies('apiKey', '');
  zeigeSchluesselStand();
  el.modell.value = Speicher.lies('modell', 'claude-opus-5');
  el.wortmarker.checked = hervorhebenAn();
  zeigeKosten();
  /* Im Browser gibt es keine Fassung — dort steht immer das Neueste. */
  el.fassung.textContent = typeof window.AndroidBridge?.fassung === 'function'
    ? 'Schreibhilfe ' + window.AndroidBridge.fassung()
    : '';
  el.dlg.showModal();
});

/* Wirkt sofort — man sieht ja beim Zumachen gleich, ob es einem gefällt. */
el.wortmarker.addEventListener('change', () => {
  Speicher.schreib('wortmarker', el.wortmarker.checked);
  markiereWort();
});
el.btnSettingsZu.addEventListener('click', () => el.dlg.close());

el.btnSpeichern.addEventListener('click', () => {
  const schluessel = el.apiKey.value.trim();
  if (schluessel) Speicher.schreib('apiKey', schluessel);
  else Speicher.loesch('apiKey');
  Speicher.schreib('modell', el.modell.value);
  zeigeSchluesselStand();
  kiVerfuegbar();
  el.dlg.close();
});

el.btnKostenWeg.addEventListener('click', () => {
  Speicher.loesch('kosten');
  zeigeKosten();
});

el.btnSchluesselWeg.addEventListener('click', () => {
  Speicher.loesch('apiKey');
  el.apiKey.value = '';
  zeigeSchluesselStand();
  kiVerfuegbar();
  el.dlg.close();
});

kiVerfuegbar();

/* ============================================================
   7. Offline-Betrieb
   ============================================================ */

/* Im Browser hält der Service Worker die App auch ohne Internet bereit.

   In der Android-App richtet er nur Schaden an. Die Dateien liegen dort schon
   in der APK — offline ist ohnehin alles da. Sein Zwischenspeicher überlebt
   aber das App-Update: Beim ersten Start nach der Installation liefert er
   weiter die alte Fassung, und die Neuerungen sieht man erst beim zweiten Mal.
   Genau das ist passiert. Also in der App: abmelden, aufräumen, einmal neu
   laden. Danach kommen die Dateien direkt aus der APK und sind immer aktuell.

   Die App lädt über https (appassets.androidplatform.net) und nicht über
   file:// — deshalb greift der Service Worker dort überhaupt. */
const inDerApp = typeof window.AndroidBridge !== 'undefined';

async function zwischenspeicherAufraeumen() {
  try {
    const kamAusDemSpeicher = !!navigator.serviceWorker.controller;
    const angemeldet = await navigator.serviceWorker.getRegistrations();
    await Promise.all(angemeldet.map((r) => r.unregister()));
    if (window.caches) {
      const namen = await caches.keys();
      await Promise.all(namen.map((n) => caches.delete(n)));
    }
    /* Diese Seite stammt noch aus dem alten Zwischenspeicher. Einmal neu
       laden, damit die Fassung aus der APK erscheint — höchstens einmal je
       Start, sonst drehte sich die App im Kreis. Der Text geht dabei nicht
       verloren, er liegt im Speicher des Geräts. */
    if (kamAusDemSpeicher && !sessionStorage.getItem('sh.aufgeraeumt')) {
      sessionStorage.setItem('sh.aufgeraeumt', '1');
      location.reload();
    }
  } catch { /* Dann bleibt es beim zweiten Start — schlimmer wird es nicht. */ }
}



/* ------------------------------------------------------------
   Bau-Nummer in der Kopfzeile.

   Es hat einen ganzen Abend gekostet, weil niemand am Bildschirmfoto
   erkennen konnte, welcher Stand darauf zu sehen ist — die App sah nach
   jedem Update gleich aus, weil ein Zwischenspeicher die alten Dateien
   auslieferte. Steht die Nummer oben, ist diese Frage mit einem Blick
   beantwortet.
   ------------------------------------------------------------ */
(() => {
  // Steht im Zahnrad, nicht in der Kopfzeile: Die Kopfzeile gehört dem
  // Schreiben, nicht der Technik.
  const feld = document.getElementById('fassung');
  if (!feld) return;
  let nummer = '';
  try { nummer = window.AndroidBridge?.fassung?.() || ''; } catch {}
  feld.textContent = nummer ? 'Fassung ' + nummer : '';
})();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  if (inDerApp) {
    zwischenspeicherAufraeumen();
  } else {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* App läuft auch ohne */ });
    });
  }
}
