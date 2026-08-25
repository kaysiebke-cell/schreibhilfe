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
  tonfall:       $('tonfall'),
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
  gelerntStand:  $('gelernt-stand'),
  btnGelerntWeg: $('btn-gelernt-weg'),
  btnSichern:    $('btn-sichern'),
  btnEinspielen: $('btn-einspielen'),
  btnSchluesselZeigen:   $('btn-schluessel-zeigen'),
  btnSchluesselKopieren: $('btn-schluessel-kopieren'),
  wortZeigen:    $('wort-zeigen'),
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

/* ============================================================
   1b. Das Gedächtnis

   Die KI selbst lernt nichts: Jede Anfrage fängt bei null an. Merken kann
   sich nur diese App — und das ist hier der bessere Ort. Was hier steht,
   bleibt auf dem Gerät, kostet nichts und wirkt auch ohne Internet.

   Gesammelt wird an genau einer Stelle: beim Antippen von „Ändern“. Dort ist
   zweifelsfrei bekannt, was der Mensch wollte.

   Drei Dinge entstehen daraus:
     woerter  – „Halloch → Hallo“. Beim nächsten Mal steht der Kasten sofort
                da, ohne KI und ohne Internet.
     inRuhe   – Wörter, deren Kasten immer wieder weggeklickt wurde. Nach dem
                fünften Mal hört die App auf, sie anzumeckern: der Nachname,
                ein Wort aus der Gegend, ein Fachbegriff.
     gezeigt  – der Zähler, aus dem „inRuhe“ hervorgeht.
   ============================================================ */
const LERN_SCHWELLE = 5;    // so oft darf ein Kasten ungenutzt erscheinen

const Gelernt = {
  /* Gelesen wird bei jedem geprüften Wort. Ohne diesen Zwischenspeicher liefe
     bei einem langen Brief für jedes einzelne Wort ein JSON.parse — das würde
     man beim Tippen merken. */
  _merker: null,

  lies() {
    if (this._merker) return this._merker;
    const g = Speicher.lies('gelernt', null);
    this._merker = {
      woerter: (g && g.woerter) || {},
      inRuhe:  (g && g.inRuhe)  || {},
      gezeigt: (g && g.gezeigt) || {},
    };
    return this._merker;
  },

  schreib(g) { this._merker = g; Speicher.schreib('gelernt', g); },

  /* Ein Fund taugt nur dann zum Lernen, wenn er sich auf das WORT bezieht und
     nicht auf die Stelle. Ein fehlendes Komma oder ein großer Satzanfang gilt
     nur genau dort, wo er gefunden wurde — als Regel für immer wäre er Unfug. */
  wortEbene(fund) {
    return !!fund && fund.wortEbene === true
        && typeof fund.alt === 'string' && typeof fund.neu === 'string'
        && /^[A-Za-zÄÖÜäöüß-]+$/.test(fund.alt)
        && fund.neu.trim() === fund.neu && fund.neu !== '';
  },

  /* ------------------------------------------------------------
     Beim Antippen von „Ändern“.

     Gelernt wird nur, was der Mensch selbst NICHT richtig geschrieben hat:
     Steht „alt“ so im deutschen Wörterbuch, hängt die Korrektur am Satz und
     nicht am Wort. „wir“ → „wird“ mag hier stimmen und wäre drei Sätze später
     falsch. Solche Fälle bleiben Sache der KI.
     ------------------------------------------------------------ */
  merkeAenderung(fund) {
    if (!this.wortEbene(fund)) return;
    const wort = fund.alt.toLowerCase();
    if (WOERTERBUCH_GROSS && WOERTERBUCH_GROSS.has(wort)) return;
    /* Was mit dem Wort nichts zu tun hat, war nie eine Korrektur — und darf
       schon gar nicht für immer gelten. Ein einziges Antippen von „Ändern"
       reichte sonst, um „Zahnriemenspanner-Kettenrolle → Unannehmlichkeiten"
       dauerhaft ins Gedächtnis zu schreiben. */
    if (!istKorrektur(wort, fund.neu)) return;

    const g = this.lies();
    g.woerter[wort] = fund.neu;
    delete g.gezeigt[wort];      // angenommen ist das Gegenteil von ignoriert
    delete g.inRuhe[wort];
    this.schreib(g);
  },

  /* Beim Anzeigen der Kästen. Wer denselben Kasten wieder und wieder stehen
     lässt, sagt damit: Das Wort ist richtig so. */
  merkeGezeigt(funde) {
    const g = this.lies();
    let geaendert = false;
    for (const fund of funde) {
      if (!this.wortEbene(fund)) continue;
      const wort = fund.alt.toLowerCase();
      if (g.woerter[wort] || g.inRuhe[wort]) continue;
      g.gezeigt[wort] = (g.gezeigt[wort] || 0) + 1;
      if (g.gezeigt[wort] >= LERN_SCHWELLE) {
        g.inRuhe[wort] = true;
        delete g.gezeigt[wort];
      }
      geaendert = true;
    }
    if (geaendert) this.schreib(g);
  },

  /** Die eigene Schreibweise für ein Wort — oder nichts. */
  wort(wort) {
    const w = String(wort).toLowerCase();
    const gemerkt = this.lies().woerter[w];
    if (!gemerkt) return null;
    /* Aus der Zeit, als jeder Vorschlag lernbar war, können unsinnige Paare
       im Gedächtnis liegen. Sie hier still zu übergehen räumt sie auf, ohne
       dass jemand das ganze Gedächtnis leeren muss. */
    if (!istKorrektur(w, gemerkt)) { this.vergissWort(w); return null; }
    return gemerkt;
  },

  /** Ein einzelnes Paar wieder vergessen. */
  vergissWort(wort) {
    const g = this.lies();
    if (!(wort in g.woerter)) return;
    delete g.woerter[wort];
    this.schreib(g);
  },

  /** Soll dieses Wort in Ruhe gelassen werden? */
  inRuhe(wort) {
    return !!this.lies().inRuhe[String(wort).toLowerCase()];
  },

  /* ------------------------------------------------------------
     Der Steckbrief für die KI.

     Die KI erinnert sich nicht — sie bekommt die Erinnerung bei jeder Anfrage
     frisch mitgeliefert. Von außen fühlt es sich gleich an. Genannt werden nur
     die Wörter, die dieser Mensch wirklich oft falsch schreibt; eine lange
     Liste würde die eigentliche Anweisung verwässern.
     ------------------------------------------------------------ */
  steckbrief() {
    const g = this.lies();
    const teile = [];

    const paare = Object.entries(g.woerter).slice(-12);
    if (paare.length) {
      teile.push('Dieser Mensch schreibt erfahrungsgemäß diese Wörter falsch — ' +
        'achte besonders darauf: ' +
        paare.map(([falsch, richtig]) => falsch + ' statt ' + richtig).join(', ') + '.');
    }

    const ruhe = Object.keys(g.inRuhe).slice(0, 12);
    if (ruhe.length) {
      teile.push('Diese Wörter sind so gewollt und bleiben unangetastet: ' +
        ruhe.join(', ') + '.');
    }

    return teile.length ? ' ' + teile.join(' ') : '';
  },

  /** Was steht drin — für die Einstellungen. */
  stand() {
    const g = this.lies();
    return { woerter: Object.keys(g.woerter).length, inRuhe: Object.keys(g.inRuhe).length };
  },

  leeren() { this._merker = null; Speicher.loesch('gelernt'); },
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
  const oben  = stil.getPropertyValue('--paper-raised').trim() || '#F4F5F7';
  const unten = stil.getPropertyValue('--paper').trim()        || '#F4F5F7';
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
   Hier stand eine Messung, die der Knopfleiste bei Platznot die Wörter hinter
   den Sinnbildern wegnahm. Sie gehörte zu der Zeit, als die Knöpfe in EINER
   Reihe nebeneinander standen und die Reihe umbrechen konnte.

   Seit jeder Knopf seine eigene Zeile über die volle Breite hat, gibt es nichts
   mehr zu messen und nichts wegzunehmen. Mit ihr sind die Klassen
   .leiste--eng und .leiste--sehr-eng verschwunden.
   ------------------------------------------------------------ */

let schriftgroesse = Speicher.lies('schrift', 1.05);
function setzeSchrift(wert) {
  schriftgroesse = Math.min(1.75, Math.max(0.9, Math.round(wert * 100) / 100));
  document.documentElement.style.setProperty('--schrift', schriftgroesse + 'rem');
  Speicher.schreib('schrift', schriftgroesse);
  // Andere Schriftgröße heißt anderer Zeilenfall — der Streifen muss mit.
  if (el.spiegel) markiereWort();
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
  /* Wer weiterschreibt, will danach neu prüfen. „Korrigieren" war abgetreten,
     weil gerade nichts zu tun war — jetzt gibt es wieder etwas. Ohne diese
     Zeile blieb nach einem fertigen Text nur „Teilen" stehen, und der neu
     getippte Satz ließ sich nicht mehr prüfen. */
  zeigeDanach(false);
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
  verbergeErgebnis();
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
  /* Die grüne Ansicht liegt über dem Schreibfeld und zeigt den Stand von
     vorhin. Bleibt sie stehen, ändert sich für das Auge nichts — der Knopf
     wirkt tot, obwohl er gearbeitet hat. */
  verbergeErgebnis();
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
/* ------------------------------------------------------------
   a) Wörter, die ein Rechtschreibprüfer NICHT finden kann

   Die Wörter selbst stehen in daten/regeln.js — zusammen mit dem übrigen
   Wortschatz der Prüfung, und dort auch die Begründung, warum welches Wort
   drin steht und welches mit Absicht fehlt. Diese Datei liest ihn nur.
   ------------------------------------------------------------ */
const WOERTERBUCH = REGELDATEN.WOERTERBUCH;

/* ------------------------------------------------------------
   Ist das überhaupt eine Korrektur?

   Eine Rechtschreibkorrektur sieht dem falschen Wort ähnlich: „vieleicht" →
   „vielleicht", „Termien" → „Termin". Androids Prüfer liefert aber auch dann
   einen Vorschlag, wenn er ein Wort schlicht nicht kennt — und dann rät er.
   Für „Zahnriemenspanner-Kettenrolle" schlug er „Unannehmlichkeiten" vor:
   kein gemeinsamer Buchstabe, nichts. Das ist kein Verschreiber, das ist ein
   fremdes Wort.

   Gemessen wird der Abstand (ein Buchstabe weg, dazu, ersetzt) im Verhältnis
   zur Wortlänge. Ein Drittel darf abweichen, mindestens aber ein Buchstabe —
   sonst fielen kurze Wörter wie „seid" → „seit" durch.
   ------------------------------------------------------------ */
/* Zwei vertauschte Buchstaben zählen als EIN Handgriff — „shcon" ist ein
   Vertipper, kein anderes Wort. Genau so zählt es auch die Tippfehler-Regel
   weiter unten; zwei verschiedene Maßstäbe in einer App wären ein Fehler in
   sich. */
function wortAbstand(a, b) {
  const zeilen = [Array.from({ length: b.length + 1 }, (_, i) => i)];
  for (let i = 1; i <= a.length; i++) {
    const zeile = new Array(b.length + 1);
    zeile[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const kosten = a[i - 1] === b[j - 1] ? 0 : 1;
      zeile[j] = Math.min(
        zeilen[i - 1][j] + 1,            // Buchstabe weg
        zeile[j - 1] + 1,                // Buchstabe dazu
        zeilen[i - 1][j - 1] + kosten,   // ersetzt
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        zeile[j] = Math.min(zeile[j], zeilen[i - 2][j - 2] + 1);   // vertauscht
      }
    }
    zeilen.push(zeile);
  }
  return zeilen[a.length][b.length];
}

function istKorrektur(falsch, richtig) {
  const a = String(falsch).toLowerCase();
  const b = String(richtig).toLowerCase();
  if (!a || !b || a === b) return false;
  /* Zwei Handgriffe sind immer erlaubt — „Halloch“ → „Hallo“ ist eine
     richtige Korrektur, und die wäre bei einem sonst durchgefallen. */
  const erlaubt = Math.max(2, Math.floor(Math.min(a.length, b.length) / 3));
  return wortAbstand(a, b) <= erlaubt;
}

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
    /* Erst die mitgelieferte Liste, dann die selbst gelernte. Was dieser
       Mensch schon einmal richtiggestellt hat, steht beim nächsten Mal sofort
       da — ohne KI, ohne Internet. */
    const ausListe = WOERTERBUCH[wort.toLowerCase()];
    const gelernt = ausListe ? null : Gelernt.wort(wort);
    const richtig = ausListe || gelernt;
    if (!richtig) continue;
    // Selbst Gelerntes muss dem Wort ähnlich sehen, sonst war es nie eine
    // Korrektur — siehe istKorrektur() weiter oben.
    if (gelernt && !istKorrektur(wort, gelernt)) continue;
    const ersatz = uebernimmSchreibweise(wort, richtig);
    if (ersatz === wort) continue;
    /* Was aus der mitgelieferten Liste kommt, ist sicher falsch. Was dieser
       Mensch der App selbst beigebracht hat, kam aus EINEM Antippen — das ist
       ein guter Hinweis, aber keine Gewissheit. Deshalb steht es als Tipp da
       und sagt auch, woher es stammt. */
    funde.push(machFund(treffer.index, treffer.index + wort.length,
                        wort, ersatz,
                        gelernt ? 'So hast du es schon einmal geändert' : 'Schreibweise',
                        gelernt ? 'tipp' : 'fehler'));
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

const KEIN_HAUPTWORT = new Set(REGELDATEN.KEIN_HAUPTWORT);

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

const FUERWOERTER          = REGELDATEN.FUERWOERTER.join('|');
const DENK_ZEITWOERTER     = REGELDATEN.DENK_ZEITWOERTER.join('|');
const DENK_ZEITWOERTER_ENG = REGELDATEN.DENK_ZEITWOERTER_ENG.join('|');
const DASS_EIGENSCHAFTEN   = REGELDATEN.DASS_EIGENSCHAFTEN.join('|');
const ZEITANGABEN          = REGELDATEN.ZEITANGABEN.join('|');
const STEIGERUNGEN         = REGELDATEN.STEIGERUNGEN.join('|');
const FOLGT_NEBENSATZ =
  FUERWOERTER + '|' + REGELDATEN.FOLGT_NEBENSATZ_ZUSAETZLICH.join('|');

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

const KEIN_KOMMA_DAVOR = new Set(REGELDATEN.KEIN_KOMMA_DAVOR);
const NEBENSATZ_WOERTER = REGELDATEN.NEBENSATZ_WOERTER;

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

   Die Formen stehen in daten/regeln.js; dort steht auch, warum nur acht
   Zeitwörter geprüft werden und warum „sie“, „ihr“ und „es“ fehlen.
   ------------------------------------------------------------ */
const ZEITWOERTER = REGELDATEN.ZEITWOERTER;
const SPALTE = REGELDATEN.SPALTE;
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

   Wer dabei weichen muss, ist nicht egal. Ein falsch geschriebenes Wort wiegt
   schwerer als ein fehlendes Komma daneben — und die Komma-Regeln greifen über
   zwei Wörter, verdecken also leicht einen Vertipper im ersten davon.
   („geschriben aber" → Komma verdeckte „geschriben → geschrieben".)
   Deshalb kommen die Wort-Funde zuerst dran, die Regel-Funde füllen die Lücken.
   ------------------------------------------------------------ */
function ohneUeberschneidung(funde) {
  const belegt = [];
  const passt = (f) => belegt.every((b) => f.bis <= b.von || f.von >= b.bis);
  const nachStelle = (a, b) => a.von - b.von || (b.bis - b.von) - (a.bis - a.von);

  for (const durchgang of [funde.filter((f) => f.wortEbene),
                           funde.filter((f) => !f.wortEbene)]) {
    for (const fund of durchgang.sort(nachStelle)) {
      if (passt(fund)) belegt.push(fund);
    }
  }
  return belegt.sort(nachStelle);
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
/* ------------------------------------------------------------
   Zusammengeschriebene Wörter trennen: „dasgar“ → „das gar“.

   Die frühere Fassung verlangte, dass der zweite Teil ein kurzes
   Funktionswort ist. Damit blieben genau die Fälle liegen, die beim Tippen
   wirklich entstehen: „dasgar“, „nichtgemacht“. Jetzt entscheidet ein
   richtiges Wörterbuch (355.322 Wörter, daten/woerter.txt).

   Drei Bedingungen, damit nichts zerrissen wird, was zusammengehört:
     1. Steht das Wort selbst im Wörterbuch, bleibt es unangetastet.
        Das schützt Zusammensetzungen wie „Haustür“ oder „Arbeitsamt“.
     2. Beide Teile müssen im Wörterbuch stehen.
     3. Einer der Teile muss ein häufiges kurzes Wort sein. Sonst würde
        „Bürgergeldbescheid“, das im Wörterbuch fehlt, in zwei richtige
        Wörter zerlegt.

   Hier stand „gegen die vollständige Liste geprüft: null Fehlalarme“. Das
   war zu schön: Bedingung 1 schützt jedes Wort, das in der Liste STEHT — an
   denen kann sich nichts zeigen. Gefährlich sind die Wörter außerhalb der
   Liste, und dort trennt auch diese Fassung gelegentlich falsch
   („Untermietvertrag“ → „unter mietvertrag“).

   Ehrlich gemessen, an 1308 Wörtern aus den Texten dieses Projekts und an
   41 Behörden-Zusammensetzungen wie „Bürgergeldbescheid“:
     3 bzw. 1 Fehlalarm — vor wie nach der Lockerung unten dieselben.
   Von 23 typisch zusammengetippten Wörtern werden 21 erkannt (vorher 14).
   ------------------------------------------------------------ */
const TRENN_KURZ = new Set(REGELDATEN.TRENN_KURZ);

/** Wird beim Start im Hintergrund geladen; bis dahin wird nicht getrennt. */
let WOERTERBUCH_GROSS = null;

(async () => {
  try {
    const antwort = await fetch('daten/woerter.txt');
    if (!antwort.ok) return;
    WOERTERBUCH_GROSS = new Set((await antwort.text()).split('\n'));
  } catch { /* Ohne Liste entfällt nur das Trennen, alles andere läuft. */ }
})();

function trenneZusammen(wort) {
  if (!WOERTERBUCH_GROSS) return null;
  const w = wort.toLowerCase();
  if (w.length < 6 || WOERTERBUCH_GROSS.has(w)) return null;
  /* Ab dem ZWEITEN Zeichen, nicht erst ab dem dritten: Sonst bleiben genau die
     Fälle liegen, die beim Tippen am häufigsten entstehen — „ambesten",
     „esgibt", „zuviel", „imanhang". Ein Teil mit nur zwei Zeichen muss dafür
     aus TRENN_KURZ stammen; die große Liste allein wäre hier zu großzügig. */
  for (let i = 2; i <= w.length - 2; i++) {
    const vorn = w.slice(0, i);
    const hinten = w.slice(i);
    if (!WOERTERBUCH_GROSS.has(vorn) || !WOERTERBUCH_GROSS.has(hinten)) continue;
    if (vorn.length < 3 && !TRENN_KURZ.has(vorn)) continue;
    if (hinten.length < 3 && !TRENN_KURZ.has(hinten)) continue;
    if (!TRENN_KURZ.has(vorn) && !TRENN_KURZ.has(hinten)) continue;
    return vorn + ' ' + hinten;
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


/* ------------------------------------------------------------
   Tippfehler: ein Buchstabe daneben.

   „vieleicht“ → „vielleicht“, „shcon“ → „schon“. Gesucht wird nach Wörtern,
   die sich um genau einen Handgriff unterscheiden: ein Buchstabe zu viel,
   zu wenig, falsch, oder zwei vertauscht.

   Bewusst NICHT eingebaut: Trennen und Tippfehler zusammen. „Halloch“ würde
   damit zu „aal loch“, „ichhab“ zu „ich ab“ — die Suche wird so weit, dass
   sie Unsinn findet. Wörter wie „Halloch“ bleiben der KI überlassen.

   Vorschläge erscheinen als Hinweis-Kasten und ändern nichts von allein:
   Bei Namen und Fremdwörtern liegt die Suche zwangsläufig manchmal daneben,
   und dann tippt man den Kasten einfach nicht an.
   ------------------------------------------------------------ */
const ABC = 'abcdefghijklmnopqrstuvwxyzäöüß';

function nachbarWoerter(w) {
  const aus = new Set();
  for (let i = 0; i <= w.length; i++) {
    if (i < w.length) {
      aus.add(w.slice(0, i) + w.slice(i + 1));                     // Buchstabe weg
      for (const c of ABC) aus.add(w.slice(0, i) + c + w.slice(i + 1));  // ersetzt
      if (i < w.length - 1) {
        aus.add(w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2));  // vertauscht
      }
    }
    for (const c of ABC) aus.add(w.slice(0, i) + c + w.slice(i));   // eingefügt
  }
  return aus;
}

function tippfehlerVorschlag(wort) {
  if (!WOERTERBUCH_GROSS) return null;
  const w = wort.toLowerCase();
  if (w.length < 4 || w.length > 20 || WOERTERBUCH_GROSS.has(w)) return null;

  const treffer = [];
  for (const kandidat of nachbarWoerter(w)) {
    if (WOERTERBUCH_GROSS.has(kandidat)) treffer.push(kandidat);
  }
  if (!treffer.length) return null;

  /* Bei mehreren Möglichkeiten gewinnt die naheliegendste.
     Ausschlaggebend ist die Art des Fehlers, nicht die Länge:

     Wer einen Buchstaben vergisst, tippt eine Teilfolge des richtigen Wortes
     — „gemcht" steckt Buchstabe für Buchstabe in „gemacht". Das ist der
     häufigste Vertipper und bekommt Vorrang. Danach kommt der umgekehrte
     Fall (ein Buchstabe zu viel), erst dann vertauscht oder falsch getroffen.

     Ohne diese Reihenfolge gewann „gemäht" gegen „gemacht", nur weil es
     gleich lang ist. */
  const istTeilfolge = (kurz, lang) => {
    let i = 0;
    for (const c of lang) if (i < kurz.length && kurz[i] === c) i++;
    return i === kurz.length;
  };
  const rang = (k) => istTeilfolge(w, k) ? 0 : istTeilfolge(k, w) ? 1 : 2;

  /* Bleiben mehrere gleich nah, gewinnt das Wort mit dem längeren gemeinsamen
     Anfang. Vertippt wird meist in der Mitte, der Wortanfang sitzt.
     So gewinnt „könnten" gegen „klönten" — vorher entschied das Alphabet. */
  const gleicherAnfang = (k) => {
    let i = 0;
    while (i < k.length && i < w.length && k[i] === w[i]) i++;
    return i;
  };

  treffer.sort((a, b) =>
    rang(a) - rang(b) ||
    gleicherAnfang(b) - gleicherAnfang(a) ||
    (TRENN_KURZ.has(b) ? 1 : 0) - (TRENN_KURZ.has(a) ? 1 : 0) ||
    a.length - b.length ||
    a.localeCompare(b, 'de'));
  return treffer[0];
}

function pruefeTippfehler(text, funde) {
  for (const treffer of text.matchAll(WORT_MUSTER)) {
    const wort = treffer[0];
    // Was eine andere Regel schon anfasst, bleibt hier außen vor.
    if (WOERTERBUCH[wort.toLowerCase()] || trenneZusammen(wort)) continue;
    const vorschlag = tippfehlerVorschlag(wort);
    if (!vorschlag) continue;
    const neu = /^[A-ZÄÖÜ]/.test(wort)
      ? vorschlag[0].toUpperCase() + vorschlag.slice(1)
      : vorschlag;
    if (neu === wort) continue;
    funde.push(machFund(treffer.index, treffer.index + wort.length,
                        wort, neu, 'Tippfehler? Ein Buchstabe daneben', 'tipp', false));
  }
}

function findeProbleme(text) {
  // Alles, was ein einzelnes Wort richtigstellt, bekommt bei Überschneidungen
  // den Vorrang vor den Regeln (siehe ohneUeberschneidung).
  const korrekturen = [];
  pruefeWoerter(text, korrekturen);
  pruefeZusammengeschrieben(text, korrekturen);
  pruefeTippfehler(text, korrekturen);
  for (const fund of korrekturen) fund.wortEbene = true;

  /* Wörter, deren Kasten immer wieder stehen geblieben ist, sind so gewollt —
     der Nachname, ein Wort aus der Gegend, ein Fachbegriff. Die App hört auf,
     sie anzumeckern. Was selbst gelernt wurde, bleibt davon unberührt. */
  for (let i = korrekturen.length - 1; i >= 0; i--) {
    const fund = korrekturen[i];
    if (Gelernt.wortEbene(fund) && !Gelernt.wort(fund.alt) && Gelernt.inRuhe(fund.alt)) {
      korrekturen.splice(i, 1);
    }
  }

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


/* ------------------------------------------------------------
   Der Werkzeug-Kasten.

   Die KI-Wege lagen im Zahnrad — jedes Mal aufmachen, zielen, drücken.
   Einhändig ist das mühsam. Jetzt stehen sie als letzter Kasten unter den
   Vorschlägen: genau dort, wo der Blick nach dem Prüfen ohnehin ist, und in
   Daumenreichweite. Die Sprache trägt der Knopf mit, es gibt nichts
   voreinzustellen.

   Ohne hinterlegten Schlüssel bleibt der Kasten weg — sonst stünden dort
   drei Knöpfe, die nichts tun können.
   ------------------------------------------------------------ */
function zeigeWerkzeugKasten() {
  if (!Speicher.lies('apiKey', '')) return;

  const karte = document.createElement('div');
  karte.className = 'fund fund--werkzeug';

  const sorte = document.createElement('span');
  sorte.className = 'fund__sorte';
  sorte.textContent = 'Braucht Internet';
  karte.appendChild(sorte);

  const inhalt = document.createElement('div');
  inhalt.className = 'fund__text';

  const titel = document.createElement('div');
  titel.className = 'werkzeug__titel';
  /* Steht kein Kasten da, ist nichts zu bemängeln — dann passt „Reicht das
     nicht?" nicht, es klänge nach einem Vorwurf für sauberes Schreiben. */
  titel.textContent = el.funde.querySelector('.fund')
    ? 'Reicht das nicht?'
    : 'Noch etwas damit machen?';

  const reihe = document.createElement('div');
  reihe.className = 'werkzeuge';

  /* Ohne Sinnbild: Zu dritt nebeneinander kostet jedes rund 21 px, und
     erklärt hat noch nie eines von ihnen etwas — ein Funkeln sagt niemandem,
     was dahintersteckt. Mit den Wörtern allein passen alle drei in eine
     Zeile, und darauf kommt es hier an. */
  const mach = (beschriftung, tu) => {
    const knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.className = 'werkzeug';
    knopf.textContent = beschriftung;
    knopf.addEventListener('click', tu);
    reihe.appendChild(knopf);
  };

  mach('KI-Korrektur', () => el.btnKorrigieren.click());
  mach('Vorschläge',   () => el.btnFormulieren.click());
  mach(Speicher.lies('sprache', 'Englisch'), () => el.btnUebersetzen.click());

  inhalt.append(titel, reihe);
  karte.appendChild(inhalt);
  el.funde.appendChild(karte);
}

function zeigeFunde() {
  kiVorschlaege = null;
  el.funde.innerHTML = '';
  el.status.textContent = '';
  const text = el.text.value;

  if (!text.trim()) { el.status.textContent = 'Es steht noch kein Text da.'; return; }

  const funde = findeProbleme(text);

  if (funde.length === 0) {
    el.status.textContent = 'Nichts gefunden.';
  } else {
    zeichneFunde(funde);
    el.status.textContent = zusammenfassung(funde);
    Gelernt.merkeGezeigt(funde);
  }

  /* Auch bei fehlerfreiem Text: Ein fertiger Satz ist genau der, den man
     übersetzen oder anders formulieren lassen will. Vorher verschwand mit den
     Kästen auch der Werkzeug-Kasten, und beides war nicht mehr erreichbar. */
  zeigeWerkzeugKasten();

  zeigeDanachWennFertig();

  // Androids Prüfer antwortet erst später und reicht dann nach, was hier fehlt.
  ergaenzeDurchAndroid(text, funde);
}

/* ------------------------------------------------------------
   Steht nichts mehr zum Ändern da, ist der Text fertig — dann muss der Weg
   nach draußen sichtbar sein: Teilen, Zurückgeben, Löschen.

   Zwei Wege führen dorthin, und beide waren zu: Wer einen fehlerfreien Text
   prüfte, bekam nur „Nichts gefunden." und blieb mit „Korrigieren" sitzen.
   Und wer alles abgearbeitet hatte, kam auch nicht weiter, sobald ein
   Schlüssel hinterlegt war — der Werkzeug-Kasten besteht selbst aus Knöpfen
   und sah nach ungetaner Arbeit aus. Deshalb zählen hier nur die Knöpfe, die
   wirklich etwas am Text ändern.
   ------------------------------------------------------------ */
function zeigeDanachWennFertig() {
  zeigeDanach(!el.funde.querySelector('.fund button:not(.werkzeug)'));
}

/* ------------------------------------------------------------
   Nachschlag von Androids Rechtschreibprüfung.

   Der eigene Teil sucht Wörter, die EINEN Buchstaben daneben liegen. Wer zwei
   danebenhaut — „vileicht", „Halloch" —, fällt durch. Genau dort hilft Gboards
   Prüfer, und nur dort: Am Testtext gemessen fand er 7 von 24 Stellen, alle
   davon kannte der eigene Teil auch, zwei davon schlechter. Kommas, Groß- und
   Kleinschreibung, seit/seid, doppelte Wörter kennt er gar nicht.

   Deshalb bekommt er das letzte Wort nicht, sondern das übriggebliebene: Er
   wird nur dort gehört, wo sonst nichts steht.

   Er antwortet über eine Brücke in den Android-Teil, also erst später. Die
   eigenen Kästen stehen da längst; seine werden dazwischengeschoben. Hat sich
   der Text inzwischen geändert, wandert die Antwort in den Papierkorb.
   ------------------------------------------------------------ */
async function ergaenzeDurchAndroid(text, eigene) {
  if (typeof window.systemPruefung !== 'function') return;   // am PC im Browser

  const antwort = await window.systemPruefung(text);
  if (antwort.fehler || !antwort.funde || !antwort.funde.length) return;

  // Steht der Text noch so da? Ist die KI-Liste dazwischengekommen?
  if (el.text.value !== text || kiVorschlaege) return;

  const ueberlappt = (a, b) => a.von < b.bis && b.von < a.bis;
  // Hinweise zum Satzbau spannen über einen ganzen Satz — die zählen hier
  // nicht als besetzt, sonst bliebe kein Platz mehr übrig.
  const besetzt = eigene.filter((f) => f.art !== 'hinweis');

  const dazu = [];
  for (const stelle of antwort.funde) {
    const vorschlag = stelle.vorschlaege[0];
    if (!vorschlag || vorschlag === stelle.wort) continue;
    /* Steht das Wort in unserer eigenen Liste, ist es richtig geschrieben.
       Was Android dann noch vorschlägt, ist keine Rechtschreibkorrektur mehr,
       sondern eine Vermutung über den Satzbau — „großartiges" → „großartiger"
       in einem völlig richtigen Satz. Grammatik nach Gefühl macht diese App
       bewusst nicht. */
    if (WOERTERBUCH_GROSS && WOERTERBUCH_GROSS.has(stelle.wort.toLowerCase())) continue;
    /* Und wenn der Vorschlag mit dem Wort nichts gemein hat, kennt Android das
       Wort einfach nicht: Produktnamen, Fachwörter, Nachnamen. Dann ist
       Schweigen die richtige Antwort. */
    if (!istKorrektur(stelle.wort, vorschlag)) continue;
    // Wörter auf der Ruhe-Liste sind so gewollt — auch Android schweigt dazu.
    if (Gelernt.inRuhe(stelle.wort) && !Gelernt.wort(stelle.wort)) continue;
    if (besetzt.some((f) => ueberlappt(f, stelle))) continue;
    if (dazu.some((f) => ueberlappt(f, stelle))) continue;
    const fund = machFund(stelle.von, stelle.bis, stelle.wort, vorschlag,
                          'Vorschlag von Androids Rechtschreibprüfung', 'tipp', false);
    // Auch dieser Kasten stellt ein einzelnes Wort richtig — also lernbar.
    fund.wortEbene = true;
    dazu.push(fund);
  }
  if (!dazu.length) return;

  const hinweise = eigene.filter((f) => f.art === 'hinweis');
  const alle = besetzt.concat(dazu).sort((a, b) => a.von - b.von).concat(hinweise);

  zeichneFunde(alle);
  el.status.textContent = zusammenfassung(alle);

  /* Nur die nachgereichten zählen — die eigenen hat zeigeFunde() schon gezählt.
     Ohne diese Zeile bliebe ausgerechnet der häufigste Fall ungezählt: Ein
     Nachname steht in keinem Wörterbuch, also meldet ihn Androids Prüfer, und
     nur er. Die Ruhe-Liste hätte ihn nie erreicht. */
  Gelernt.merkeGezeigt(dazu);

  zeigeWerkzeugKasten();

  // „Korrigieren" war eben abgetreten, weil nichts mehr zu tun schien.
  // Jetzt gibt es wieder etwas zu tun.
  zeigeDanachWennFertig();
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
  /* Die einzige Stelle, an der zweifelsfrei feststeht, was dieser Mensch
     wollte. Deshalb wird hier gelernt — und nirgends sonst. */
  Gelernt.merkeAenderung(fund);

  merkeFuerZurueck(jetzt);
  el.text.value = jetzt.slice(0, fund.von) + fund.neu + jetzt.slice(fund.bis);
  textGeaendert();

  /* Was übernommen wurde, leuchtet im Text grün. Frühere grüne Stellen hinter
     dieser Änderung verschieben sich um den Längenunterschied — sonst säße die
     Farbe nach der zweiten Änderung neben dem Wort. */
  const versatz = fund.neu.length - fund.alt.length;
  gruenStellen = (gruenStellen || [])
    .map((st) => (st.von >= fund.bis ? { von: st.von + versatz, bis: st.bis + versatz } : st))
    .concat([{ von: fund.von, bis: fund.von + fund.neu.length }])
    .sort((a, b) => a.von - b.von);
  zeigeGruen();

  if (kiVorschlaege) {
    kiVorschlaege = kiVorschlaege.filter((v) => v !== fund);
    zeigeKiVorschlaege();
  } else {
    zeigeFunde();
  }

  /* Ist nichts mehr zu ändern, tritt „Korrigieren" ab und der Weg zurück
     erscheint — so steht immer nur ein großer Knopf da. */
  zeigeDanachWennFertig();
}

/* Was für ein Fund das ist, stand bisher nur in der Farbe des Balkens links.
   Eine Farbe muss man erst gelernt haben — und wer die App gegen Lesestress
   benutzt, soll nicht auch noch einen Farbschlüssel lernen müssen. Deshalb
   steht die Sorte jetzt als Wort auf der Karte. Die Farbe bleibt, sie trägt
   es nur nicht mehr allein. */
const SORTEN = {
  tipp:      'Kommt drauf an',
  hinweis:   'Zum Nachdenken',
  vorschlag: 'Vorschlag',
};

function zeichneFunde(funde) {
  el.funde.innerHTML = '';
  for (const fund of funde) {
    const karte = document.createElement('div');
    karte.className = 'fund fund--' + fund.art;

    const sorte = document.createElement('span');
    sorte.className = 'fund__sorte';
    // Ohne eigene Sorte ist es einer der eindeutigen Fälle: „wir hat", der
    // kleine Satzanfang, das doppelte Wort.
    sorte.textContent = SORTEN[fund.art] || 'Sicher falsch';
    karte.appendChild(sorte);

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

/* ------------------------------------------------------------
   Der Tonfall, in dem die KI-Korrektur den Text stehen lässt.

   Ein Widerspruch ans Jobcenter und eine Nachricht an den Nachbarn brauchen
   nicht dasselbe. Wer nichts einstellt, bekommt seinen eigenen Ton zurück —
   das ist die sichere Voreinstellung, denn ein ungefragt umgestellter Tonfall
   ist keine Korrektur mehr, sondern eine Umschreibung.
   ------------------------------------------------------------ */
const TONFAELLE = {
  'Wie geschrieben':
    'Lass den Tonfall genau so, wie er im Text steht: Förmliches bleibt ' +
    'förmlich, Lockeres bleibt locker. Ändere die Wortwahl nur da, wo sie ' +
    'falsch ist.',
  'Förmlich (Amt)':
    'Halte den Tonfall durchgehend förmlich und höflich, wie in einem ' +
    'Schreiben an eine Behörde: Siezen, vollständige Sätze, keine ' +
    'Umgangssprache und keine Abkürzungen mitten im Satz. Sachlich bleiben ' +
    'auch dort, wo der Text ärgerlich klingt — der Vorwurf darf inhaltlich ' +
    'stehen bleiben, aber im ruhigen Ton.',
  'Freundlich':
    'Halte den Tonfall freundlich und zugewandt, wie in einer Nachricht an ' +
    'jemanden, den man kennt. Nicht flapsig und nicht anbiedernd.',
  'Kurz und sachlich':
    'Halte den Tonfall knapp und sachlich: kurze Sätze, keine Füllwörter, ' +
    'keine Ausschmückungen. Der Inhalt bleibt dabei vollständig.',
};

const TONFALL_STANDARD = 'Wie geschrieben';

/* ------------------------------------------------------------
   Die KI-Korrektur.

   Sie kann etwas, das kein Wörterbuch kann: den Satz verstehen. „das" oder
   „dass" entscheidet sich nicht am Wort, sondern daran, wovon die Rede ist —
   genauso seit/seid, wider/wieder oder ein fehlendes Komma vor einem
   Relativsatz. Deshalb steht hier ausdrücklich, worauf zu achten ist und dass
   der ganze Text zu lesen ist, nicht Satz für Satz.
   ------------------------------------------------------------ */
const kiKorrektur = (tonfall) =>
  'Du bist eine Schreibhilfe für einen Menschen mit Legasthenie. ' +
  'Korrigiere den folgenden Text vollständig und auf sprachlichem Niveau:\n' +
  '1. Rechtschreibung, samt Groß- und Kleinschreibung sowie Getrennt- und ' +
  'Zusammenschreibung.\n' +
  '2. Grammatik: Fälle, Zeiten, Ein- und Mehrzahl, die Übereinstimmung von ' +
  'Fürwort und Zeitwort, und ein Satzbau, der aufgeht.\n' +
  '3. Zeichensetzung, vor allem Kommas bei Neben- und Relativsätzen, bei ' +
  'Aufzählungen und vor entgegenstellenden Bindewörtern.\n' +
  'Achte besonders auf Verwechslungen, die eine Rechtschreibprüfung nicht ' +
  'finden kann, weil beide Wörter existieren: das/dass, seit/seid, ' +
  'wider/wieder, wie/als, Ihnen/ihnen, End-/Ent-. Entscheide nach dem Sinn ' +
  'des Satzes. ' +
  'Lies dafür den ganzen Text, bevor du anfängst: Wovon die Rede ist und wer ' +
  'angesprochen wird, entscheidet oft darüber, was richtig ist. ' +
  (TONFAELLE[tonfall] || TONFAELLE[TONFALL_STANDARD]) +
  /* Was die App über diesen Menschen gelernt hat. Die KI erinnert sich nicht
     von selbst — sie bekommt die Erinnerung bei jeder Anfrage frisch mit. */
  Gelernt.steckbrief() + ' ' +
  'Ändere nichts am Inhalt, erfinde nichts dazu und lasse nichts weg. ' +
  'Absätze und Zeilenumbrüche bleiben, wie sie sind. ' +
  'Der Text kann in jeder Sprache stehen; antworte in der Sprache des Textes. ' +
  'Antworte ausschließlich mit dem korrigierten Text: keine Erklärung, keine ' +
  'Anführungszeichen, keine Vorrede.';

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
  'folgenden Text die Sätze, die schwer zu lesen oder umständlich ' +
  'sind, und schlage für jeden eine klarere Fassung vor. ' +
  'Regeln: Ändere nichts am Inhalt und erfinde nichts dazu. Behalte den ' +
  'Tonfall — ein Brief ans Amt bleibt förmlich, eine Nachricht an einen Freund ' +
  'bleibt locker. Benutze einfache, gebräuchliche Wörter und kurze Sätze. ' +
  /* Nach dem Übersetzen steht im Feld kein Deutsch mehr. Stand hier „deutscher
     Text", antwortete die KI auf einen englischen Satz mit einer Erklärung
     statt mit der Liste — und die Vorschläge kamen gar nicht erst an. */
  'Der Text kann in jeder Sprache stehen. "neu" bleibt in der Sprache des ' +
  'Textes, "grund" schreibst du immer auf Deutsch. ' +
  'Nimm höchstens sechs Sätze, nur die, bei denen es wirklich hilft; ist der ' +
  'Text schon gut, nimm weniger oder keinen. ' +
  '"alt" ist der Satz zeichengenau aus dem Text — nicht kürzen, nicht ' +
  'glätten, nichts hinzufügen; er muss sich Zeichen für Zeichen im Text ' +
  'wiederfinden. "neu" ist die klarere Fassung, "grund" sagt in höchstens ' +
  'acht Wörtern, warum das leichter ist. ' +
  'Gibt es nichts zu verbessern, bleibt die Liste leer.';

/* Der Bauplan der Antwort. Er wird als JSON-Schema mitgeschickt, und die
   Antwort MUSS ihm entsprechen — kein Fließtext, keine Vorrede, kein
   Code-Zaun, keine fehlenden Felder. Was früher als Bitte in der Anweisung
   stand, ist damit eine Zusage der Schnittstelle. */
const VORSCHLAG_BAUPLAN = {
  type: 'object',
  properties: {
    vorschlaege: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          alt:   { type: 'string' },
          neu:   { type: 'string' },
          grund: { type: 'string' },
        },
        required: ['alt', 'neu', 'grund'],
        additionalProperties: false,
      },
    },
  },
  required: ['vorschlaege'],
  additionalProperties: false,
};

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
  return vorhanden;
}

/* ------------------------------------------------------------
   Eine Anfrage, drei Anwendungen.
   Korrigieren, Übersetzen und Vorschläge unterscheiden sich nur in der
   Anweisung — alles andere (Abbruch nach 90 s, Fehlermeldungen, Nachdenken)
   ist dasselbe.
   ------------------------------------------------------------ */
async function kiAnfrage(anweisung, text, bauplan) {
  const schluessel = Speicher.lies('apiKey', '');
  const modell = Speicher.lies('modell', 'claude-opus-5');

  const anfrage = {
    model: modell,
    /* Reichlich Platz: Das Nachdenken zählt gegen dieselbe Grenze wie die
       Antwort. Mit den früheren 4000 hätte ein langer Brief abgeschnitten
       zurückkommen können. Bezahlt wird, was wirklich verbraucht wird — eine
       hohe Grenze kostet für sich genommen nichts. */
    max_tokens: 16000,
    system: anweisung,
    messages: [{ role: 'user', content: text }],
  };

  const ausgabe = {};

  if (modell !== 'claude-haiku-4-5') {
    // „effort“ gibt es nur bei den neueren Modellen – Haiku würde damit einen Fehler werfen.
    ausgabe.effort = 'low';
    /* Nachdenken bleibt AN. Abgeschaltet schreibt Opus 5 gelegentlich seine
       internen <thinking>-Klammern mit in die Antwort — und die landet hier
       ungefiltert im Textfeld des Menschen. Nachdenken kostet ein paar
       Sekunden und macht die Korrektur obendrein besser: „das“ oder „dass“
       entscheidet sich am Sinn des Satzes, nicht am Wort. */
    anfrage.thinking = { type: 'adaptive' };
  }

  /* „bauplan“ ist ein JSON-Schema. Damit ist die Antwort keine Prosa mehr,
     sondern zwingend eine Struktur in genau dieser Form — die KI KANN gar
     nicht mit „Der Text ist bereits gut verständlich.“ antworten.

     Vorher stand hier ein anderer Weg: der KI die erste Klammer in den Mund
     legen (eine angefangene Assistenten-Nachricht). Den lehnen Opus 5 und
     Sonnet 5 rundheraus ab — Fehler 400. Der Bauplan leistet dasselbe und ist
     der von diesen Modellen vorgesehene Weg. */
  if (bauplan) ausgabe.format = { type: 'json_schema', schema: bauplan };

  if (Object.keys(ausgabe).length) anfrage.output_config = ausgabe;

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
  schliesseEinstellungen();
  const tonfall = Speicher.lies('tonfall', TONFALL_STANDARD);
  kiLauf(kiKorrektur(tonfall),
    'Die KI liest deinen Text … einen Moment.',
    /* Der Tonfall steht in der Meldung, weil er sonst unsichtbar wirkt: Wer
       ihn vor Wochen eingestellt hat, wundert sich sonst über das Ergebnis. */
    'Fertig korrigiert'
      + (tonfall === TONFALL_STANDARD ? '' : ' · ' + tonfall.toLowerCase())
      + '. Nicht einverstanden? „Zurückholen“ darunter.');
});

/* Der dritte Weg: Vorschläge statt fertiger Text. */
el.btnFormulieren.addEventListener('click', async () => {
  schliesseEinstellungen();
  const text = el.text.value.trim();
  if (!text) { el.status.textContent = 'Es steht noch kein Text da.'; return; }

  el.btnKi.disabled = true;
  el.btnKi.classList.add('btn--laeuft');
  el.funde.innerHTML = '';
  el.status.textContent = 'Die KI liest deinen Text … einen Moment.';

  const { ergebnis, fehler, cent } = await kiAnfrage(KI_VORSCHLAEGE, text, VORSCHLAG_BAUPLAN);

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

/* Die Antwort folgt dem Bauplan: ein Objekt mit dem Feld „vorschlaege“.
   Der zweite und dritte Anlauf sind Notausgänge — falls doch einmal ein Modell
   ohne Bauplan antwortet oder die Antwort in einen Code-Zaun packt. */
function leseListe(antwort) {
  const daten = alsJson(antwort);
  if (!daten) return null;
  if (Array.isArray(daten.vorschlaege)) return daten.vorschlaege;
  if (Array.isArray(daten)) return daten;        // nackte Liste
  return null;
}

/* Erst geradeheraus lesen; klappt das nicht, das Stück zwischen der ersten
   öffnenden und der letzten schließenden Klammer herausschneiden. */
function alsJson(antwort) {
  const roh = String(antwort).trim();
  try { return JSON.parse(roh); } catch {}

  for (const [auf, zu] of [['{', '}'], ['[', ']']]) {
    const von = roh.indexOf(auf);
    const bis = roh.lastIndexOf(zu);
    if (von === -1 || bis <= von) continue;
    try { return JSON.parse(roh.slice(von, bis + 1)); } catch {}
  }
  return null;
}

el.btnUebersetzen.addEventListener('click', () => {
  const sprache = el.zielsprache.value;
  Speicher.schreib('sprache', sprache);
  schliesseEinstellungen();
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
const kannTeilen = kannBrueckeTeilen || typeof navigator.share === 'function';

/* Am PC gibt es kein Teilen-Menü. Der Knopf kopiert dort — und schreibt das
   jetzt auch drauf, statt es erst beim Drücken zu verraten. Dieselbe App,
   dieselbe Stelle, nur ehrlich beschriftet. */
if (!kannTeilen) {
  const sinnbild = el.btnTeilen.querySelector('use');
  if (sinnbild) sinnbild.setAttribute('href', '#i-copy');
  const wort = [...el.btnTeilen.childNodes].find((k) => k.nodeType === 3 && k.textContent.trim());
  if (wort) wort.textContent = ' Kopieren';
}

el.btnTeilen.addEventListener('click', async () => {
  const text = holeText(); if (!text) return;

  if (kannBrueckeTeilen) { bruecke.teilen(text); return; }

  if (navigator.share) {
    try { await navigator.share({ text }); return; }
    catch (fehler) { if (fehler.name === 'AbortError') return; }
  }
  // Kein Teilen möglich — dafür heißt der Knopf oben schon „Kopieren“.
  kopiere(text, 'Text kopiert. Jetzt in WhatsApp, Mail oder Word einfügen.');
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

/* „ziel“ ist die Zeile, in der die Rückmeldung erscheint. Voreingestellt ist
   die Statuszeile im Schreibbildschirm — wer aus den Einstellungen heraus
   kopiert, sieht die dortige Zeile, weil der Schreibbildschirm gerade
   abgetreten ist. */
async function kopiere(text, meldung, ziel = el.status) {
  if (kannBrueckeKopieren) {
    bruecke.kopieren(text);
    ziel.textContent = meldung;
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    ziel.textContent = meldung;
  } catch {
    ziel.textContent = ueberHilfsfeld(text)
      ? meldung
      : 'Kopieren hat nicht geklappt. Bitte von Hand markieren und kopieren.';
  }
}

/* Der alte Weg, wenn die Zwischenablage sich sperrt.

   Vorher wurde dafür das Schreibfeld markiert und kopiert. Das ging gut,
   solange nur der eigene Brief kopiert wurde — beim Sicherungs-Text wäre
   dabei der Brief in der Zwischenablage gelandet statt des Gedächtnisses.
   Deshalb ein eigenes, unsichtbares Feld: Es trägt genau den Text, um den es
   geht, und verschwindet sofort wieder. */
function ueberHilfsfeld(text) {
  const feld = document.createElement('textarea');
  feld.value = text;
  feld.setAttribute('readonly', '');
  feld.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  document.body.appendChild(feld);
  feld.select();
  let geklappt = false;
  try { geklappt = document.execCommand('copy'); } catch {}
  feld.remove();
  return geklappt;
}

/* ============================================================
   6. Einstellungen
   ============================================================ */

/* Was liegt gespeichert? Genug, um es wiederzuerkennen, nicht genug, um es
   abzuschreiben. Ein Schlüssel von Anthropic fängt mit „sk-ant-“ an und ist
   rund hundert Zeichen lang — passt das nicht, steht es hier. */
/* ------------------------------------------------------------
   Den Schlüssel kurz sichtbar machen.

   Wer ihn auf ein zweites Gerät bringen will, muss ihn sehen oder kopieren
   können — abtippen kann man 100 Zeichen aus lauter Punkten nicht.

   Sichtbar bleibt er nur eine halbe Minute und verbirgt sich dann von selbst;
   ebenso beim Verlassen der Einstellungen. Ein Feld, das offen stehen bleibt,
   vergisst man genau dann, wenn man das Handy weiterreicht.
   ------------------------------------------------------------ */
const SCHLUESSEL_SICHTBAR_MS = 30000;
let schluesselWecker = null;

function verbergeSchluessel() {
  clearTimeout(schluesselWecker);
  schluesselWecker = null;
  el.apiKey.type = 'password';
  el.wortZeigen.textContent = 'Anzeigen';
}

function zeigeSchluessel() {
  if (!el.apiKey.value) {
    el.schluesselStand.textContent = 'Es ist kein Schlüssel gespeichert.';
    return;
  }
  el.apiKey.type = 'text';
  el.wortZeigen.textContent = 'Verbergen';
  clearTimeout(schluesselWecker);
  schluesselWecker = setTimeout(verbergeSchluessel, SCHLUESSEL_SICHTBAR_MS);
}

el.btnSchluesselZeigen.addEventListener('click', () => {
  if (el.apiKey.type === 'password') zeigeSchluessel(); else verbergeSchluessel();
});

el.btnSchluesselKopieren.addEventListener('click', () => {
  const schluessel = el.apiKey.value.trim();
  if (!schluessel) {
    el.schluesselStand.textContent = 'Es ist kein Schlüssel gespeichert.';
    return;
  }
  kopiere(schluessel,
          'Schlüssel kopiert. Auf dem anderen Gerät einfügen — und die '
          + 'Zwischenablage danach mit etwas anderem überschreiben.',
          el.schluesselStand);
});

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

/* ------------------------------------------------------------
   Die Einstellungen als eigener Bildschirm.

   Vorher lagen sie als <dialog> über der App: ein Fenster in einem Fenster,
   zu schließen über ein Kreuz oben rechts — genau dort, wo der Daumen beim
   einhändigen Halten nicht hinkommt. Jetzt tritt der Schreibbildschirm ab,
   solange sie offen sind, und der Weg zurück ist der gewohnte.
   ------------------------------------------------------------ */
function oeffneEinstellungen() {
  el.dlg.hidden = false;
  document.body.classList.add('seite-offen');
  const form = el.dlg.querySelector('.form');
  if (form) form.scrollTop = 0;
}

function schliesseEinstellungen() {
  // Ein sichtbarer Schlüssel darf nicht offen zurückbleiben.
  verbergeSchluessel();
  el.dlg.hidden = true;
  document.body.classList.remove('seite-offen');
}

/* Die Android-Zurück-Taste fragt hier zuerst nach (siehe MainActivity): Ist
   dieser Bildschirm offen, gehört sie ihm — und nicht dem Beenden der App. */
window.zurueckTaste = () => {
  if (!document.body.classList.contains('seite-offen')) return false;
  schliesseEinstellungen();
  return true;
};

el.btnSettings.addEventListener('click', () => {
  el.apiKey.value = Speicher.lies('apiKey', '');
  zeigeSchluesselStand();
  el.modell.value = Speicher.lies('modell', 'claude-opus-5');
  el.tonfall.value = Speicher.lies('tonfall', TONFALL_STANDARD);
  el.wortmarker.checked = hervorhebenAn();
  zeigeKosten();
  zeigeGelernt();
  /* Im Browser gibt es keine Fassung — dort steht immer das Neueste. */
  el.fassung.textContent = typeof window.AndroidBridge?.fassung === 'function'
    ? 'Schreibhilfe ' + window.AndroidBridge.fassung()
    : '';
  oeffneEinstellungen();
});

/* Wirkt sofort, wie der Wortmarker: Wer den Tonfall umstellt und gleich
   danach korrigieren lässt, soll nicht erst „Speichern" suchen müssen. */
el.tonfall.addEventListener('change', () => {
  Speicher.schreib('tonfall', el.tonfall.value);
});

/* Wirkt sofort — man sieht ja beim Zumachen gleich, ob es einem gefällt. */
el.wortmarker.addEventListener('change', () => {
  Speicher.schreib('wortmarker', el.wortmarker.checked);
  markiereWort();
});
el.btnSettingsZu.addEventListener("click", schliesseEinstellungen);

el.btnSpeichern.addEventListener('click', () => {
  const schluessel = el.apiKey.value.trim();
  if (schluessel) Speicher.schreib('apiKey', schluessel);
  else Speicher.loesch('apiKey');
  Speicher.schreib('modell', el.modell.value);
  zeigeSchluesselStand();
  kiVerfuegbar();
  schliesseEinstellungen();
});

el.btnKostenWeg.addEventListener('click', () => {
  Speicher.loesch('kosten');
  zeigeKosten();
});

/* ------------------------------------------------------------
   Was die App über den Menschen gelernt hat — in einem Satz.
   ------------------------------------------------------------ */
function zeigeGelernt() {
  const { woerter, inRuhe } = Gelernt.stand();
  const teile = [];
  if (woerter) teile.push(woerter === 1 ? '1 eigene Schreibweise' : woerter + ' eigene Schreibweisen');
  if (inRuhe)  teile.push(inRuhe  === 1 ? '1 Wort in Ruhe gelassen' : inRuhe + ' Wörter in Ruhe gelassen');

  el.gelerntStand.textContent = teile.length
    ? teile.join(' · ')
    : 'Noch nichts gelernt. Jedes „Ändern“ bringt der App etwas bei.';
  el.btnGelerntWeg.hidden = teile.length === 0;
}

el.btnGelerntWeg.addEventListener('click', () => {
  Gelernt.leeren();
  zeigeGelernt();
});

/* ------------------------------------------------------------
   Der Sicherungs-Text — die Brücke zwischen Handy und PC.

   Beide Geräte lernen für sich; was hier gelernt wird, bleibt hier. „Sichern“
   legt alles Gelernte als Text in die Zwischenablage, „Einspielen“ nimmt ihn
   auf dem anderen Gerät wieder auf. Der Weg dazwischen ist deiner: eine
   Nachricht an dich selbst, eine Notiz, eine Mail.

   Zwei Dinge bleiben bewusst draußen:
     · Der API-Schlüssel. Ein Schlüssel gehört nicht in einen Text, den man
       durch die Gegend schickt — auf dem zweiten Gerät ist er in einer Minute
       neu eingetragen.
     · Der Zähler „gezeigt“. Er zählt Prüfungen auf DIESEM Gerät; auf einem
       anderen ergäbe er keinen Sinn.

   Eingespielt wird ZUSAMMENGEFÜHRT, nicht ersetzt: Was auf diesem Gerät schon
   gelernt war, bleibt. Sonst würde die Reise vom Handy zum PC das Gelernte des
   PCs auslöschen.
   ------------------------------------------------------------ */
const SICHERUNG_FASSUNG = 1;
const SICHERBAR = ['tonfall', 'modell', 'sprache', 'wortmarker'];
const SICHERUNG_GRENZE = 2000;              // so viele Wörter höchstens
const GELERNTES_WORT = /^[a-zäöüß-]{1,40}$/;

function sicherungBauen() {
  const g = Gelernt.lies();
  const einstellungen = {};
  for (const name of SICHERBAR) {
    const wert = Speicher.lies(name, undefined);
    if (wert !== undefined) einstellungen[name] = wert;
  }
  return JSON.stringify({
    schreibhilfe: SICHERUNG_FASSUNG,
    woerter: g.woerter,
    inRuhe: g.inRuhe,
    einstellungen,
  });
}

/* Alles hier Ankommende ist ungeprüft — es kann aus jeder Quelle stammen und
   landet dauerhaft im Speicher. Deshalb wird jeder Eintrag einzeln geprüft
   und alles Unpassende stillschweigend übergangen. */
function sicherungEinspielen(roh) {
  let daten;
  try { daten = JSON.parse(String(roh).trim()); }
  catch { return { fehler: 'Das war kein Sicherungs-Text.' }; }

  if (!daten || daten.schreibhilfe !== SICHERUNG_FASSUNG) {
    return { fehler: 'Das ist kein Sicherungs-Text der Schreibhilfe.' };
  }

  const g = Gelernt.lies();
  let neueWoerter = 0, neueRuhe = 0;

  for (const [falsch, richtig] of Object.entries(daten.woerter || {})) {
    if (Object.keys(g.woerter).length >= SICHERUNG_GRENZE) break;
    if (!GELERNTES_WORT.test(falsch)) continue;
    if (typeof richtig !== 'string' || !richtig.trim() || richtig.length > 60) continue;
    if (g.woerter[falsch] !== richtig) neueWoerter++;
    g.woerter[falsch] = richtig;
  }

  for (const wort of Object.keys(daten.inRuhe || {})) {
    if (Object.keys(g.inRuhe).length >= SICHERUNG_GRENZE) break;
    if (!GELERNTES_WORT.test(wort)) continue;
    if (!g.inRuhe[wort]) neueRuhe++;
    g.inRuhe[wort] = true;
  }

  Gelernt.schreib(g);

  for (const [name, wert] of Object.entries(daten.einstellungen || {})) {
    if (SICHERBAR.includes(name)) Speicher.schreib(name, wert);
  }

  return { neueWoerter, neueRuhe };
}

el.btnSichern.addEventListener('click', () => {
  const { woerter, inRuhe } = Gelernt.stand();
  if (!woerter && !inRuhe) {
    el.gelerntStand.textContent = 'Noch nichts gelernt — es gibt nichts zu sichern.';
    return;
  }
  kopiere(sicherungBauen(),
          'Gedächtnis kopiert. Auf dem anderen Gerät „Einspielen“ drücken.',
          el.gelerntStand);
});

el.btnEinspielen.addEventListener('click', () => {
  const roh = window.prompt('Sicherungs-Text vom anderen Gerät hier einfügen:');
  if (roh === null || !roh.trim()) return;

  const ergebnis = sicherungEinspielen(roh);
  if (ergebnis.fehler) { el.gelerntStand.textContent = ergebnis.fehler; return; }

  // Die Einstellungen können sich geändert haben — die Felder nachziehen.
  el.tonfall.value = Speicher.lies('tonfall', TONFALL_STANDARD);
  el.modell.value = Speicher.lies('modell', 'claude-opus-5');
  el.zielsprache.value = Speicher.lies('sprache', 'Englisch');
  el.wortmarker.checked = hervorhebenAn();
  markiereWort();
  zeigeGelernt();

  el.gelerntStand.textContent = 'Eingespielt: ' +
    ergebnis.neueWoerter + ' Schreibweisen, ' + ergebnis.neueRuhe + ' Wörter in Ruhe. ' +
    'Was hier schon stand, blieb erhalten.';
});

el.btnSchluesselWeg.addEventListener('click', () => {
  Speicher.loesch('apiKey');
  el.apiKey.value = '';
  zeigeSchluesselStand();
  kiVerfuegbar();
  schliesseEinstellungen();
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
