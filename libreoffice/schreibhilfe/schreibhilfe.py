# -*- coding: utf-8 -*-
"""
Schreibhilfe für LibreOffice Writer.

Dieselbe Hilfe wie die Handy-App, nur im Schreibprogramm: Text markieren,
Menü „Schreibhilfe“, fertig. Die KI-Anweisungen sind Wort für Wort dieselben
wie in js/app.js — was am Handy gilt, gilt hier auch.

Aufbau: LibreOffice schickt beim Menüklick einen Befehl los
(„de.schreibhilfe.befehl:korrigieren“). Diese Datei meldet eine Komponente an,
die solche Befehle entgegennimmt (XDispatchProvider/XDispatch) und dann auf dem
Dokument arbeitet.

Was hier NICHT liegt: der API-Schlüssel im Dokument. Er steht in
~/.config/schreibhilfe/einstellungen.json, damit er nicht mit dem Brief
verschickt wird.
"""

import json
import os
import re
import ssl
import sys
import traceback
import urllib.error
import urllib.request

import unohelper
from com.sun.star.frame import XDispatchProvider, XDispatch
from com.sun.star.lang import XServiceInfo, XInitialization
from com.sun.star.awt import XActionListener

# Die Prüfung ohne Internet liegt daneben. Fehlt sie, bleibt die Erweiterung
# arbeitsfähig — dann eben nur mit den KI-Wegen.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    import pruefung
except ImportError:                                              # pragma: no cover
    pruefung = None

BEFEHLSRAUM = "de.schreibhilfe.befehl:"
UMSETZUNG = "de.schreibhilfe.Handler"
DIENSTE = ("com.sun.star.frame.ProtocolHandler",)

EINSTELLUNGSORDNER = os.path.expanduser("~/.config/schreibhilfe")
EINSTELLUNGSDATEI = os.path.join(EINSTELLUNGSORDNER, "einstellungen.json")

# Schriftgrößen im Prüfen-Fenster. Die erste Fassung stand auf 8 und 7 —
# lesbar für jemanden mit guten Augen, unbrauchbar für den, für den die App
# gebaut ist.
SCHRIFT_WORT = 11
SCHRIFT_GRUND = 9
# Breite eines Zeichens der Festbreitenschrift, in Dialogeinheiten. Ein Dialog
# rechnet nicht in Pixeln, und die Breite eines Textfelds muss vorher
# feststehen — bei fester Zeichenbreite lässt sie sich wenigstens abschätzen.
ZEICHENBREITE = 5.2

MODELLE = ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"]
SPRACHEN = ["Englisch", "Deutsch", "Türkisch", "Russisch", "Ukrainisch",
            "Polnisch", "Rumänisch", "Arabisch", "Französisch", "Spanisch",
            "Italienisch", "Griechisch", "Niederländisch", "Portugiesisch"]

# --------------------------------------------------------------------------
# Die Anweisungen an die KI — gleichlautend mit der Handy-App.
# --------------------------------------------------------------------------

TONFAELLE = {
    "Wie geschrieben":
        "Lass den Tonfall genau so, wie er im Text steht: Förmliches bleibt "
        "förmlich, Lockeres bleibt locker. Ändere die Wortwahl nur da, wo sie "
        "falsch ist.",
    "Förmlich (Amt)":
        "Halte den Tonfall durchgehend förmlich und höflich, wie in einem "
        "Schreiben an eine Behörde: Siezen, vollständige Sätze, keine "
        "Umgangssprache und keine Abkürzungen mitten im Satz. Sachlich bleiben "
        "auch dort, wo der Text ärgerlich klingt — der Vorwurf darf inhaltlich "
        "stehen bleiben, aber im ruhigen Ton.",
    "Freundlich":
        "Halte den Tonfall freundlich und zugewandt, wie in einer Nachricht an "
        "jemanden, den man kennt. Nicht flapsig und nicht anbiedernd.",
    "Kurz und sachlich":
        "Halte den Tonfall knapp und sachlich: kurze Sätze, keine Füllwörter, "
        "keine Ausschmückungen. Der Inhalt bleibt dabei vollständig.",
}
TONFALL_STANDARD = "Wie geschrieben"


def ki_korrektur(tonfall, steckbrief=""):
    return (
        "Du bist eine Schreibhilfe für einen Menschen mit Legasthenie. "
        "Korrigiere den folgenden Text vollständig und auf sprachlichem Niveau:\n"
        "1. Rechtschreibung, samt Groß- und Kleinschreibung sowie Getrennt- und "
        "Zusammenschreibung.\n"
        "2. Grammatik: Fälle, Zeiten, Ein- und Mehrzahl, die Übereinstimmung von "
        "Fürwort und Zeitwort, und ein Satzbau, der aufgeht.\n"
        "3. Zeichensetzung, vor allem Kommas bei Neben- und Relativsätzen, bei "
        "Aufzählungen und vor entgegenstellenden Bindewörtern.\n"
        "Achte besonders auf Verwechslungen, die eine Rechtschreibprüfung nicht "
        "finden kann, weil beide Wörter existieren: das/dass, seit/seid, "
        "wider/wieder, wie/als, Ihnen/ihnen, End-/Ent-. Entscheide nach dem Sinn "
        "des Satzes. "
        "Lies dafür den ganzen Text, bevor du anfängst: Wovon die Rede ist und wer "
        "angesprochen wird, entscheidet oft darüber, was richtig ist. "
        + TONFAELLE.get(tonfall, TONFAELLE[TONFALL_STANDARD]) + steckbrief + " "
        "Ändere nichts am Inhalt, erfinde nichts dazu und lasse nichts weg. "
        "Absätze und Zeilenumbrüche bleiben, wie sie sind. "
        "Der Text kann in jeder Sprache stehen; antworte in der Sprache des Textes. "
        "Antworte ausschließlich mit dem korrigierten Text: keine Erklärung, keine "
        "Anführungszeichen, keine Vorrede."
    )


KI_VORSCHLAEGE = (
    "Du bist eine Schreibhilfe für einen Menschen mit Legasthenie. Suche im "
    "folgenden Text die Sätze, die schwer zu lesen oder umständlich sind, und "
    "schlage für jeden eine klarere Fassung vor. "
    "Regeln: Ändere nichts am Inhalt und erfinde nichts dazu. Behalte den "
    "Tonfall — ein Brief ans Amt bleibt förmlich, eine Nachricht an einen Freund "
    "bleibt locker. Benutze einfache, gebräuchliche Wörter und kurze Sätze. "
    "Der Text kann in jeder Sprache stehen. \"neu\" bleibt in der Sprache des "
    "Textes, \"grund\" schreibst du immer auf Deutsch. "
    "Nimm höchstens sechs Sätze, nur die, bei denen es wirklich hilft; ist der "
    "Text schon gut, nimm weniger oder keinen. "
    "\"alt\" ist der Satz zeichengenau aus dem Text — nicht kürzen, nicht "
    "glätten, nichts hinzufügen; er muss sich Zeichen für Zeichen im Text "
    "wiederfinden. \"neu\" ist die klarere Fassung, \"grund\" sagt in höchstens "
    "acht Wörtern, warum das leichter ist. "
    "Gibt es nichts zu verbessern, bleibt die Liste leer."
)

VORSCHLAG_BAUPLAN = {
    "type": "object",
    "properties": {
        "vorschlaege": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "alt": {"type": "string"},
                    "neu": {"type": "string"},
                    "grund": {"type": "string"},
                },
                "required": ["alt", "neu", "grund"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["vorschlaege"],
    "additionalProperties": False,
}


def ki_uebersetzung(sprache):
    return (
        "Übersetze den folgenden Text nach " + sprache + ". "
        "Behalte Tonfall und Anrede bei: Ein Brief bleibt ein Brief, eine "
        "Nachricht an einen Freund bleibt locker. Übersetze sinngemäß und "
        "natürlich, nicht Wort für Wort. Ist der Text schon auf " + sprache + ", "
        "gib ihn unverändert zurück. Antworte ausschließlich mit der "
        "Übersetzung: keine Erklärung, keine Anführungszeichen, keine Vorrede."
    )


# --------------------------------------------------------------------------
# Einstellungen und Gedächtnis — dieselbe Form wie in der Handy-App, damit der
# Sicherungs-Text von dort hier hineinpasst.
# --------------------------------------------------------------------------

STANDARD = {
    "apiKey": "",
    "modell": "claude-opus-5",
    "tonfall": TONFALL_STANDARD,
    "sprache": "Englisch",
    "gelernt": {"woerter": {}, "inRuhe": {}},
}


def lies_einstellungen():
    werte = dict(STANDARD)
    werte["gelernt"] = {"woerter": {}, "inRuhe": {}}
    try:
        with open(EINSTELLUNGSDATEI, "r", encoding="utf-8") as datei:
            gespeichert = json.load(datei)
        for name in ("apiKey", "modell", "tonfall", "sprache"):
            if isinstance(gespeichert.get(name), str):
                werte[name] = gespeichert[name]
        gelernt = gespeichert.get("gelernt") or {}
        if isinstance(gelernt.get("woerter"), dict):
            werte["gelernt"]["woerter"] = gelernt["woerter"]
        if isinstance(gelernt.get("inRuhe"), dict):
            werte["gelernt"]["inRuhe"] = gelernt["inRuhe"]
    except (OSError, ValueError):
        pass
    return werte


def schreib_einstellungen(werte):
    os.makedirs(EINSTELLUNGSORDNER, exist_ok=True)
    with open(EINSTELLUNGSDATEI, "w", encoding="utf-8") as datei:
        json.dump(werte, datei, ensure_ascii=False, indent=1)
    # Der Schlüssel steht da drin — niemand sonst muss ihn lesen können.
    try:
        os.chmod(EINSTELLUNGSDATEI, 0o600)
    except OSError:
        pass


GELERNTES_WORT = re.compile(r"^[a-zäöüß-]{1,40}$")
SICHERUNG_GRENZE = 2000


def merke_aenderung(fund, werte):
    """Lernt aus einer angenommenen Änderung — dieselbe Regel wie am Handy.

    Gelernt wird nur, was der Mensch selbst NICHT richtig geschrieben hat:
    Steht „alt“ im deutschen Wörterbuch, hängt die Korrektur am Satz und nicht
    am Wort. „wir“ → „wird“ mag hier stimmen und wäre drei Sätze später falsch.
    """
    if not fund.get("wortEbene"):
        return False
    alt, neu = fund.get("alt", ""), fund.get("neu", "")
    if not re.match(r"^[A-Za-zÄÖÜäöüß-]+$", alt) or not neu.strip() or neu != neu.strip():
        return False
    wort = alt.lower()
    if pruefung and wort in pruefung.lade_woerter():
        return False
    werte["gelernt"]["woerter"][wort] = neu
    werte["gelernt"]["inRuhe"].pop(wort, None)
    return True


def spiele_sicherung_ein(roh, werte):
    """Nimmt den Sicherungs-Text aus der Handy-App auf. Alles Ankommende ist
    ungeprüft, deshalb wird jeder Eintrag einzeln angesehen."""
    try:
        daten = json.loads(roh.strip())
    except ValueError:
        return None, "Das war kein Sicherungs-Text."
    if not isinstance(daten, dict) or daten.get("schreibhilfe") != 1:
        return None, "Das ist kein Sicherungs-Text der Schreibhilfe."

    woerter = werte["gelernt"]["woerter"]
    ruhe = werte["gelernt"]["inRuhe"]
    neu_w = neu_r = 0

    for falsch, richtig in (daten.get("woerter") or {}).items():
        if len(woerter) >= SICHERUNG_GRENZE:
            break
        if not isinstance(falsch, str) or not GELERNTES_WORT.match(falsch):
            continue
        if not isinstance(richtig, str) or not richtig.strip() or len(richtig) > 60:
            continue
        if woerter.get(falsch) != richtig:
            neu_w += 1
        woerter[falsch] = richtig

    for wort in (daten.get("inRuhe") or {}):
        if len(ruhe) >= SICHERUNG_GRENZE:
            break
        if not isinstance(wort, str) or not GELERNTES_WORT.match(wort):
            continue
        if not ruhe.get(wort):
            neu_r += 1
        ruhe[wort] = True

    einst = daten.get("einstellungen") or {}
    for name in ("tonfall", "modell", "sprache"):
        if isinstance(einst.get(name), str):
            werte[name] = einst[name]

    return (neu_w, neu_r), None


def steckbrief(werte):
    """Was die App über diesen Menschen weiß — geht als ein Satz mit."""
    woerter = list(werte["gelernt"]["woerter"].items())[-12:]
    ruhe = list(werte["gelernt"]["inRuhe"].keys())[:12]
    teile = []
    if woerter:
        teile.append(
            "Dieser Mensch schreibt erfahrungsgemäß diese Wörter falsch — achte "
            "besonders darauf: "
            + ", ".join("%s statt %s" % (f, r) for f, r in woerter) + ".")
    if ruhe:
        teile.append("Diese Wörter sind so gewollt und bleiben unangetastet: "
                     + ", ".join(ruhe) + ".")
    return (" " + " ".join(teile)) if teile else ""


# --------------------------------------------------------------------------
# Die Anfrage an die KI
# --------------------------------------------------------------------------

def frage_ki(anweisung, text, werte, bauplan=None):
    """Gibt (ergebnis, fehler) zurück — genau einer von beiden ist gesetzt."""
    if not werte["apiKey"]:
        return None, ("Es ist kein API-Schlüssel hinterlegt.\n\n"
                      "Menü „Schreibhilfe“ → „Einstellungen …“")

    modell = werte["modell"]
    anfrage = {
        "model": modell,
        "max_tokens": 16000,
        "system": anweisung,
        "messages": [{"role": "user", "content": text}],
    }
    ausgabe = {}
    if modell != "claude-haiku-4-5":
        ausgabe["effort"] = "low"
        anfrage["thinking"] = {"type": "adaptive"}
    if bauplan:
        ausgabe["format"] = {"type": "json_schema", "schema": bauplan}
    if ausgabe:
        anfrage["output_config"] = ausgabe

    bitte = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(anfrage).encode("utf-8"),
        headers={
            "content-type": "application/json",
            "x-api-key": werte["apiKey"],
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(bitte, timeout=180,
                                    context=ssl.create_default_context()) as antwort:
            daten = json.loads(antwort.read().decode("utf-8"))
    except urllib.error.HTTPError as fehler:
        rumpf = ""
        try:
            rumpf = json.loads(fehler.read().decode("utf-8")).get("error", {}).get("message", "")
        except Exception:
            pass
        if "credit balance" in rumpf.lower():
            return None, "Das Guthaben ist aufgebraucht."
        if fehler.code == 401:
            return None, ("Der Schlüssel wird abgelehnt. Bitte in den "
                          "Einstellungen prüfen.")
        return None, "Fehler %s%s" % (fehler.code, (" (" + rumpf + ")") if rumpf else "")
    except urllib.error.URLError as fehler:
        return None, "Keine Verbindung: %s" % (fehler.reason,)
    except Exception as fehler:                      # noqa: BLE001
        return None, "Es hat nicht geklappt: %s" % (fehler,)

    if daten.get("stop_reason") == "refusal":
        return None, "Die KI wollte diesen Text nicht bearbeiten."

    stuecke = [b.get("text", "") for b in daten.get("content", [])
               if b.get("type") == "text"]
    ergebnis = "".join(stuecke).strip()
    return (ergebnis, None) if ergebnis else (None, "Es kam keine Antwort zurück.")


def lies_liste(antwort):
    """Die Antwort folgt dem Bauplan: ein Objekt mit dem Feld „vorschlaege“."""
    roh = (antwort or "").strip()
    for versuch in (roh, _ausschneiden(roh, "{", "}"), _ausschneiden(roh, "[", "]")):
        if not versuch:
            continue
        try:
            daten = json.loads(versuch)
        except ValueError:
            continue
        if isinstance(daten, dict) and isinstance(daten.get("vorschlaege"), list):
            return daten["vorschlaege"]
        if isinstance(daten, list):
            return daten
    return None


def _ausschneiden(text, auf, zu):
    von, bis = text.find(auf), text.rfind(zu)
    return text[von:bis + 1] if von != -1 and bis > von else ""


# --------------------------------------------------------------------------
# Kleine Helfer für die Oberfläche
# --------------------------------------------------------------------------

class _Knopfdruck(unohelper.Base, XActionListener):
    """Merkt sich, welcher Knopf gedrückt wurde, und schließt das Fenster.

    Nötig, weil sechs Knöpfe unterschieden werden müssen — die eingebauten
    Sorten OK und Abbrechen liefern nur ein Ja oder Nein zurück.
    """

    def __init__(self, fenster):
        self.fenster = fenster
        self.name = None

    def actionPerformed(self, ereignis):
        self.name = ereignis.Source.getModel().Name
        self.fenster.endExecute()

    def disposing(self, ereignis):
        pass


class Oberflaeche(object):
    def __init__(self, ctx, rahmen):
        self.ctx = ctx
        self.rahmen = rahmen

    def _dienst(self, name, *args):
        holer = self.ctx.ServiceManager
        if args:
            return holer.createInstanceWithArgumentsAndContext(name, args, self.ctx)
        return holer.createInstanceWithContext(name, self.ctx)

    def _fenster(self):
        return self.rahmen.getContainerWindow()

    def melde(self, titel, text, art="infobox"):
        from com.sun.star.awt.MessageBoxButtons import BUTTONS_OK
        werkzeug = self._dienst("com.sun.star.awt.Toolkit")
        kasten = werkzeug.createMessageBox(
            self._fenster(), art, BUTTONS_OK, titel, text)
        kasten.execute()
        kasten.dispose()

    def frage_ja_nein(self, titel, text):
        from com.sun.star.awt.MessageBoxButtons import BUTTONS_YES_NO
        werkzeug = self._dienst("com.sun.star.awt.Toolkit")
        kasten = werkzeug.createMessageBox(
            self._fenster(), "querybox", BUTTONS_YES_NO, titel, text)
        antwort = kasten.execute()
        kasten.dispose()
        return antwort == 2      # 2 = Ja

    def frage_text(self, titel, beschriftung, vorgabe="", mehrzeilig=False):
        """Ein Eingabefenster. Gibt None zurück, wenn abgebrochen wurde."""
        felder = [(beschriftung, vorgabe, "text")]
        ergebnis = self.frage_mehreres(titel, felder, mehrzeilig=mehrzeilig)
        return None if ergebnis is None else ergebnis[0]

    # ----------------------------------------------------------------
    # Die Farben der App — so weit LibreOffice sie hergibt.
    #
    # Genau wird es nicht: Ein Dialog ist kein Browser, es gibt kein CSS und
    # keine abgerundeten Kästen. Wiedererkennbar schon: farbiger Balken links,
    # das Alte rot und durchgestrichen, das Neue grün, die Begründung klein
    # und blass darunter.
    # ----------------------------------------------------------------
    # Zwei Paletten wie in der App. Beide sind aber bewusst so gewählt, dass
    # sie auch auf dem jeweils anderen Grund noch lesbar bleiben: Die Erkennung
    # unten stützt sich auf das Fenster, und wenn LibreOffice sein Aussehen vom
    # Systemthema bezieht, kann sie danebenliegen. Ein zu dunkles Blau auf
    # dunklem Grund wäre unlesbar — deshalb sind „tipp“ und „blass“ in der
    # hellen Palette etwas aufgehellt gegenüber der App.
    FARBEN_HELL = {"fehler": 0xC08A2E, "tipp": 0x3D6C82, "alt": 0xB04A3D,
                   "neu": 0x4B7B5D, "blass": 0x6B7480}
    FARBEN_DUNKEL = {"fehler": 0xD7A24E, "tipp": 0x6AA3BD, "alt": 0xE0837A,
                     "neu": 0x74B98D, "blass": 0x9AA2AC}

    def farben(self):
        """Hell oder dunkel — richtet sich nach dem Fenster, nicht nach Glück.

        Die App hat dafür eine Umschaltung; hier entscheidet die Helligkeit des
        Dialoghintergrunds. Lässt sie sich nicht auslesen, wird die dunkle
        Palette genommen: Ihre Farben sind heller und stehen auch auf hellem
        Grund noch lesbar da — umgekehrt gilt das nicht.
        """
        try:
            grund = self._fenster().StyleSettings.DialogColor
            rot, gruen, blau = (grund >> 16) & 255, (grund >> 8) & 255, grund & 255
            hell = (rot * 299 + gruen * 587 + blau * 114) / 1000 > 128
            return self.FARBEN_HELL if hell else self.FARBEN_DUNKEL
        except Exception:                                        # noqa: BLE001
            return self.FARBEN_DUNKEL

    def _zeichne_fund(self, dialog, nr, fund, rand, y, breite, angehakt):
        """Eine Zeile: Balken, Kästchen, alt → neu, Begründung."""
        farbe = self.farben()
        mono = "DejaVu Sans Mono"

        def feld(name, art, x, w, h, **werte):
            teil = dialog.createInstance("com.sun.star.awt.UnoControl%sModel" % art)
            teil.PositionX, teil.PositionY = x, y
            teil.Width, teil.Height = w, h
            for schluessel, wert in werte.items():
                setattr(teil, schluessel, wert)
            dialog.insertByName("%s%d" % (name, nr), teil)
            return teil

        # Der farbige Balken links — orange heißt sicher falsch, blau heißt
        # „kommt auf den Zusammenhang an“. Genau wie in der App.
        balken = dialog.createInstance("com.sun.star.awt.UnoControlFixedTextModel")
        balken.PositionX, balken.PositionY = rand, y
        balken.Width, balken.Height = 3, 25
        balken.Label = ""
        balken.BackgroundColor = farbe["fehler"] if fund["art"] == "fehler" else farbe["tipp"]
        dialog.insertByName("balken%d" % nr, balken)

        kaestchen = dialog.createInstance("com.sun.star.awt.UnoControlCheckBoxModel")
        kaestchen.PositionX, kaestchen.PositionY = rand + 6, y
        kaestchen.Width, kaestchen.Height = 12, 13
        kaestchen.Label = ""
        kaestchen.State = 1 if angehakt else 0
        dialog.insertByName("haken%d" % nr, kaestchen)

        # Die Wortspalte richtet sich nach dem längsten Wort der Seite, statt
        # die Breite stur zu halbieren. Vorher klaffte zwischen „kanst“ und dem
        # Pfeil eine halbe Fensterbreite Leere.
        spalte = breite - rand * 2 - 22
        w_alt = max(24, min(int(fund["breite_alt"] * ZEICHENBREITE) + 6, spalte // 2))
        x_alt = rand + 20

        feld("alt", "FixedText", x_alt, w_alt, 13,
             Label=kuerze(fund["alt_zeige"], 30), TextColor=farbe["alt"],
             FontStrikeout=1, FontName=mono, FontHeight=SCHRIFT_WORT)
        feld("pfeil", "FixedText", x_alt + w_alt + 2, 10, 13,
             Label="→", TextColor=farbe["blass"], FontHeight=SCHRIFT_WORT)
        feld("neu", "FixedText", x_alt + w_alt + 14, spalte - w_alt - 14, 13,
             Label=kuerze(fund["neu_zeige"], 30), TextColor=farbe["neu"],
             FontWeight=150, FontName=mono, FontHeight=SCHRIFT_WORT)

        grund = dialog.createInstance("com.sun.star.awt.UnoControlFixedTextModel")
        grund.PositionX, grund.PositionY = x_alt, y + 14
        grund.Width, grund.Height = breite - rand * 2 - 22, 11
        grund.Label = kuerze(fund["grund"], 70)
        grund.TextColor = farbe["blass"]
        grund.FontHeight = SCHRIFT_GRUND
        dialog.insertByName("grund%d" % nr, grund)

    def frage_haken(self, titel, kopfzeile, eintraege, pro_seite=8):
        """Legt die Funde als Liste mit echten Häkchen vor.

        Vorher war das eine Mehrfachauswahl: alles blau markiert, kein Häkchen
        weit und breit — man sah der Fläche nicht an, dass man etwas abwählen
        kann. Jetzt steht vor jeder Zeile ein Kästchen, das man anklickt.

        „eintraege“ ist eine Liste von Funden mit den Feldern
        alt_zeige, neu_zeige, grund und art.
        Passt nicht alles auf eine Seite, wird geblättert; die Haken bleiben
        dabei erhalten. Rückgabe: Liste der angehakten Nummern, oder None bei
        Abbruch.
        """
        angehakt = [True] * len(eintraege)
        seiten = max(1, (len(eintraege) + pro_seite - 1) // pro_seite)
        seite = 0

        while True:
            von = seite * pro_seite
            dieseSeite = eintraege[von:von + pro_seite]

            breite, rand, zeile = 360, 10, 29
            hoch = rand + 14 + len(dieseSeite) * zeile + 10
            dialog = self._dienst("com.sun.star.awt.UnoControlDialogModel")
            dialog.Width, dialog.Height = breite, hoch + 26
            dialog.Title = titel
            dialog.PositionX, dialog.PositionY = 60, 40

            kopf = dialog.createInstance("com.sun.star.awt.UnoControlFixedTextModel")
            kopf.PositionX, kopf.PositionY = rand, rand
            kopf.Width, kopf.Height = breite - rand * 2, 10
            kopf.Label = kopfzeile + ("" if seiten == 1
                                      else "   (Seite %d von %d)" % (seite + 1, seiten))
            dialog.insertByName("kopf", kopf)

            # Alle Wortspalten dieser Seite gleich breit: nach dem längsten
            # Wort. Sonst stünden die Pfeile treppenförmig versetzt.
            laengstes = max([len(e["alt_zeige"]) for e in dieseSeite] or [0])
            y = rand + 16
            for nr, eintrag in enumerate(dieseSeite):
                eintrag["breite_alt"] = laengstes
                self._zeichne_fund(dialog, nr, eintrag, rand, y, breite,
                                   angehakt[von + nr])
                y += zeile

            knoepfe = [("alle", "Alle", rand), ("keine", "Keine", rand + 42)]
            if seiten > 1:
                knoepfe += [("zurueck", "‹", breite - rand - 172),
                            ("weiter", "›", breite - rand - 148)]
            knoepfe += [("ok", "Ändern", breite - rand - 124),
                        ("abbruch", "Abbrechen", breite - rand - 60)]

            for name, text, x in knoepfe:
                knopf = dialog.createInstance("com.sun.star.awt.UnoControlButtonModel")
                knopf.PositionX, knopf.PositionY = x, hoch + 4
                knopf.Width, knopf.Height = (20 if text in ("‹", "›") else
                                             (38 if text in ("Alle", "Keine") else 60)), 14
                knopf.Label = text
                knopf.PushButtonType = 0          # selbst auswerten, nicht OK/Abbruch
                dialog.insertByName(name, knopf)

            fenster = self._dienst("com.sun.star.awt.UnoControlDialog")
            fenster.setModel(dialog)
            fenster.createPeer(self._dienst("com.sun.star.awt.Toolkit"), None)

            horcher = _Knopfdruck(fenster)
            for name, _t, _x in knoepfe:
                fenster.getControl(name).addActionListener(horcher)
            fenster.execute()

            # Haken dieser Seite sichern, bevor das Fenster verschwindet
            for nr in range(len(dieseSeite)):
                angehakt[von + nr] = fenster.getControl("haken%d" % nr).getState() == 1
            gedrueckt = horcher.name
            fenster.dispose()

            if gedrueckt == "abbruch" or gedrueckt is None:
                return None
            if gedrueckt == "ok":
                return [i for i, an in enumerate(angehakt) if an]
            if gedrueckt in ("alle", "keine"):
                for nr in range(len(dieseSeite)):
                    angehakt[von + nr] = (gedrueckt == "alle")
            elif gedrueckt == "weiter":
                seite = (seite + 1) % seiten
            elif gedrueckt == "zurueck":
                seite = (seite - 1) % seiten

    def frage_mehreres(self, titel, felder, mehrzeilig=False):
        """felder: Liste aus (Beschriftung, Vorgabe, Art) — Art ist „text“,
        „passwort“ oder eine Liste zur Auswahl."""
        dialog = self._dienst("com.sun.star.awt.UnoControlDialogModel")
        breite, rand, zeile = 260, 8, 30
        dialog.Width = breite
        dialog.Height = rand * 2 + zeile * len(felder) + 22 + (60 if mehrzeilig else 0)
        dialog.Title = titel
        dialog.PositionX, dialog.PositionY = 100, 100

        eingaben = []
        y = rand
        for nr, (beschriftung, vorgabe, art) in enumerate(felder):
            marke = dialog.createInstance("com.sun.star.awt.UnoControlFixedTextModel")
            marke.PositionX, marke.PositionY = rand, y
            marke.Width, marke.Height = breite - rand * 2, 10
            marke.Label = beschriftung
            dialog.insertByName("marke%d" % nr, marke)

            hoch = 12 + (60 if mehrzeilig else 0)
            if isinstance(art, (list, tuple)):
                feld = dialog.createInstance("com.sun.star.awt.UnoControlListBoxModel")
                feld.Dropdown = True
                feld.StringItemList = tuple(art)
                if vorgabe in art:
                    feld.SelectedItems = (art.index(vorgabe),)
            else:
                feld = dialog.createInstance("com.sun.star.awt.UnoControlEditModel")
                feld.Text = vorgabe
                if art == "passwort":
                    feld.EchoChar = ord("*")
                if mehrzeilig:
                    feld.MultiLine = True
                    feld.VScroll = True
            feld.PositionX, feld.PositionY = rand, y + 12
            feld.Width, feld.Height = breite - rand * 2, hoch
            name = "feld%d" % nr
            dialog.insertByName(name, feld)
            eingaben.append((name, art))
            y += zeile + (60 if mehrzeilig else 0)

        for name, beschriftung, x, art in (
                ("ok", "OK", breite - rand - 110, 1),
                ("abbruch", "Abbrechen", breite - rand - 54, 0)):
            knopf = dialog.createInstance("com.sun.star.awt.UnoControlButtonModel")
            knopf.PositionX, knopf.PositionY = x, y
            knopf.Width, knopf.Height = 52, 14
            knopf.Label = beschriftung
            knopf.PushButtonType = art          # 1 = OK, 0 = Standard/Abbrechen
            if art == 0:
                knopf.PushButtonType = 2        # 2 = Abbrechen
            dialog.insertByName(name, knopf)

        fenster = self._dienst("com.sun.star.awt.UnoControlDialog")
        fenster.setModel(dialog)
        fenster.createPeer(self._dienst("com.sun.star.awt.Toolkit"), None)
        genommen = fenster.execute()

        werte = None
        if genommen == 1:
            werte = []
            for name, art in eingaben:
                steuer = fenster.getControl(name)
                if isinstance(art, (list, tuple)):
                    ausgewaehlt = steuer.getSelectedItem()
                    werte.append(ausgewaehlt)
                else:
                    werte.append(steuer.getModel().Text)
        fenster.dispose()
        return werte


# --------------------------------------------------------------------------
# Die Arbeit am Dokument
# --------------------------------------------------------------------------

def kuerze(text, hoechstens):
    """Schneidet lange Stellen ab. Ein Dialogfeld hat feste Breite; was nicht
    hineinpasst, würde sonst stumm abgeschnitten und sähe aus wie ein Fehler."""
    text = (text or "").replace("\n", "⏎")
    return text if len(text) <= hoechstens else text[:hoechstens - 1] + "…"


def zeige_stelle(stueck):
    """Macht eine Textstelle lesbar — auch wenn sie nur aus Leerraum besteht.

    Ein Fund wie „zwei Leerzeichen werden eins“ sähe sonst aus wie „ wird zu “:
    Man sieht nichts und versteht nichts. Darum werden unsichtbare Zeichen
    sichtbar gemacht, aber nur dort, wo es sonst leer aussähe.
    """
    def sichtbar(s):
        return s.replace(" ", "␣").replace("\t", "⇥").replace("\n", "⏎")

    if stueck == "":
        return "nichts"
    if stueck.strip() == "":
        return sichtbar(stueck)

    # Leerraum am Rand zeigen, innen nicht: „seid “ und „ ,“ sähen sonst aus
    # wie „seid“ und „,“ — man sähe dem Fund seinen Sinn nicht an. Innerhalb
    # des Wortes stören die Zeichen dagegen nur beim Lesen.
    kopf = len(stueck) - len(stueck.lstrip())
    fuss = len(stueck) - len(stueck.rstrip())
    mitte = stueck[kopf:len(stueck) - fuss]
    # Ohne Anführungszeichen: In der App trennt die Farbe das Alte vom
    # Neuen, nicht die Zeichensetzung. Hier ist es genauso.
    return (sichtbar(stueck[:kopf]) + mitte.replace("\n", "⏎")
            + sichtbar(stueck[len(stueck) - fuss:]))


def waehle_funde(gui, funde):
    """Legt alle Funde als Kästen vor — angehakt wird geändert.

    Nachgebaut nach den Kästen der App: farbiger Balken links, das Alte rot
    und durchgestrichen, das Neue grün, die Begründung klein darunter. Ein
    Fenster statt zwanzig Rückfragen.

    Rückgabe: die angehakten Funde, oder None bei Abbruch.
    """
    eintraege = [{
        "alt_zeige": zeige_stelle(fund["alt"]),
        "neu_zeige": zeige_stelle(fund["neu"]),
        "grund": fund["grund"],
        "art": fund["art"],
    } for fund in funde]

    gewaehlt = gui.frage_haken(
        "Schreibhilfe — Prüfen",
        "%d Stelle%s gefunden. Angehakt wird geändert." % (
            len(funde), "" if len(funde) == 1 else "n"),
        eintraege)
    if gewaehlt is None:
        return None
    return [funde[i] for i in gewaehlt]


def wende_funde_an(ziel, funde):
    """Trägt die Änderungen ins Dokument ein.

    Von hinten nach vorn: Jede Änderung verschiebt alles dahinter, aber nichts
    davor. Andersherum wären nach dem ersten Eintrag alle weiteren Stellen um
    den Längenunterschied verrutscht.

    Gearbeitet wird mit einem Textzeiger statt mit Suchen-und-Ersetzen — so
    trifft es genau die gemeinte Stelle und die Formatierung drumherum bleibt.
    """
    text = ziel.getText() if hasattr(ziel, "getText") else ziel
    getan = 0
    for fund in sorted(funde, key=lambda f: f["von"], reverse=True):
        zeiger = text.createTextCursorByRange(ziel.getStart())
        if fund["von"] and not zeiger.goRight(fund["von"], False):
            continue
        laenge = fund["bis"] - fund["von"]
        if laenge and not zeiger.goRight(laenge, True):
            continue
        # Sicherheitsprüfung: Steht dort wirklich noch, was wir erwarten?
        if zeiger.getString() != fund["alt"]:
            continue
        zeiger.setString(fund["neu"])
        getan += 1
    return getan


def hole_text(dokument):
    """Liefert (text, ziel). „ziel“ ist der markierte Bereich oder das ganze
    Dokument — dorthin wird später zurückgeschrieben."""
    auswahl = dokument.getCurrentController().getSelection()
    if auswahl and auswahl.getCount() > 0:
        bereich = auswahl.getByIndex(0)
        if bereich.getString().strip():
            return bereich.getString(), bereich
    return dokument.getText().getString(), dokument.getText()


class Handler(unohelper.Base, XServiceInfo, XDispatchProvider, XDispatch,
              XInitialization):
    """Nimmt die Menübefehle entgegen."""

    def __init__(self, ctx):
        self.ctx = ctx
        self.rahmen = None

    # --- XInitialization ---
    def initialize(self, args):
        if args:
            self.rahmen = args[0]

    # --- XServiceInfo ---
    def getImplementationName(self):
        return UMSETZUNG

    def supportsService(self, name):
        return name in DIENSTE

    def getSupportedServiceNames(self):
        return DIENSTE

    # --- XDispatchProvider ---
    def queryDispatch(self, url, ziel, flags):
        return self if url.Protocol == BEFEHLSRAUM else None

    def queryDispatches(self, anfragen):
        return tuple(self.queryDispatch(a.FeatureURL, a.FrameName, a.SearchFlags)
                     for a in anfragen)

    # --- XDispatch ---
    def addStatusListener(self, horcher, url):
        pass

    def removeStatusListener(self, horcher, url):
        pass

    def dispatch(self, url, argumente):
        gui = Oberflaeche(self.ctx, self.rahmen)
        try:
            befehl = url.Path
            if befehl == "einstellungen":
                self.einstellungen(gui)
            elif befehl == "gedaechtnis":
                self.gedaechtnis(gui)
            else:
                self.in_der_leiste(gui, befehl)
        except Exception:                                   # noqa: BLE001
            gui.melde("Schreibhilfe", "Da ist etwas schiefgegangen:\n\n"
                      + traceback.format_exc(), "errorbox")

    def in_der_leiste(self, gui, befehl):
        """Alle Arbeitsbefehle führen in die angedockte Tafel.

        Vorher öffnete jeder Menüpunkt sein eigenes Fenster — und die Tafel in
        der Seitenleiste war ein zweiter, unabhängiger Weg zur selben Sache.
        Wer das Menü benutzte, bekam weiterhin die alten Fenster und merkte
        nichts von der Tafel. Jetzt klappt das Menü die Leiste auf und lässt
        die Tafel arbeiten; die alten Fenster gibt es nur noch als Rückfall,
        falls sich die Leiste nicht öffnen lässt.
        """
        tafel = self.zeige_leiste()

        if tafel is None:
            # Rückfall: die Leiste war nicht zu haben, dann eben wie früher.
            if befehl == "pruefen":
                self.pruefen(gui)
            elif befehl == "korrigieren":
                self.korrigieren(gui)
            elif befehl == "vorschlaege":
                self.vorschlaege(gui)
            elif befehl == "uebersetzen":
                self.uebersetzen(gui)
            return

        if befehl == "pruefen":
            tafel.pruefen()
        elif befehl == "korrigieren":
            tafel.ki_lauf("korrigieren")
        elif befehl == "vorschlaege":
            tafel.ki_lauf("vorschlaege")
        elif befehl == "uebersetzen":
            tafel.ki_lauf("uebersetzen")

    def zeige_leiste(self):
        """Holt die Tafel unten am Writer-Fenster hervor — oder baut sie.

        Pro Writer-Fenster gibt es genau eine. Ruft man das Menü zweimal auf,
        soll keine zweite Tafel aufgehen, sondern dieselbe weiterarbeiten.
        """
        try:
            import tafel as T
        except ImportError:
            return None
        tafel = T.tafel_von(self.rahmen)
        if tafel is None:
            try:
                tafel = T.Tafel(self.ctx, self.rahmen)
            except Exception:                               # noqa: BLE001
                return None
        else:
            try:
                tafel.fenster.setVisible(True)
                tafel.ans_untere_ende()
            except Exception:                               # noqa: BLE001
                return None
        return tafel

    # --- die einzelnen Befehle ---

    def _dokument(self):
        return self.rahmen.getController().getModel()

    def einstellungen(self, gui):
        werte = lies_einstellungen()
        antwort = gui.frage_mehreres("Schreibhilfe — Einstellungen", [
            ("API-Schlüssel (für Korrigieren, Vorschläge, Übersetzen)",
             werte["apiKey"], "passwort"),
            ("KI-Modell", werte["modell"], MODELLE),
            ("Tonfall", werte["tonfall"], list(TONFAELLE.keys())),
            ("Sprache zum Übersetzen", werte["sprache"], SPRACHEN),
        ])
        if antwort is None:
            return
        werte["apiKey"], werte["modell"], werte["tonfall"], werte["sprache"] = antwort
        schreib_einstellungen(werte)
        gui.melde("Schreibhilfe", "Gespeichert.\n\nDie Angaben liegen in\n"
                  + EINSTELLUNGSDATEI)

    def gedaechtnis(self, gui):
        werte = lies_einstellungen()
        stand = werte["gelernt"]
        roh = gui.frage_text(
            "Gedächtnis einspielen",
            "Sicherungs-Text aus der Handy-App hier einfügen\n"
            "(dort: Zahnrad → Gedächtnis → Sichern):",
            "", mehrzeilig=True)
        if roh is None or not roh.strip():
            return
        ergebnis, fehler = spiele_sicherung_ein(roh, werte)
        if fehler:
            gui.melde("Gedächtnis", fehler, "errorbox")
            return
        schreib_einstellungen(werte)
        gui.melde("Gedächtnis",
                  "Eingespielt: %d Schreibweisen, %d Wörter in Ruhe.\n\n"
                  "Insgesamt bekannt: %d Schreibweisen."
                  % (ergebnis[0], ergebnis[1], len(stand["woerter"])))

    def pruefen(self, gui):
        """Die Prüfung ohne Internet: Wörterbuch, Kommas, Groß- und
        Kleinschreibung, das/dass, seit/seid, Tippfehler, Zusammengeklebtes."""
        if pruefung is None:
            gui.melde("Schreibhilfe", "Die Prüfung fehlt in dieser Fassung.",
                      "errorbox")
            return

        werte = lies_einstellungen()
        text, ziel = hole_text(self._dokument())
        if not text.strip():
            gui.melde("Schreibhilfe", "Es steht noch kein Text da.")
            return

        alle = pruefung.finde_probleme(text, werte["gelernt"])
        aenderbar = [f for f in alle if f["art"] != "hinweis"]
        hinweise = [f for f in alle if f["art"] == "hinweis"]

        if not aenderbar:
            nachsatz = ("\n\nZum Nachdenken:\n· " + "\n· ".join(h["grund"] for h in hinweise)) \
                if hinweise else ""
            gui.melde("Schreibhilfe", "Nichts gefunden." + nachsatz)
            return

        gewaehlt = waehle_funde(gui, aenderbar)
        if gewaehlt is None:
            return
        if not gewaehlt:
            gui.melde("Schreibhilfe", "Nichts geändert.")
            return

        getan = wende_funde_an(ziel, gewaehlt)

        # Aus jeder angenommenen Änderung lernen — wie am Handy.
        gelernt = sum(1 for f in gewaehlt if merke_aenderung(f, werte))
        if gelernt:
            schreib_einstellungen(werte)

        meldung = "%d von %d Stellen geändert." % (getan, len(gewaehlt))
        if gelernt:
            meldung += "\n%d neue Schreibweise%s gemerkt." % (
                gelernt, "n" if gelernt > 1 else "")
        if hinweise:
            meldung += "\n\nZum Nachdenken:\n· " + "\n· ".join(h["grund"] for h in hinweise)
        meldung += "\n\nStrg+Z nimmt alles zurück."
        gui.melde("Schreibhilfe", meldung)

    def korrigieren(self, gui):
        werte = lies_einstellungen()
        text, ziel = hole_text(self._dokument())
        if not text.strip():
            gui.melde("Schreibhilfe", "Es steht noch kein Text da.")
            return

        anweisung = ki_korrektur(werte["tonfall"], steckbrief(werte))
        ergebnis, fehler = frage_ki(anweisung, text, werte)
        if fehler:
            gui.melde("Schreibhilfe", fehler, "errorbox")
            return

        ziel.setString(ergebnis)
        tonzusatz = "" if werte["tonfall"] == TONFALL_STANDARD \
            else " · " + werte["tonfall"].lower()
        gui.melde("Schreibhilfe", "Fertig korrigiert" + tonzusatz + ".\n\n"
                  "Nicht einverstanden? Strg+Z macht es rückgängig.")

    def uebersetzen(self, gui):
        werte = lies_einstellungen()
        text, ziel = hole_text(self._dokument())
        if not text.strip():
            gui.melde("Schreibhilfe", "Es steht noch kein Text da.")
            return
        ergebnis, fehler = frage_ki(ki_uebersetzung(werte["sprache"]), text, werte)
        if fehler:
            gui.melde("Schreibhilfe", fehler, "errorbox")
            return
        ziel.setString(ergebnis)
        gui.melde("Schreibhilfe", "Übersetzt nach %s.\n\n"
                  "Das Deutsche holt Strg+Z zurück." % werte["sprache"])

    def vorschlaege(self, gui):
        werte = lies_einstellungen()
        text, _ziel = hole_text(self._dokument())
        if not text.strip():
            gui.melde("Schreibhilfe", "Es steht noch kein Text da.")
            return

        ergebnis, fehler = frage_ki(KI_VORSCHLAEGE, text, werte, VORSCHLAG_BAUPLAN)
        if fehler:
            gui.melde("Schreibhilfe", fehler, "errorbox")
            return

        roh = lies_liste(ergebnis)
        if roh is None:
            gui.melde("Schreibhilfe", "Die Antwort war nicht zu lesen. "
                      "Bitte noch einmal versuchen.", "errorbox")
            return

        dokument = self._dokument()
        ganz = dokument.getText().getString()
        brauchbar = [v for v in roh
                     if isinstance(v, dict)
                     and isinstance(v.get("alt"), str)
                     and isinstance(v.get("neu"), str)
                     and v["alt"] != v["neu"]
                     and v["alt"] in ganz]
        if not brauchbar:
            gui.melde("Schreibhilfe", "Die KI hatte nichts zu verbessern.")
            return

        # Jeden Vorschlag einzeln vorlegen — der Text gehört dem Menschen.
        uebernommen = 0
        for nr, vorschlag in enumerate(brauchbar, 1):
            frage = ("Vorschlag %d von %d\n\n"
                     "Bisher:\n%s\n\nBesser:\n%s\n\nWarum: %s\n\nÜbernehmen?"
                     % (nr, len(brauchbar), vorschlag["alt"], vorschlag["neu"],
                        vorschlag.get("grund", "Leichter zu lesen.")))
            if not gui.frage_ja_nein("Vorschläge", frage):
                continue
            if ersetze_im_dokument(dokument, vorschlag["alt"], vorschlag["neu"]):
                uebernommen += 1

        gui.melde("Schreibhilfe", "%d von %d Vorschlägen übernommen."
                  % (uebernommen, len(brauchbar)))


def ersetze_im_dokument(dokument, alt, neu):
    """Ersetzt das erste Vorkommen — über die Suchen-und-Ersetzen-Fähigkeit von
    Writer, damit die Formatierung drumherum erhalten bleibt."""
    suche = dokument.createSearchDescriptor()
    suche.SearchString = alt
    suche.SearchCaseSensitive = True
    suche.SearchRegularExpression = False
    treffer = dokument.findFirst(suche)
    if treffer is None:
        return False
    treffer.setString(neu)
    return True


# --------------------------------------------------------------------------
# Anmeldung bei LibreOffice
# --------------------------------------------------------------------------

g_ImplementationHelper = unohelper.ImplementationHelper()
g_ImplementationHelper.addImplementation(Handler, UMSETZUNG, DIENSTE)
