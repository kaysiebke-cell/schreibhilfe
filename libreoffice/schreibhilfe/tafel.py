# -*- coding: utf-8 -*-
"""
Die Schreibhilfe als angedockte Tafel in der Seitenleiste von Writer.

Warum nicht als Fenster: Ein frei schwebendes Fenster steht im Weg, muss
weggeklickt werden und ist beim nächsten Blick auf den Text wieder zu. Die
Handy-App hat ihre Kästen deshalb fest unter dem Schreibfeld — hier stehen sie
fest an der Seite. Man schreibt, drückt „Prüfen“, und die Kästen bleiben
sichtbar, während man den Text weiter bearbeitet.

Der Weg dorthin führt in LibreOffice über drei Stufen, die alle nur Beiwerk
sind: eine Fabrik meldet sich für eine Ressourcen-Adresse zuständig, liefert
ein UI-Element, und dieses liefert das eigentliche Fenster. Die Arbeit
passiert erst danach in Tafel.
"""

import os
import sys

import unohelper
from com.sun.star.awt import XActionListener, XWindowListener
from com.sun.star.lang import XServiceInfo
from com.sun.star.ui import XUIElement, XUIElementFactory, XSidebarPanel
from com.sun.star.ui import LayoutSize
from com.sun.star.ui.UIElementType import TOOLPANEL

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import schreibhilfe as SH                                        # noqa: E402
try:
    import pruefung
except ImportError:                                              # pragma: no cover
    pruefung = None

# Welche Tafel gehört zu welchem Fenster? Das Menü braucht diesen Weg: Es
# schickt einen Befehl los und muss danach die Tafel finden, die gerade in
# diesem Writer-Fenster offen ist.
#
# Eine Zuordnung über id() geht NICHT: Dasselbe Writer-Fenster kommt über die
# UNO-Brücke je nach Aufruf als verschiedenes Python-Objekt an, mit
# verschiedener Kennnummer. Verglichen werden muss deshalb mit ==, das die
# Brücke auf das dahinterliegende Fenster durchreicht — also eine Liste statt
# einer Zuordnungstabelle.
OFFENE_TAFELN = []


def merke_tafel(rahmen, tafel):
    entferne_tafel(rahmen)
    OFFENE_TAFELN.append((rahmen, tafel))


def entferne_tafel(rahmen):
    for eintrag in list(OFFENE_TAFELN):
        try:
            if eintrag[0] == rahmen:
                OFFENE_TAFELN.remove(eintrag)
        except Exception:                                    # noqa: BLE001
            OFFENE_TAFELN.remove(eintrag)          # abgeräumtes Fenster


def tafel_von(rahmen):
    """Die offene Tafel dieses Fensters — oder None."""
    for gemerkt, tafel in list(OFFENE_TAFELN):
        try:
            if gemerkt == rahmen:
                return tafel
        except Exception:                                    # noqa: BLE001
            continue
    return None


FABRIK = "de.schreibhilfe.Fabrik"
ADRESSE = "private:resource/toolpanel/de.schreibhilfe.Fabrik/Tafel"


class Tafel(unohelper.Base, XWindowListener):
    """Der Inhalt der Seitenleiste: Knöpfe oben, Fundkästen darunter."""

    RAND = 6
    ZEILE = 30

    def __init__(self, ctx, elternfenster, rahmen):
        self.ctx = ctx
        self.rahmen = rahmen
        self.gui = SH.Oberflaeche(ctx, rahmen)
        self.funde = None      # None = noch nicht geprüft
        self.ziel = None

        self.modell = self._dienst("com.sun.star.awt.UnoControlDialogModel")
        self.modell.PositionX, self.modell.PositionY = 0, 0
        self.modell.Width, self.modell.Height = 200, 400

        self.fenster = self._dienst("com.sun.star.awt.UnoControlDialog")
        self.fenster.setModel(self.modell)
        self.fenster.createPeer(self._dienst("com.sun.star.awt.Toolkit"),
                                elternfenster)
        self.fenster.addWindowListener(self)
        elternfenster.addWindowListener(self)

        merke_tafel(rahmen, self)

        self.zeichne()
        self.fenster.setVisible(True)

    # --- Hilfen -------------------------------------------------------
    def _dienst(self, name):
        return self.ctx.ServiceManager.createInstanceWithContext(name, self.ctx)

    def _dokument(self):
        return self.rahmen.getController().getModel()

    def _leeren(self):
        for name in list(self.modell.getElementNames()):
            self.modell.removeByName(name)

    def _text(self, name, x, y, w, h, label, **werte):
        teil = self.modell.createInstance("com.sun.star.awt.UnoControlFixedTextModel")
        teil.PositionX, teil.PositionY, teil.Width, teil.Height = x, y, w, h
        teil.Label = label
        for schluessel, wert in werte.items():
            setattr(teil, schluessel, wert)
        self.modell.insertByName(name, teil)
        return teil

    def _knopf(self, name, x, y, w, h, label):
        teil = self.modell.createInstance("com.sun.star.awt.UnoControlButtonModel")
        teil.PositionX, teil.PositionY, teil.Width, teil.Height = x, y, w, h
        teil.Label = label
        teil.PushButtonType = 0
        self.modell.insertByName(name, teil)
        self.fenster.getControl(name).addActionListener(_Druck(self, name))
        return teil

    # --- Aufbau -------------------------------------------------------
    def zeichne(self):
        """Baut die Tafel neu auf — nach dem Vorbild der App.

        Von oben nach unten: der große Knopf, die Fundkästen, der
        Werkzeug-Kasten. Jeder Fund hat seinen EIGENEN „Ändern“-Knopf; Häkchen
        gibt es nicht. So macht es die App auch: Man liest einen Kasten, nimmt
        ihn oder lässt ihn stehen, und die Liste baut sich danach neu auf.
        """
        self._leeren()
        breite = max(160, self.modell.Width)
        rand = self.RAND
        w = breite - rand * 2
        y = rand

        self._knopf("pruefen", rand, y, w, 20, "✓  Prüfen")
        y += 26

        self._text("stand", rand, y, w, 10, self.stand_text(),
                   TextColor=self.gui.farben()["blass"], FontHeight=SH.SCHRIFT_GRUND)
        y += 14

        for nr, fund in enumerate(self.funde or []):
            y = self._kasten(nr, fund, rand, y, breite)

        # Der Werkzeug-Kasten, wie unten in der App
        y += 4
        self._text("wtitel", rand + 6, y, w - 6, 11,
                   "Reicht das nicht?" if self.funde else "Noch etwas damit machen?",
                   TextColor=self.gui.farben()["blass"], FontHeight=SH.SCHRIFT_GRUND)
        y += 14
        for name, beschriftung in (("ki", "KI-Korrektur"),
                                   ("vorschlaege", "Vorschläge"),
                                   ("uebersetzen", "Übersetzen")):
            self._knopf(name, rand + 6, y, w - 12, 16, beschriftung)
            y += 19

        self.modell.Height = max(y + self.RAND, 80)

    def stand_text(self):
        if self.funde is None:
            return "Noch nicht geprüft."
        if not self.funde:
            return "Nichts gefunden."
        return "%d Stelle%s zum Ändern." % (len(self.funde),
                                            "" if len(self.funde) == 1 else "n")

    def _kasten(self, nr, fund, rand, y, breite):
        """Ein Fund: Balken, alt → neu, Begründung, eigener Ändern-Knopf."""
        farbe = self.gui.farben()
        w_knopf = 52
        x_text = rand + 8
        w_text = breite - rand - x_text - w_knopf - 6
        hoch = 30

        balken = self.modell.createInstance("com.sun.star.awt.UnoControlFixedTextModel")
        balken.PositionX, balken.PositionY = rand, y
        balken.Width, balken.Height = 3, hoch - 4
        balken.Label = ""
        balken.BackgroundColor = farbe["fehler"] if fund["art"] == "fehler" else farbe["tipp"]
        self.modell.insertByName("balken%d" % nr, balken)

        # alt und neu in einer Zeile, so wie in der App. Die Breite der ersten
        # Spalte richtet sich nach dem Wort, damit der Pfeil direkt anschließt.
        alt = SH.kuerze(fund["alt_zeige"], 22)
        w_alt = min(int(len(alt) * SH.ZEICHENBREITE) + 4, w_text - 40)
        self._text("alt%d" % nr, x_text, y, w_alt, 12, alt,
                   TextColor=farbe["alt"], FontStrikeout=1,
                   FontName="DejaVu Sans Mono", FontHeight=SH.SCHRIFT_WORT)
        self._text("pfeil%d" % nr, x_text + w_alt, y, 9, 12, "→",
                   TextColor=farbe["blass"], FontHeight=SH.SCHRIFT_WORT)
        self._text("neu%d" % nr, x_text + w_alt + 10, y, w_text - w_alt - 10, 12,
                   SH.kuerze(fund["neu_zeige"], 22), TextColor=farbe["neu"],
                   FontWeight=150, FontName="DejaVu Sans Mono",
                   FontHeight=SH.SCHRIFT_WORT)
        self._text("grund%d" % nr, x_text, y + 13, w_text, 11,
                   SH.kuerze(fund["grund"], 44), TextColor=farbe["blass"],
                   FontHeight=SH.SCHRIFT_GRUND)

        self._knopf("nimm%d" % nr, breite - rand - w_knopf, y + 3, w_knopf, 16,
                    "Ändern")
        return y + hoch

    # --- Was die Knöpfe tun -------------------------------------------
    def gedrueckt(self, name):
        if name == "pruefen":
            self.pruefen()
        elif name == "ki":
            self.ki_lauf("korrigieren")
        elif name == "vorschlaege":
            self.ki_lauf("vorschlaege")
        elif name == "uebersetzen":
            self.ki_lauf("uebersetzen")
        elif name.startswith("nimm"):
            self.nimm(int(name[4:]))

    def nimm(self, nr):
        """Einen einzelnen Fund übernehmen — wie ein Tipp auf „Ändern“ in der App.

        Danach wird neu geprüft: Alle Stellen dahinter haben sich verschoben,
        und Verdecktes kommt jetzt zum Vorschein.
        """
        fund = self.funde[nr]["roh"]
        SH.wende_funde_an(self.ziel, [fund])
        werte = SH.lies_einstellungen()
        if SH.merke_aenderung(fund, werte):
            SH.schreib_einstellungen(werte)
        self.pruefen()

    def pruefen(self):
        if pruefung is None:
            self.gui.melde("Schreibhilfe", "Die Prüfung fehlt in dieser Fassung.",
                           "errorbox")
            return
        werte = SH.lies_einstellungen()
        text, self.ziel = SH.hole_text(self._dokument())
        alle = pruefung.finde_probleme(text, werte["gelernt"])
        roh = [f for f in alle if f["art"] != "hinweis"]
        self.funde = [{
            "alt_zeige": SH.zeige_stelle(f["alt"]),
            "neu_zeige": SH.zeige_stelle(f["neu"]),
            "grund": f["grund"], "art": f["art"], "roh": f,
        } for f in roh]
        self.zeichne()

    def ki_lauf(self, was):
        """Die drei KI-Wege. Sie arbeiten auf demselben Text wie die Prüfung."""
        werte = SH.lies_einstellungen()
        text, ziel = SH.hole_text(self._dokument())
        if not text.strip():
            self.gui.melde("Schreibhilfe", "Es steht noch kein Text da.")
            return

        if was == "vorschlaege":
            # Die Vorschläge sind ganze Sätze — die bekommen wie in der App
            # ihre eigenen Kästen, statt einzeln nachgefragt zu werden.
            ergebnis, fehler = SH.frage_ki(SH.KI_VORSCHLAEGE, text, werte,
                                           SH.VORSCHLAG_BAUPLAN)
            if fehler:
                self.gui.melde("Schreibhilfe", fehler, "errorbox")
                return
            roh = SH.lies_liste(ergebnis) or []
            ganz = self._dokument().getText().getString()
            self.ziel = ziel
            self.funde = [{
                "alt_zeige": SH.kuerze(v["alt"], 22),
                "neu_zeige": SH.kuerze(v["neu"], 22),
                "grund": v.get("grund", "Leichter zu lesen."),
                "art": "tipp",
                "roh": {"alt": v["alt"], "neu": v["neu"], "wortEbene": False,
                        "von": ganz.find(v["alt"]),
                        "bis": ganz.find(v["alt"]) + len(v["alt"])},
            } for v in roh
                if isinstance(v, dict) and isinstance(v.get("alt"), str)
                and isinstance(v.get("neu"), str) and v["alt"] in ganz]
            self.zeichne()
            return

        anweisung = (SH.ki_korrektur(werte["tonfall"], SH.steckbrief(werte))
                     if was == "korrigieren"
                     else SH.ki_uebersetzung(werte["sprache"]))
        ergebnis, fehler = SH.frage_ki(anweisung, text, werte)
        if fehler:
            self.gui.melde("Schreibhilfe", fehler, "errorbox")
            return
        ziel.setString(ergebnis)
        self.funde = []
        self.zeichne()

    # --- XWindowListener: mitwachsen ----------------------------------
    def windowResized(self, ereignis):
        self.modell.Width = ereignis.Width
        self.zeichne()

    def windowMoved(self, ereignis): pass
    def windowShown(self, ereignis): pass
    def windowHidden(self, ereignis): pass
    def disposing(self, ereignis): pass


class _Druck(unohelper.Base, XActionListener):
    """Leitet einen Knopfdruck an die Tafel weiter.

    XActionListener muss ausdrücklich dabeistehen: unohelper.Base allein
    genügt nicht — LibreOffice fragt die Schnittstelle ab und weist den Horcher
    sonst mit „value does not implement XActionListener“ zurück.
    """

    def __init__(self, tafel, name):
        self.tafel = tafel
        self.name = name

    def actionPerformed(self, ereignis):
        self.tafel.gedrueckt(self.name)

    def disposing(self, ereignis):
        pass


class TafelElement(unohelper.Base, XUIElement, XSidebarPanel):
    """Die Hülle, die LibreOffice von der Fabrik erwartet."""

    def __init__(self, ctx, rahmen, elternfenster):
        self.ctx = ctx
        self.Frame = rahmen
        self.ResourceURL = ADRESSE
        self.Type = TOOLPANEL
        self.tafel = Tafel(ctx, elternfenster, rahmen)

    def getRealInterface(self):
        return self.tafel.fenster

    def getMinimalWidth(self):
        return 180

    def getHeightForWidth(self, breite):
        hoehe = self.tafel.modell.Height
        return LayoutSize(hoehe, hoehe, hoehe)


class TafelFabrik(unohelper.Base, XUIElementFactory, XServiceInfo):
    """Meldet sich für die Ressourcen-Adresse der Tafel zuständig."""

    def __init__(self, ctx):
        self.ctx = ctx

    def createUIElement(self, adresse, angaben):
        rahmen = elternfenster = None
        for angabe in angaben:
            if angabe.Name == "Frame":
                rahmen = angabe.Value
            elif angabe.Name == "ParentWindow":
                elternfenster = angabe.Value
        return TafelElement(self.ctx, rahmen, elternfenster)

    def getImplementationName(self):
        return FABRIK

    def supportsService(self, name):
        return name == "com.sun.star.ui.UIElementFactory"

    def getSupportedServiceNames(self):
        return ("com.sun.star.ui.UIElementFactory",)


g_ImplementationHelper = unohelper.ImplementationHelper()
g_ImplementationHelper.addImplementation(
    TafelFabrik, FABRIK, ("com.sun.star.ui.UIElementFactory",))
