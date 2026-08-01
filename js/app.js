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
  kiStatus:      $('ki-status'),
  funde:         $('funde'),
  btnTeilen:     $('btn-teilen'),
  btnWhatsapp:   $('btn-whatsapp'),
  btnSms:        $('btn-sms'),
  btnMail:       $('btn-mail'),
  btnKopieren:   $('btn-kopieren'),
  teilenStatus:  $('teilen-status'),
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

el.btnTheme.addEventListener('click', () => {
  const neu = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = neu;
  Speicher.schreib('theme', neu);
  const farbe = getComputedStyle(document.body).getPropertyValue('--paper-raised').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', farbe || '#2B4C5C');
});

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
  el.zaehler.textContent = woerter === 1 ? '1 Wort' : woerter + ' Wörter';
}
el.text.addEventListener('input', textGeaendert);
textGeaendert();

el.btnLeeren.addEventListener('click', () => {
  if (!el.text.value) return;
  if (!confirm('Wirklich den ganzen Text löschen?')) return;
  merkeFuerZurueck(el.text.value);
  el.text.value = '';
  textGeaendert();
  el.funde.innerHTML = '';
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
  el.kiStatus.textContent = '';
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

function meldung(text, art) {
  const kasten = document.createElement('div');
  kasten.className = 'melde' + (art === 'info' ? ' melde--info' : '');
  kasten.append(icon(art === 'info' ? 'i-search' : 'i-check'), document.createTextNode(' ' + text));
  return kasten;
}

function zeigeFunde() {
  el.funde.innerHTML = '';
  const text = el.text.value;

  if (!text.trim()) {
    el.funde.appendChild(meldung('Es steht noch kein Text da.', 'info'));
    return;
  }

  const funde = findeProbleme(text);

  if (funde.length === 0) {
    el.funde.appendChild(meldung('Nichts gefunden – der Text sieht gut aus.'));
    return;
  }

  const kopf = document.createElement('p');
  kopf.className = 'hint';
  kopf.style.marginBottom = '.6rem';
  kopf.textContent = funde.length === 1
    ? '1 Stelle gefunden. Tippe auf „Ändern“.'
    : funde.length + ' Stellen gefunden. Tippe jeweils auf „Ändern“.';
  el.funde.appendChild(kopf);

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
  if (!text) { el.kiStatus.textContent = 'Es steht noch kein Text da.'; return; }

  const schluessel = Speicher.lies('apiKey', '');
  const modell = Speicher.lies('modell', 'claude-opus-5');

  el.btnKi.disabled = true;
  el.btnKi.classList.add('btn--laeuft');
  el.kiStatus.textContent = 'Die KI liest deinen Text … einen Moment.';

  const anfrage = {
    model: modell,
    max_tokens: 4000,
    system: KI_ANWEISUNG,
    messages: [{ role: 'user', content: text }],
  };
  // „effort“ gibt es nur bei den neueren Modellen – Haiku würde damit einen Fehler werfen.
  if (modell !== 'claude-haiku-4-5') anfrage.output_config = { effort: 'low' };

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
      el.kiStatus.textContent = 'Die KI wollte diesen Text nicht bearbeiten.';
      return;
    }

    const korrigiert = (daten.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();

    if (!korrigiert) { el.kiStatus.textContent = 'Es kam keine Antwort zurück.'; return; }

    merkeFuerZurueck(el.text.value);
    el.text.value = korrigiert;
    textGeaendert();
    el.funde.innerHTML = '';
    el.kiStatus.textContent = 'Fertig korrigiert. Nicht einverstanden? Oben auf „Rückgängig“ tippen.';

  } catch (fehler) {
    el.kiStatus.textContent = !navigator.onLine
      ? 'Kein Internet. Die KI-Korrektur braucht eine Verbindung.'
      : 'Es hat nicht geklappt: ' + fehler.message;
  } finally {
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
  if (!text) { el.teilenStatus.textContent = 'Es steht noch kein Text da.'; return null; }
  el.teilenStatus.textContent = '';
  return text;
}

const istApple = /iPad|iPhone|iPod/.test(navigator.userAgent);

el.btnTeilen.addEventListener('click', async () => {
  const text = holeText(); if (!text) return;
  if (!navigator.share) {
    el.teilenStatus.textContent =
      'Dieser Browser kann das System-Teilen nicht. Nimm „Kopieren“ und füge den Text in der anderen App ein.';
    return;
  }
  try { await navigator.share({ text }); }
  catch (fehler) { if (fehler.name !== 'AbortError') el.teilenStatus.textContent = 'Teilen abgebrochen.'; }
});

el.btnWhatsapp.addEventListener('click', () => {
  const text = holeText(); if (!text) return;
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
});

el.btnSms.addEventListener('click', () => {
  const text = holeText(); if (!text) return;
  location.href = 'sms:' + (istApple ? '&' : '?') + 'body=' + encodeURIComponent(text);
});

el.btnMail.addEventListener('click', () => {
  const text = holeText(); if (!text) return;
  const betreff = text.split('\n')[0].slice(0, 60);
  location.href = 'mailto:?subject=' + encodeURIComponent(betreff) + '&body=' + encodeURIComponent(text);
});

el.btnKopieren.addEventListener('click', async () => {
  const text = holeText(); if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    el.teilenStatus.textContent = 'Text kopiert. Jetzt in der anderen App einfügen.';
  } catch {
    el.text.select();
    document.execCommand('copy');
    el.teilenStatus.textContent = 'Text kopiert.';
  }
});

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
