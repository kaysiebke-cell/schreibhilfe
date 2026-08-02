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
el.text.addEventListener('input', textGeaendert);
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
   3. Offline-Rechtschreibprüfung
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

/* Sucht alle Stellen, die auffällig sind. */
function findeProbleme(text) {
  const funde = [];

  // a) Falsch geschriebene Wörter
  for (const treffer of text.matchAll(WORT_MUSTER)) {
    const wort = treffer[0];
    const richtig = WOERTERBUCH[wort.toLowerCase()];
    if (!richtig) continue;
    const ersatz = uebernimmSchreibweise(wort, richtig);
    if (ersatz === wort) continue;
    funde.push({
      von: treffer.index, bis: treffer.index + wort.length,
      alt: wort, neu: ersatz,
      zeigeAlt: wort, zeigeNeu: ersatz,
      grund: 'Schreibweise', tipp: false,
    });
  }

  // b) Abstände und Satzzeichen
  const regeln = [
    { muster:/ {2,}/g,                        bau:() => ' ',
      grund:'Mehrere Leerzeichen hintereinander' },
    { muster:/[ \t]+([,.;:!?])/g,             bau:(m, z) => z,
      grund:'Vor dem Satzzeichen gehört kein Leerzeichen' },
    { muster:/([,;:])([A-Za-zÄÖÜäöüß])/g,     bau:(m, z, b) => z + ' ' + b,
      grund:'Nach dem Satzzeichen fehlt ein Leerzeichen' },
    /* Punkt/Ausrufe-/Fragezeichen, direkt gefolgt vom nächsten Satz.
       Mindestens zwei Buchstaben davor, damit Abkürzungen wie „z.B.“ in Ruhe
       gelassen werden – und der Wächter hält Web- und E-Mail-Adressen raus. */
    { muster:/([A-Za-zÄÖÜäöüß]{2}[.!?])([A-Za-zÄÖÜäöüß])/g,
      bau:(m, z, b) => z + ' ' + b,
      pruefe:(text, stelle) => !/[@]|https?:|www\.|\.(de|com|org|net|eu)\b/i
                                 .test(text.slice(Math.max(0, stelle - 25), stelle + 25)),
      grund:'Nach dem Satzzeichen fehlt ein Leerzeichen' },
    { muster:/\b([A-Za-zÄÖÜäöüß]+) \1\b/gi,   bau:(m, w) => w,
      grund:'Das Wort steht doppelt da' },
  ];
  for (const regel of regeln) {
    for (const treffer of text.matchAll(regel.muster)) {
      const alt = treffer[0];
      if (regel.pruefe && !regel.pruefe(text, treffer.index)) continue;
      const neu = regel.bau(...treffer);
      if (neu === alt) continue;
      funde.push({
        von: treffer.index, bis: treffer.index + alt.length,
        alt, neu,
        zeigeAlt: alt.replace(/ /g, '␣'), zeigeNeu: neu.replace(/ /g, '␣'),
        grund: regel.grund, tipp: false,
      });
    }
  }

  // c) Satzanfang großschreiben
  for (const treffer of text.matchAll(/(^|[.!?]\s+)([a-zäöüß])/g)) {
    const buchstabe = treffer[2];
    const stelle = treffer.index + treffer[1].length;
    funde.push({
      von: stelle, bis: stelle + 1,
      alt: buchstabe, neu: buchstabe.toUpperCase(),
      zeigeAlt: buchstabe, zeigeNeu: buchstabe.toUpperCase(),
      grund: 'Satzanfang großschreiben', tipp: false,
    });
  }

  // d) Hinweise auf typische Verwechslungen
  const hinweise = [
    { muster:/,\s*das\s+(ich|du|er|sie|es|wir|ihr|man)\b/gi,
      bau:(m) => m.replace(/das/i, 'dass'),
      grund:'Nach dem Komma leitet „dass“ den Nebensatz ein.' },
    { muster:/\bseid\s+(einem|einer|dem|der|gestern|heute|langem|Jahren|Monaten|Wochen|Tagen)\b/gi,
      bau:(m) => m.replace(/seid/i, 'seit'),
      grund:'Bei Zeitangaben heißt es „seit“ – „seid“ nur bei „ihr seid“.' },
    { muster:/\bseit\s+ihr\b/gi,
      bau:() => 'seid ihr',
      grund:'„ihr seid“ – hier gehört ein d ans Ende.' },
  ];
  for (const hinweis of hinweise) {
    for (const treffer of text.matchAll(hinweis.muster)) {
      const alt = treffer[0];
      const neu = hinweis.bau(alt);
      if (neu === alt) continue;
      funde.push({
        von: treffer.index, bis: treffer.index + alt.length,
        alt, neu, zeigeAlt: alt, zeigeNeu: neu,
        grund: hinweis.grund, tipp: true,
      });
    }
  }

  funde.sort((a, b) => a.von - b.von);
  return funde;
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
    karte.className = 'fund' + (fund.tipp ? ' fund--tipp' : '');

    const beschreibung = document.createElement('div');
    beschreibung.className = 'fund__text';

    const zeile = document.createElement('div');
    zeile.className = 'fund__wort';
    const alt = document.createElement('span'); alt.className = 'fund__falsch';  alt.textContent = fund.zeigeAlt;
    const pfeil = document.createElement('span'); pfeil.className = 'fund__pfeil'; pfeil.textContent = '→';
    const neu = document.createElement('span'); neu.className = 'fund__richtig'; neu.textContent = fund.zeigeNeu;
    zeile.append(alt, pfeil, neu);

    const grund = document.createElement('small');
    grund.className = 'fund__grund';
    grund.textContent = fund.grund;

    beschreibung.append(zeile, grund);

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

    karte.append(beschreibung, knopf);
    el.funde.appendChild(karte);
  }
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
