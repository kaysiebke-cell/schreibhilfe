#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Stellt die Python-Prüfung der JavaScript-Prüfung gegenüber.

Die Erweiterung für LibreOffice trägt eine Übersetzung der Prüfung aus
js/app.js. Eine Übersetzung ist nur so viel wert wie ihr Nachweis: Dieses
Programm schickt dieselben Sätze durch beide Fassungen und meldet jede
Abweichung.

    python3 vergleiche.py            # eingebaute Satzsammlung
    python3 vergleiche.py -v         # jeden Fund einzeln zeigen

Rückgabe 0, wenn beide Seiten in allem übereinstimmen.
"""

import json
import os
import subprocess
import sys

HIER = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HIER, 'schreibhilfe'))

import pruefung                                                    # noqa: E402

# Die Wörterliste des Projekts benutzen, nicht die des Systems — sonst
# vergliche man zwei verschiedene Wörterbücher statt zweier Fassungen.
pruefung.lade_woerter(os.path.join(HIER, '..', 'daten', 'woerter.txt'))

SAETZE = [
    # --- Wörter, die kein Rechtschreibprüfer findet ---
    "das ist garnicht richtig",
    "Ich lege wiederspruch ein.",
    "Das ist ein tip für dich.",
    "Ich schreibe dir eine email.",
    "Das weiss ich nicht so gross.",

    # --- Zusammengeschriebenes ---
    "Halloch ich hab das gar nicht gemacht heute.",
    "hallo werner ich hab dir nichtgeantwortet",
    "undich habe dasgar nicht gewusst",

    # --- Tippfehler, ein Buchstabe daneben ---
    "ich wolte dich fragen ob du kanst",
    "vieleicht schaffen wir es shcon diese woche",
    "Entschuldiung wegen dem Termien und dem Widerspuch",
    "Das ist unglaubich schwirig fur mich",

    # --- Zeichen und Abstände ---
    "Hallo  Welt , wie geht es dir ?",
    "Ich komme.Du auch?Wir sehen uns.",
    "Das ist ist doppelt gemoppelt",
    "Er hat zu viele Kommas,,gesetzt",
    "Das Auto von Peter's Vater",

    # --- Groß- und Kleinschreibung ---
    "das ist ein satz. und das ist noch einer.",
    "beim schreiben hilft das programm",
    "beim ersten mal ging es schief",

    # --- das/dass, seit/seid ---
    "ich glaube das er kommt",
    "Ich denke das sie recht hat.",
    "Es ist wichtig das du kommst.",
    "seid gestern warte ich",
    "seit ihr schon da",
    "ihr seit die besten",
    "seit ruhig ihr zwei",
    "Das ist größer wie das andere.",
    "Er ist besser als wie ich.",

    # --- Kommas vor Nebensätzen ---
    "Ich frage ob du Zeit hast",
    "Ich komme weil ich muss",
    "Ich bin sicher obwohl es schwer ist",
    "Ich warte damit du kommst",
    "Ich gehe aber du bleibst",
    "Ich komme und du auch",

    # --- Zeitwort und Fürwort ---
    "ich bist müde",
    "du bin hier",
    "wir ist fertig",
    "er sind da",
    "hat ich das gesagt",

    # --- Satzende und Satzbau ---
    "Ich schreibe dir heute einen kurzen Brief",
    "Das ist ein sehr langer Satz und er hat viele Bindewörter und dann kommt noch mehr und weil das so ist wird er lang",
    "Er sagte (ohne Klammer zu schließen",
    'Er sagte "ohne Ende',

    # --- Nichts zu meckern ---
    "Sehr geehrte Damen und Herren, ich bitte Sie um eine Rückmeldung.",
    "Die Haustür ist repariert, der Fußballverein hat abgesagt.",
    "Das Arbeitsamt hat sich seit gestern nicht gemeldet.",
    "",
    "   ",

    # --- Adressen und Abkürzungen in Ruhe lassen ---
    "Schreib mir an test@example.de oder auf www.beispiel.de",
    "Das kostet ca. 10 Euro bzw. etwas mehr.",
    "Herr Dr. Meier hat angerufen.",

    # --- Mehrere Absätze ---
    "Erster Absatz mit fehler.\nZweiter absatz auch.",

    # --- Der lange Testtext aus der App ---
    "hallo werner ich hab dir gestern geschriben aber du hast nichtgeantwortet . "
    "ich wolte fragen ob du morgen zeit hast , wir könten uns treffen und dasgar "
    "besprechen was seid gestern offen ist . ich bin mir garnicht sicher ob das das "
    "richtige ist , aber ich denke wir kriegen das hin . melde dich bitte kurz , "
    "dann weis ich bescheid . vieleicht schaffen wir es ja shcon diese woche",
]

# Auch mit Gedächtnis prüfen — die Ruhe-Liste und eigene Schreibweisen greifen
# in beiden Fassungen an derselben Stelle.
GEDAECHTNIS = {
    "woerter": {"halloch": "Hallo", "vileicht": "vielleicht"},
    "inRuhe": {"siebkee": True},
}

FAELLE = ([{"text": s, "gelernt": {"woerter": {}, "inRuhe": {}}} for s in SAETZE]
          + [{"text": s, "gelernt": GEDAECHTNIS} for s in [
              "Halloch, ich hab vileicht was vergessen.",
              "Der Bescheid kam von Frau Siebkee gestern an.",
          ]])


def js_seite(faelle):
    eingabe = "\n".join(json.dumps(f, ensure_ascii=False) for f in faelle) + "\n"
    lauf = subprocess.run(
        ["node", os.path.join(HIER, "vergleiche.js")],
        input=eingabe, capture_output=True, text=True)
    if lauf.returncode != 0:
        print("Die JavaScript-Seite lief nicht:\n" + lauf.stderr)
        sys.exit(2)
    return [json.loads(z) for z in lauf.stdout.strip().split("\n") if z]


def py_seite(faelle):
    aus = []
    for fall in faelle:
        funde = pruefung.finde_probleme(fall["text"], fall["gelernt"])
        aus.append([{k: f[k] for k in ("von", "bis", "alt", "neu", "grund", "art")}
                    for f in funde])
    return aus


def main():
    ausfuehrlich = "-v" in sys.argv
    js = js_seite(FAELLE)
    py = py_seite(FAELLE)

    gleich = abweichend = 0
    for fall, a, b in zip(FAELLE, js, py):
        if a == b:
            gleich += 1
            if ausfuehrlich:
                print("  ok   %-58s %d Funde" % (kurz(fall["text"]), len(a)))
            continue
        abweichend += 1
        print("\nABWEICHUNG bei: %s" % kurz(fall["text"], 70))
        nur_js = [f for f in a if f not in b]
        nur_py = [f for f in b if f not in a]
        for f in nur_js:
            print("   nur JavaScript: %s → %s   (%s)" % (f["alt"], f["neu"], f["grund"]))
        for f in nur_py:
            print("   nur Python:     %s → %s   (%s)" % (f["alt"], f["neu"], f["grund"]))

    print("\n%d von %d Sätzen stimmen überein." % (gleich, len(FAELLE)))
    return 0 if abweichend == 0 else 1


def kurz(text, breite=54):
    einzeilig = text.replace("\n", "⏎")
    return einzeilig[:breite] + ("…" if len(einzeilig) > breite else "")


if __name__ == "__main__":
    sys.exit(main())
