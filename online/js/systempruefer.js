/* ------------------------------------------------------------
   Die Webseiten-Seite der Brücke zu Androids Rechtschreibprüfung.

   Hängt bewusst noch nicht in der Bedienung. Der Zweck ist das Messen:
   Findet Androids Prüfer etwas, das der eigene Wörterbuch-Teil übersieht?

       await vergleichePruefer('dein testtext')

   Im Browser am PC gibt es keinen AndroidPruefer — dort melden beide
   Funktionen das als Fehler zurück, statt zu scheitern.
   ------------------------------------------------------------ */
(() => {
  const wartende = new Map();
  let naechsteRufnummer = 1;

  /* Ruft der Android-Teil auf, sobald der Prüfer geantwortet hat. */
  window.__systemPrueferAntwort = (ruf, ergebnis) => {
    const loese = wartende.get(ruf);
    if (!loese) return;              // schon abgelaufen
    wartende.delete(ruf);
    loese(ergebnis);
  };

  window.systemPrueferBereit = () => {
    try {
      return typeof AndroidPruefer !== 'undefined' && AndroidPruefer.bereit();
    } catch {
      return false;
    }
  };

  window.systemPruefung = (text) => new Promise((loese) => {
    if (typeof AndroidPruefer === 'undefined') {
      loese({ fehler: 'Androids Prüfer gibt es nur in der App, nicht im Browser.' });
      return;
    }
    const ruf = naechsteRufnummer++;
    wartende.set(ruf, loese);
    // Zweite Reißleine: die erste sitzt drüben im Android-Teil.
    setTimeout(() => {
      if (wartende.delete(ruf)) loese({ fehler: 'Keine Antwort vom Prüfer.' });
    }, 8000);
    AndroidPruefer.pruefe(text, ruf);
  });

  /* Beide Prüfer auf denselben Text, und dann die Differenz. */
  window.vergleichePruefer = async (text) => {
    const system = await window.systemPruefung(text);
    if (system.fehler) return system;

    const eigen = findeProbleme(text).filter((f) => f.neu !== undefined);
    const ueberlappt = (a, b) => a.von < b.bis && b.von < a.bis;

    return {
      eigeneFunde: eigen.length,
      systemFunde: system.funde.length,

      // Der eigentliche Grund für die ganze Übung.
      nurAndroid: system.funde
        .filter((s) => !eigen.some((f) => ueberlappt(f, s)))
        .map((s) => s.wort + ' → ' + (s.vorschlaege[0] || '(kein Vorschlag)')),

      nurEigen: eigen
        .filter((f) => !system.funde.some((s) => ueberlappt(f, s)))
        .map((f) => f.alt + ' → ' + f.neu),

      beide: system.funde
        .filter((s) => eigen.some((f) => ueberlappt(f, s)))
        .map((s) => {
          const meiner = eigen.find((f) => ueberlappt(f, s));
          return s.wort + ': ich „' + meiner.neu +
                 '“ / Android „' + (s.vorschlaege[0] || '—') + '“';
        }),
    };
  };
})();
