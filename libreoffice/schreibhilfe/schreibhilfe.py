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

    def frage_liste(self, titel, beschriftung, zeilen):
        """Eine Mehrfachauswahl. Rückgabe: Liste der angekreuzten Nummern,
        oder None bei Abbruch."""
        dialog = self._dienst("com.sun.star.awt.UnoControlDialogModel")
        breite = 420
        hoch = min(max(len(zeilen) * 10 + 4, 60), 260)
        dialog.Width, dialog.Height = breite, hoch + 46
        dialog.Title = titel
        dialog.PositionX, dialog.PositionY = 60, 60

        marke = dialog.createInstance("com.sun.star.awt.UnoControlFixedTextModel")
        marke.PositionX, marke.PositionY = 8, 6
        marke.Width, marke.Height = breite - 16, 10
        marke.Label = beschriftung
        dialog.insertByName("marke", marke)

        liste = dialog.createInstance("com.sun.star.awt.UnoControlListBoxModel")
        liste.PositionX, liste.PositionY = 8, 18
        liste.Width, liste.Height = breite - 16, hoch
        liste.MultiSelection = True
        liste.StringItemList = tuple(zeilen)
        liste.SelectedItems = tuple(range(len(zeilen)))     # alles vorausgewählt
        dialog.insertByName("liste", liste)

        for name, text, x, art in (("ok", "Ändern", breite - 8 - 116, 1),
                                   ("abbruch", "Abbrechen", breite - 8 - 56, 2)):
            knopf = dialog.createInstance("com.sun.star.awt.UnoControlButtonModel")
            knopf.PositionX, knopf.PositionY = x, hoch + 24
            knopf.Width, knopf.Height = 56, 14
            knopf.Label = text
            knopf.PushButtonType = art
            dialog.insertByName(name, knopf)

        fenster = self._dienst("com.sun.star.awt.UnoControlDialog")
        fenster.setModel(dialog)
        fenster.createPeer(self._dienst("com.sun.star.awt.Toolkit"), None)
        genommen = fenster.execute()
        gewaehlt = list(fenster.getControl("liste").getSelectedItemsPos()) \
            if genommen == 1 else None
        fenster.dispose()
        return gewaehlt

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

def waehle_funde(gui, funde):
    """Legt alle Funde in einer Liste vor — alles vorausgewählt, abwählbar.

    Ein Fenster mit einer Liste statt zwanzig Rückfragen hintereinander: Man
    sieht auf einen Blick, was geändert würde, und entscheidet in einem Zug.
    Rückgabe: die angekreuzten Funde, oder None bei Abbruch.
    """
    zeilen = []
    for fund in funde:
        alt = fund["alt"].replace("\n", "⏎") or "(nichts)"
        neu = fund["neu"].replace("\n", "⏎") or "(nichts)"
        zeilen.append("%s  →  %s      · %s" % (alt, neu, fund["grund"]))

    gewaehlt = gui.frage_liste(
        "Prüfen — %d Stellen gefunden" % len(funde),
        "Abgehakt wird geändert. Mit Strg oder Umschalt einzelne abwählen:",
        zeilen)
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
            if befehl == "pruefen":
                self.pruefen(gui)
            elif befehl == "einstellungen":
                self.einstellungen(gui)
            elif befehl == "gedaechtnis":
                self.gedaechtnis(gui)
            elif befehl == "korrigieren":
                self.korrigieren(gui)
            elif befehl == "vorschlaege":
                self.vorschlaege(gui)
            elif befehl == "uebersetzen":
                self.uebersetzen(gui)
        except Exception:                                   # noqa: BLE001
            gui.melde("Schreibhilfe", "Da ist etwas schiefgegangen:\n\n"
                      + traceback.format_exc(), "errorbox")

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
