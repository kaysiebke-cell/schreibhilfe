#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Stellt die KI-Anweisungen der Erweiterung denen der Handy-App gegenüber.

Die Datei schreibhilfe.py sagt von sich, sie schicke „Wort für Wort dieselben"
Anweisungen wie online/js/app.js. Bewiesen war das nie: Zwei Sätze in zwei
Sprachen, die niemand nebeneinanderlegt, laufen mit jeder Änderung weiter
auseinander — und dann korrigiert der PC anders als das Handy, ohne dass es
jemandem auffällt.

Dieses Programm legt sie nebeneinander. Verglichen wird zeichengenau, samt
Leerzeichen: Ein verlorenes Leerzeichen klebt zwei Sätze zusammen, und genau
das passiert beim Übersetzen von Hand.

    python3 vergleiche-anweisungen.py       # nur die Abweichungen
    python3 vergleiche-anweisungen.py -v    # jede Anweisung einzeln

Rückgabe 0, wenn beide Seiten in allem übereinstimmen.
"""

import difflib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import types

HIER = os.path.dirname(os.path.abspath(__file__))


def lade_erweiterung():
    """Importiert schreibhilfe.py ohne LibreOffice.

    Die Datei holt sich beim Laden „uno" und ein halbes Dutzend
    com.sun.star-Module — die gibt es nur im Schreibprogramm. Für die
    Anweisungen braucht sie davon nichts: Es sind reine Zeichenketten. Also
    werden die Module als leere Hüllen untergeschoben, damit das Laden
    durchläuft.
    """
    # Jede Schnittstelle nur EINMAL erfinden. Bei jedem Zugriff eine neue
    # Klasse zu liefern ginge schief, sobald zwei Dateien dieselbe importieren:
    # Python hielte sie für zwei verschiedene.
    erfunden = {}

    def hole(name):
        if name not in erfunden:
            erfunden[name] = type(name, (object,), {})
        return erfunden[name]

    for name in ("uno", "unohelper", "com", "com.sun", "com.sun.star",
                 "com.sun.star.awt", "com.sun.star.datatransfer",
                 "com.sun.star.frame", "com.sun.star.lang"):
        if name not in sys.modules:
            huelle = types.ModuleType(name)
            huelle.__path__ = []
            huelle.__getattr__ = hole
            sys.modules[name] = huelle
    # unohelper.Base wird als Basisklasse benutzt. Nicht „object" selbst: Steht
    # object neben einer anderen Basis, bekommt Python die Reihenfolge der
    # Basisklassen nicht mehr aufgelöst.
    sys.modules["unohelper"].Base = type("Base", (object,), {})
    sys.modules["unohelper"].ImplementationHelper = lambda: types.SimpleNamespace(
        addImplementation=lambda *a, **k: None)

    sys.path.insert(0, os.path.join(HIER, "schreibhilfe"))
    import schreibhilfe                                            # noqa: E402
    return schreibhilfe


def python_seite(SH):
    """Dieselben Anweisungen wie anweisungen.js, in derselben Reihenfolge."""
    zettel = "Widerspruch gegen die Kürzung — kurz und höflich"
    raus = {}

    for name in SH.EMPFAENGER:
        raus["korrektur/" + name] = SH.ki_korrektur(name, "")
        raus["korrektur+zettel/" + name] = SH.ki_korrektur(name, zettel)
        raus["vorschlaege/" + name] = SH.ki_vorschlag_anweisung(name, "")
        raus["vorschlaege+zettel/" + name] = SH.ki_vorschlag_anweisung(name, zettel)
    raus["korrektur/unbekannt"] = SH.ki_korrektur("Rumpelstilzchen", "")

    steckbrief = (" Dieser Mensch schreibt erfahrungsgemäß diese Wörter falsch"
                  " — achte besonders darauf: halloch statt hallo.")
    raus["korrektur+steckbrief/Amt"] = SH.ki_korrektur("Amt", "", steckbrief)
    raus["korrektur+zettel+steckbrief/Amt"] = SH.ki_korrektur("Amt", zettel, steckbrief)

    for sprache in ("Englisch", "Türkisch"):
        raus["uebersetzung/" + sprache] = SH.ki_uebersetzung(sprache)
    return raus


def python_wahlen(SH):
    """Was die Erweiterung aus einer Einstellungsdatei liest.

    Gefragt wird das echte lies_einstellungen(), nicht ein Nachbau davon: Ein
    Nachbau ginge beim nächsten Umbau mit derselben Hand kaputt wie das
    Original und meldete trotzdem grün. Also bekommt die Datei einen anderen
    Ort, und die Fälle wandern als richtige Dateien hindurch.
    """
    ordner = tempfile.mkdtemp(prefix="schreibhilfe-vergleich-")
    echt = SH.EINSTELLUNGSDATEI
    faelle = {
        "leer": {},
        "neu": {"empfaenger": "Forum"},
        "alt-amt": {"tonfall": "Förmlich (Amt)"},
        "alt-freundlich": {"tonfall": "Freundlich"},
        "alt-kurz": {"tonfall": "Kurz und sachlich"},
        "alt-wie-geschrieben": {"tonfall": "Wie geschrieben"},
        "unbekannt": {"empfaenger": "Rumpelstilzchen"},
        "beides": {"empfaenger": "Bewerbung", "tonfall": "Förmlich (Amt)"},
    }
    raus = {}
    try:
        SH.EINSTELLUNGSDATEI = os.path.join(ordner, "einstellungen.json")
        for name, inhalt in faelle.items():
            with open(SH.EINSTELLUNGSDATEI, "w", encoding="utf-8") as datei:
                json.dump(inhalt, datei)
            raus[name] = SH.lies_einstellungen()["empfaenger"]
    finally:
        SH.EINSTELLUNGSDATEI = echt
        shutil.rmtree(ordner, ignore_errors=True)
    return raus


def javascript_seite():
    node = subprocess.run(["node", os.path.join(HIER, "anweisungen.js")],
                          capture_output=True, text=True)
    if node.returncode != 0:
        raise SystemExit("anweisungen.js lief nicht durch:\n" + node.stderr)
    return json.loads(node.stdout)


def zeige_unterschied(name, js, py):
    print("\n✗ %s" % name)
    # Wortweise statt zeilenweise: Die Anweisungen sind ein einziger langer
    # Absatz, ein Zeilenvergleich zeigte darin nur „alles anders".
    unterschied = difflib.unified_diff(js.split(" "), py.split(" "),
                                       "App (JavaScript)", "Erweiterung (Python)",
                                       lineterm="", n=4)
    for zeile in unterschied:
        print("   " + zeile)


def main():
    laut = "-v" in sys.argv
    SH = lade_erweiterung()

    js = javascript_seite()
    py = {"anweisungen": python_seite(SH), "wahlen": python_wahlen(SH)}

    fehler = 0
    for teil in ("anweisungen", "wahlen"):
        namen = sorted(set(js[teil]) | set(py[teil]))
        for name in namen:
            a, b = js[teil].get(name), py[teil].get(name)
            if a is None or b is None:
                print("\n✗ %s/%s steht nur auf einer Seite." % (teil, name))
                fehler += 1
                continue
            if a == b:
                if laut:
                    print("✓ %s/%s" % (teil, name))
                continue
            fehler += 1
            if teil == "wahlen":
                print("\n✗ wahlen/%s: App sagt %r, Erweiterung sagt %r"
                      % (name, a, b))
            else:
                zeige_unterschied(teil + "/" + name, a, b)

    gesamt = len(js["anweisungen"]) + len(js["wahlen"])
    if fehler:
        print("\n%d von %d Stellen weichen ab." % (fehler, gesamt))
        return 1
    print("%d von %d Anweisungen und Wahlen stimmen überein." % (gesamt, gesamt))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
