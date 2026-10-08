#!/usr/bin/env python3
"""
schreibhilfe_gtk.py — die Schreibhilfe als richtiges GTK-Programm.

Die Oberfläche besteht aus echten GTK-Bausteinen (Kopfzeile, Textfeld, Listen,
Knöpfe, Einstellungsfenster) und folgt damit dem Systemdesign von Cinnamon:
Farben, Schrift, Hell und Dunkel, Rechtsklick-Menü. Keine Webseite im Fenster.

Geprüft wird mit der Logik der Web-App. Sie läuft unsichtbar im Hintergrund
(ein WebView, den niemand sieht), und diese Oberfläche ruft ihre Funktionen auf:
findeProbleme, korrigiereMitStellen, die KI-Anfragen, das Gedächtnis. So gibt
es nur EINE Fassung der Regeln — Handy, Browser und PC prüfen gleich, und die
Einstellungen und das Gelernte liegen im selben Speicher.

Aufruf:  ./linux-native/start.sh            normales Fenster
         (ein zweiter Start blendet das Fenster ein oder aus)
"""

import json
import os
import re
import sys
import threading

import gi

gi.require_version("Gdk", "3.0")
gi.require_version("Gtk", "3.0")
gi.require_version("WebKit2", "4.1")
gi.require_version("Pango", "1.0")
from gi.repository import Gdk, GLib, Gtk, Pango, WebKit2          # noqa: E402

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "linux"))
import schreibhilfe as basis                                      # noqa: E402

GLib.set_prgname("schreibhilfe")

DATEN = basis.DATEN
TEXTDATEI = os.path.join(DATEN, "text.txt")
EINSTELLUNGEN = os.path.join(DATEN, "gtk.json")        # nur Dinge der Oberfläche
WORT = re.compile(r"[A-Za-zÄÖÜäöüß0-9'’-]")

EMPFAENGER = ["egal", "Amt", "Arbeit", "Freunde", "Forum", "Bewerbung"]
SPRACHEN = ["Englisch", "Deutsch", "Türkisch", "Russisch", "Ukrainisch", "Polnisch",
            "Rumänisch", "Arabisch", "Französisch", "Spanisch", "Italienisch",
            "Griechisch", "Niederländisch", "Portugiesisch"]
CLAUDE_MODELLE = [("claude-opus-5", "Beste Qualität · Opus 5"),
                  ("claude-sonnet-5", "Mittelweg · Sonnet 5"),
                  ("claude-haiku-4-5", "Günstig und schnell · Haiku 4.5")]
OLLAMA_MARKE = "ollama:"
SORTEN = {"tipp": "Kommt drauf an", "hinweis": "Zum Nachdenken", "vorschlag": "Vorschlag"}

CSS = b"""
.statuszeile { opacity: 0.8; }
.statusgut { color: @success_color; opacity: 1; }
.fund { border-left: 4px solid #d93636; padding: 8px 10px; margin: 3px 0;
        background: alpha(@theme_fg_color, 0.05); border-radius: 4px; }
.fund-tipp, .fund-vorschlag { border-left-color: #e08a0d; }
.fund-hinweis { border-left-color: #3573d9; }
.fund-werkzeug { border-left-color: #8a8a8a; }
.fundsorte { font-size: 85%; opacity: 0.75; }
.fundfalsch { text-decoration: line-through; opacity: 0.8; }
.fundrichtig { font-weight: bold; }
.fundgrund { opacity: 0.8; font-size: 90%; }
.vorschlagzeile { padding: 2px 0; }
.gruppe-titel { font-weight: bold; margin-top: 10px; }
.fusszeile-hinweis { opacity: 0.7; font-size: 90%; }
"""


# ---------- Hilfen: UTF-16 (JavaScript) gegen Zeichen (GTK) ----------

def u16_zu_zeichen(text):
    karte = []
    for i, z in enumerate(text):
        karte.append(i)
        if ord(z) > 0xFFFF:
            karte.append(i)
    karte.append(len(text))
    return karte


def alt_geld(cent):
    if cent >= 100:
        return ("%.2f" % (cent / 100)).replace(".", ",") + " $"
    if cent >= 1:
        return ("%.1f" % cent).replace(".", ",") + " Cent"
    return ("%.2f" % cent).replace(".", ",") + " Cent"


# ---------- Die Logik der Web-App im Hintergrund ----------

class Pruefer:
    def __init__(self, port, bereit):
        speicher = WebKit2.WebsiteDataManager(
            base_data_directory=DATEN, base_cache_directory=basis.ZWISCHEN)
        umgebung = WebKit2.WebContext.new_with_website_data_manager(speicher)
        self.ansicht = WebKit2.WebView.new_with_context(umgebung)
        einst = self.ansicht.get_settings()
        einst.set_user_agent(einst.get_user_agent() + " Schreibhilfe/1.0")
        self._versteck = Gtk.OffscreenWindow()
        self._versteck.add(self.ansicht)
        self._versteck.show_all()
        self.bereit = False
        self._auf_bereit = bereit
        self.ansicht.connect("load-changed", self._geladen)
        self.ansicht.load_uri("http://localhost:%d/" % port)

    def _geladen(self, ansicht, ereignis):
        if ereignis == WebKit2.LoadEvent.FINISHED and not self.bereit:
            self.bereit = True
            self._auf_bereit()

    def js(self, rumpf, antwort=None):
        """Führt einen JS-Funktionsrumpf aus (mit await möglich). Was er mit
        `return` liefert, kommt als Python-Wert an antwort(wert)."""
        skript = "const __e = await (async () => {%s})(); return JSON.stringify(__e === undefined ? null : __e);" % rumpf

        def fertig(quelle, ergebnis):
            wert = None
            try:
                roh = quelle.call_async_javascript_function_finish(ergebnis).to_string()
                wert = json.loads(roh) if roh else None
            except GLib.Error as fehler:
                print("Prüfer:", fehler.message, file=sys.stderr)
            except ValueError:
                pass
            if antwort:
                antwort(wert)

        self.ansicht.call_async_javascript_function(
            skript, -1, None, None, None, None, fertig)

    def speicher_lies(self, namen, antwort):
        self.js("return Object.fromEntries(%s.map(n => [n, Speicher.lies(n, null)]));"
                % json.dumps(namen), antwort)

    def speicher_schreib(self, name, wert):
        self.js("Speicher.schreib(%s, %s);" % (json.dumps(name), json.dumps(wert)))

    def speicher_loesch(self, name):
        self.js("Speicher.loesch(%s);" % json.dumps(name))


# ---------- Das Hauptfenster ----------

class Fenster(Gtk.Window):
    def __init__(self, port, desklet=False):
        super().__init__(title="Schreibhilfe")
        self.desklet = desklet
        self.set_icon_name("schreibhilfe")
        self.set_default_size(620, 760)
        self.ui = self._ui_lesen()

        # Stand der Einstellungen aus dem gemeinsamen Speicher (Schlüssel, Modell …)
        self.cfg = {"apiKey": "", "modell": "claude-opus-5", "sprache": "Englisch",
                    "wortmarker": True, "lesestimme": "", "lesetempo": 0,
                    "empfaenger": "egal", "zettel": ""}

        self.eintraege = []            # Funde in der Liste: {'fund', 'von', 'bis'}
        self.ki_modus = False          # Liste stammt von der KI
        self.live = []                 # Funde der stillen Prüfung (Zeichenstellen)
        self.vorheriger_text = None
        self.vorheriger_zettel = None
        self.im_eimer = False
        self.liest = False
        self.beschaeftigt = False
        self._intern = False
        self._timer = {}
        self._bauen()
        self.pruefer = Pruefer(port, self._bereit)

        lage = os.path.join(DATEN, "fenster-gtk.json")
        if os.path.isfile(lage):
            basis.fenster_lage_laden(self, lage)
        else:
            # Erster Start: schmal, fast in voller Höhe, am rechten Rand. Etwas
            # Luft lassen — die Kopfzeile und der Schatten gehören zum Fenster.
            feld = Gdk.Display.get_default().get_primary_monitor().get_workarea()
            breite = min(620, feld.width)
            self.set_default_size(breite, feld.height - 80)
            self.move(feld.x + feld.width - breite - 40, feld.y + 20)
        self.connect("delete-event",
                     lambda w, e: basis.fenster_lage_merken(w, lage) and False)
        self.connect("destroy", self._beenden)

    # ===== Oberflächen-Einstellungen (nur dieses Fenster) =====

    def _ui_lesen(self):
        try:
            with open(EINSTELLUNGEN, encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            return {}

    def _ui_schreiben(self):
        try:
            os.makedirs(DATEN, exist_ok=True)
            with open(EINSTELLUNGEN, "w", encoding="utf-8") as f:
                json.dump(self.ui, f)
        except OSError:
            pass

    def design_anwenden(self):
        wahl = self.ui.get("design", "system")
        einst = Gtk.Settings.get_default()
        if wahl == "dunkel":
            einst.set_property("gtk-application-prefer-dark-theme", True)
        elif wahl == "hell":
            einst.set_property("gtk-application-prefer-dark-theme", False)
        else:
            einst.reset_property("gtk-application-prefer-dark-theme")

    def schrift_anwenden(self):
        groesse = int(self.ui.get("schrift", 15))
        stil = Gtk.CssProvider()
        stil.load_from_data(("textview { font-size: %dpt; }" % groesse).encode())
        ctx = self.feld.get_style_context()
        if getattr(self, "_schrift_stil", None):
            ctx.remove_provider(self._schrift_stil)
        self._schrift_stil = stil
        ctx.add_provider(stil, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)

    # ===== Aufbau =====

    def _bauen(self):
        stil = Gtk.CssProvider()
        stil.load_from_data(CSS)
        Gtk.StyleContext.add_provider_for_screen(
            Gdk.Screen.get_default(), stil, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
        self.design_anwenden()

        kopf = Gtk.HeaderBar(title="Schreibhilfe",
                             subtitle="Findet, was der Rechtschreibprüfer übersieht")
        kopf.set_show_close_button(not self.desklet)

        self.knopf_lesen = Gtk.Button.new_from_icon_name(
            "audio-volume-high-symbolic", Gtk.IconSize.BUTTON)
        self.knopf_lesen.set_tooltip_text("Vorlesen (Auswahl oder ganzer Text)")
        self.knopf_lesen.connect("clicked", self._vorlesen)
        kopf.pack_start(self.knopf_lesen)

        self.knopf_einst = Gtk.Button.new_from_icon_name(
            "preferences-system-symbolic", Gtk.IconSize.BUTTON)
        self.knopf_einst.set_tooltip_text("Einstellungen")
        self.knopf_einst.connect("clicked", self._einstellungen_oeffnen)
        kopf.pack_end(self.knopf_einst)

        self.knopf_zu = Gtk.Button.new_from_icon_name("go-previous-symbolic", Gtk.IconSize.BUTTON)
        self.knopf_zu.set_tooltip_text("Zurück zum Text (Esc)")
        self.knopf_zu.set_no_show_all(True)
        self.knopf_zu.connect("clicked", self._einstellungen_schliessen)
        kopf.pack_start(self.knopf_zu)
        self.kopf = kopf

        self.knopf_ki = Gtk.MenuButton(label="KI")
        self.knopf_ki.set_tooltip_text("KI-Werkzeuge: Korrigieren, Vorschläge, Übersetzen")
        self.knopf_ki.set_no_show_all(True)
        self.ki_popover = Gtk.Popover()
        self.knopf_ki.set_popover(self.ki_popover)
        kopf.pack_end(self.knopf_ki)

        aussen = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        if self.desklet:
            aussen.pack_start(kopf, False, False, 0)
        else:
            self.set_titlebar(kopf)

        # --- Text und Vorschlagsleiste ---
        self.puffer = Gtk.TextBuffer()
        farbe = lambda r, g, b, a=1: Gdk.RGBA(r, g, b, a)
        self.tag_falsch = self.puffer.create_tag(
            "falsch", underline=Pango.Underline.ERROR, underline_rgba=farbe(.86, .16, .16))
        self.tag_tipp = self.puffer.create_tag(
            "tipp", underline=Pango.Underline.ERROR, underline_rgba=farbe(.90, .55, .05))
        self.tag_hinweis = self.puffer.create_tag(
            "hinweis", underline=Pango.Underline.SINGLE, underline_rgba=farbe(.20, .45, .85))
        self.tag_gruen = self.puffer.create_tag(
            "gruen", background_rgba=farbe(.25, .70, .35, .35))
        self.tag_wort = self.puffer.create_tag(
            "wort", background_rgba=farbe(.45, .55, .95, .22))

        self.feld = Gtk.TextView(buffer=self.puffer)
        self.feld.set_wrap_mode(Gtk.WrapMode.WORD_CHAR)
        for seite in ("left", "right", "top", "bottom"):
            getattr(self.feld, "set_%s_margin" % seite)(10)
        self.feld.set_pixels_below_lines(4)
        self.feld.set_accepts_tab(False)
        self.schrift_anwenden()
        self.feld.connect("button-release-event", self._klick)
        self.feld.connect("populate-popup", self._rechtsklick_menue)
        self.puffer.connect("changed", self._text_geaendert)
        self.puffer.connect("notify::cursor-position", self._cursor_bewegt)

        rolle = Gtk.ScrolledWindow()
        rolle.set_shadow_type(Gtk.ShadowType.IN)
        rolle.set_vexpand(True)
        rolle.set_min_content_height(160)
        rolle.add(self.feld)

        self.vorschlag_leiste = Gtk.Box(spacing=6)
        self.vorschlag_leiste.get_style_context().add_class("vorschlagzeile")
        self.vorschlag_leiste.set_no_show_all(True)

        oben = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6)
        oben.set_margin_start(12)
        oben.set_margin_end(12)
        oben.set_margin_top(12)
        oben.pack_start(rolle, True, True, 0)
        oben.pack_start(self.vorschlag_leiste, False, False, 0)

        # --- Funde, Status ---
        self.liste = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        self.liste_rolle = Gtk.ScrolledWindow()
        self.liste_rolle.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
        self.liste_rolle.set_min_content_height(0)
        self.liste_rolle.set_propagate_natural_height(True)
        self.liste_rolle.set_max_content_height(300)
        self.liste_rolle.set_margin_start(12)
        self.liste_rolle.set_margin_end(12)
        self.liste_rolle.add(self.liste)
        self.liste_rolle.set_no_show_all(True)

        self.status = Gtk.Label(label="", xalign=0)
        self.status.set_margin_start(14)
        self.status.set_margin_end(14)
        self.status.set_line_wrap(True)
        self.status.get_style_context().add_class("statuszeile")

        unten = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6)
        unten.pack_start(self.liste_rolle, False, False, 0)
        unten.pack_start(self.status, False, False, 0)

        # --- Knöpfe ---
        leiste = Gtk.Box(spacing=8)
        for seite in ("start", "end", "top", "bottom"):
            getattr(leiste, "set_margin_%s" % seite)(12)

        self.knopf_korrigieren = Gtk.Button.new_with_mnemonic("_Korrigieren")
        self.knopf_korrigieren.set_image(
            Gtk.Image.new_from_icon_name("object-select-symbolic", Gtk.IconSize.BUTTON))
        self.knopf_korrigieren.set_always_show_image(True)
        self.knopf_korrigieren.get_style_context().add_class("suggested-action")
        self.knopf_korrigieren.set_tooltip_text("Zeigt, was zu ändern ist (Strg+Enter)")
        self.knopf_korrigieren.connect("clicked", self._korrigieren)
        self.knopf_korrigieren.set_no_show_all(True)

        self.knopf_kopieren = Gtk.Button.new_with_label("Text kopieren")
        self.knopf_kopieren.set_image(
            Gtk.Image.new_from_icon_name("edit-copy-symbolic", Gtk.IconSize.BUTTON))
        self.knopf_kopieren.set_always_show_image(True)
        self.knopf_kopieren.get_style_context().add_class("suggested-action")
        self.knopf_kopieren.connect("clicked", self._kopieren)
        self.knopf_kopieren.set_no_show_all(True)

        self.knopf_alles = Gtk.Button.new_with_label("Alles ändern")
        self.knopf_alles.set_tooltip_text("Wendet alles Eindeutige sofort an, grün markiert")
        self.knopf_alles.connect("clicked", self._alles_aendern)

        self.knopf_zurueck = Gtk.Button.new_from_icon_name(
            "edit-undo-symbolic", Gtk.IconSize.BUTTON)
        self.knopf_zurueck.set_tooltip_text("Rückgängig")
        self.knopf_zurueck.set_no_show_all(True)
        self.knopf_zurueck.connect("clicked", self._zurueckholen)

        self.knopf_leeren = Gtk.Button.new_from_icon_name(
            "edit-delete-symbolic", Gtk.IconSize.BUTTON)
        self.knopf_leeren.connect("clicked", self._leeren)

        leiste.pack_start(self.knopf_korrigieren, True, True, 0)
        leiste.pack_start(self.knopf_kopieren, True, True, 0)
        leiste.pack_start(self.knopf_alles, False, False, 0)
        leiste.pack_start(self.knopf_zurueck, False, False, 0)
        leiste.pack_start(self.knopf_leeren, False, False, 0)

        seite_text = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        seite_text.pack_start(oben, True, True, 0)
        seite_text.pack_start(unten, False, False, 0)
        seite_text.pack_start(leiste, False, False, 0)

        self.stapel = Gtk.Stack()
        self.stapel.set_transition_type(Gtk.StackTransitionType.SLIDE_LEFT_RIGHT)
        self.stapel.set_transition_duration(160)
        self.stapel.add_named(seite_text, "text")
        self.einstellungen = Einstellungen(self)
        self.stapel.add_named(self.einstellungen, "einst")
        aussen.pack_start(self.stapel, True, True, 0)
        self.add(aussen)
        self.connect("key-press-event", self._taste)

        gruppe = Gtk.AccelGroup()
        self.add_accel_group(gruppe)
        self.knopf_korrigieren.add_accelerator(
            "clicked", gruppe, Gdk.KEY_Return, Gdk.ModifierType.CONTROL_MASK,
            Gtk.AccelFlags.VISIBLE)

        try:
            with open(TEXTDATEI, encoding="utf-8") as f:
                self._intern = True
                self.puffer.set_text(f.read())
                self._intern = False
        except OSError:
            pass
        self.knopf_korrigieren.show()
        self._leeren_anzeigen()
        self.feld.grab_focus()

    # ===== Start =====

    def _bereit(self):
        namen = list(self.cfg) + ["tonfall"]
        self.pruefer.speicher_lies(namen, self._cfg_da)

    def _cfg_da(self, werte):
        for name, wert in (werte or {}).items():
            if wert is not None and name in self.cfg:
                self.cfg[name] = wert
        self.pruefer.js("return empfaengerLies();", self._empfaenger_da)

    def _empfaenger_da(self, wahl):
        if wahl:
            self.cfg["empfaenger"] = wahl
        self._ki_zeigen()
        self._live_planen()

    # ===== Text lesen und ändern =====

    def _text(self):
        return self.puffer.get_text(self.puffer.get_start_iter(),
                                    self.puffer.get_end_iter(), True)

    def _meldung(self, text, gut=False):
        self.status.set_text(text)
        ctx = self.status.get_style_context()
        (ctx.add_class if gut else ctx.remove_class)("statusgut")

    def _setze_text(self, text):
        self._intern = True
        self.puffer.set_text(text)
        self._intern = False
        self._nach_aenderung()

    def _nach_aenderung(self):
        self._speichern_planen()
        self._live_planen()
        self._wort_markieren()
        self._vorschlaege_planen()
        self._leeren_anzeigen()

    def _text_geaendert(self, *_):
        if self._intern:
            return
        self.puffer.remove_tag(self.tag_gruen, self.puffer.get_start_iter(),
                               self.puffer.get_end_iter())
        self._vergiss_zurueck()
        self._liste_leeren()
        self._danach_zeigen(False)
        self._nach_aenderung()

    def _cursor_bewegt(self, *_):
        self._wort_markieren()
        self._vorschlaege_planen()

    def _planen(self, name, ms, tun):
        if name in self._timer:
            GLib.source_remove(self._timer[name])

        def los():
            self._timer.pop(name, None)
            tun()
            return False
        self._timer[name] = GLib.timeout_add(ms, los)

    def _speichern_planen(self):
        self._planen("speichern", 800, self._speichern)

    def _speichern(self):
        try:
            os.makedirs(DATEN, exist_ok=True)
            with open(TEXTDATEI, "w", encoding="utf-8") as f:
                f.write(self._text())
        except OSError:
            pass

    # ===== Der Wortmarker =====

    def _wort_grenzen(self):
        """Das Wort rund um den Cursor als Offsets — oder None."""
        text = self._text()
        pos = self.puffer.get_property("cursor-position")
        von = pos
        while von > 0 and WORT.match(text[von - 1]):
            von -= 1
        bis = pos
        while bis < len(text) and WORT.match(text[bis]):
            bis += 1
        return (von, bis, text) if bis > von else None

    def _wort_markieren(self):
        self.puffer.remove_tag(self.tag_wort, self.puffer.get_start_iter(),
                               self.puffer.get_end_iter())
        if not self.cfg.get("wortmarker", True) or self.puffer.get_has_selection():
            return
        gr = self._wort_grenzen()
        if gr:
            self.puffer.apply_tag(self.tag_wort, self.puffer.get_iter_at_offset(gr[0]),
                                  self.puffer.get_iter_at_offset(gr[1]))

    # ===== Wortvorschläge (Weiter mit / Meintest du) =====

    def _vorschlag_lage(self):
        if self.puffer.get_has_selection() or not self.feld.is_focus():
            return None
        text = self._text()
        bis = self.puffer.get_property("cursor-position")
        if bis < len(text) and WORT.match(text[bis]):
            return None
        von = bis
        while von > 0 and WORT.match(text[von - 1]):
            von -= 1
        wort = text[von:bis]
        return (von, bis, wort) if len(wort) >= 3 else None

    def _vorschlaege_verbergen(self):
        for kind in self.vorschlag_leiste.get_children():
            kind.destroy()
        self.vorschlag_leiste.hide()

    def _vorschlaege_planen(self):
        lage = self._vorschlag_lage()
        if not lage:
            self._vorschlaege_verbergen()
            return
        if not self.pruefer.bereit:
            return
        self._planen("vorschlag", 180, lambda: self._vorschlaege_holen(lage))

    def _vorschlaege_holen(self, lage):
        if self._vorschlag_lage() != lage:
            return
        wort = json.dumps(lage[2])
        self.pruefer.js(
            "const w=%s; const weiter=faengtAnMit(w,5); const unbekannt=!weiter.length;"
            "const l=unbekannt?vorschlaegeFuer(w,5):weiter;"
            "return {unbekannt, woerter:l.map(x=>mitSchreibweise(w,x))};" % wort,
            lambda erg: self._vorschlaege_zeigen(lage, erg))

    def _vorschlaege_zeigen(self, lage, erg):
        if not erg or self._vorschlag_lage() != lage or not erg["woerter"]:
            self._vorschlaege_verbergen()
            return
        self._vorschlaege_verbergen()
        marke = Gtk.Label(label="Meintest du" if erg["unbekannt"] else "Weiter mit")
        marke.get_style_context().add_class("fundsorte")
        self.vorschlag_leiste.pack_start(marke, False, False, 0)
        for w in erg["woerter"]:
            knopf = Gtk.Button.new_with_label(w)
            knopf.set_focus_on_click(False)           # Fokus bleibt im Textfeld
            knopf.connect("clicked", lambda b, wort=w: self._vorschlag_nehmen(lage, wort))
            self.vorschlag_leiste.pack_start(knopf, False, False, 0)
        self.vorschlag_leiste.show_all()

    def _vorschlag_nehmen(self, lage, wort):
        von, bis, _ = lage
        self._intern = True
        a = self.puffer.get_iter_at_offset(von)
        b = self.puffer.get_iter_at_offset(bis)
        self.puffer.delete(a, b)
        self.puffer.insert(self.puffer.get_iter_at_offset(von), wort)
        self._intern = False
        self._vergiss_zurueck()
        self._liste_leeren()
        self._danach_zeigen(False)
        self.feld.grab_focus()
        self._vorschlaege_verbergen()
        self._nach_aenderung()

    # ===== Stille Prüfung: Unterstreichen beim Schreiben =====

    def _live_planen(self):
        if not self.pruefer.bereit or not self.ui.get("live", True):
            self._live_loeschen()
            return
        self._planen("live", 700, self._live_pruefen)

    def _live_pruefen(self):
        text = self._text()
        if not text.strip():
            self._live_loeschen()
            return
        self.pruefer.js("return findeProbleme(%s);" % json.dumps(text),
                        lambda funde: self._live_da(text, funde))

    def _live_da(self, text, funde):
        if self._text() != text:
            return
        self._live_loeschen()
        karte = u16_zu_zeichen(text)
        for fund in funde or []:
            try:
                von, bis = karte[int(fund["von"])], karte[int(fund["bis"])]
            except (KeyError, ValueError, IndexError):
                continue
            if bis <= von:
                continue
            self.live.append({"fund": fund, "von": von, "bis": bis})
            art = fund.get("art")
            tag = (self.tag_hinweis if art == "hinweis"
                   else self.tag_tipp if art in ("tipp", "vorschlag") else self.tag_falsch)
            self.puffer.apply_tag(tag, self.puffer.get_iter_at_offset(von),
                                  self.puffer.get_iter_at_offset(bis))

    def _live_loeschen(self):
        self.live = []
        for tag in (self.tag_falsch, self.tag_tipp, self.tag_hinweis):
            self.puffer.remove_tag(tag, self.puffer.get_start_iter(),
                                   self.puffer.get_end_iter())

    # ===== Klick auf Unterstrichenes =====

    def _eintrag_bei(self, offset):
        for e in self.live:
            if e["von"] <= offset < e["bis"]:
                return e
        return None

    def _offset_bei(self, feld, ex, ey):
        x, y = feld.window_to_buffer_coords(Gtk.TextWindowType.TEXT, int(ex), int(ey))
        gefunden, it = feld.get_iter_at_location(x, y)
        return it.get_offset() if gefunden else None

    def _klick(self, feld, ereignis):
        if ereignis.button != 1 or self.puffer.get_has_selection():
            return False
        off = self._offset_bei(feld, ereignis.x, ereignis.y)
        e = self._eintrag_bei(off) if off is not None else None
        if e:
            self._fund_popover(feld, e)
        return False

    def _rechtsklick_menue(self, feld, menue):
        ereignis = Gtk.get_current_event()
        if ereignis is None:
            return
        _, ex, ey = ereignis.get_coords()
        off = self._offset_bei(feld, ex, ey)
        e = self._eintrag_bei(off) if off is not None else None
        if not e:
            return
        fund = e["fund"]
        if fund.get("neu"):
            eintrag = Gtk.MenuItem(label="Ersetzen durch „%s“" % fund["neu"])
            eintrag.connect("activate", lambda *_: self._uebernehmen(e))
            menue.prepend(eintrag)
            menue.prepend(Gtk.SeparatorMenuItem())
        grund = Gtk.MenuItem(label=fund.get("grund", ""))
        grund.set_sensitive(False)
        menue.prepend(grund)
        menue.show_all()

    def _fund_popover(self, feld, e):
        fund = e["fund"]
        pop = Gtk.Popover.new(feld)
        ort = feld.get_iter_location(self.puffer.get_iter_at_offset(e["von"]))
        x, y = feld.buffer_to_window_coords(Gtk.TextWindowType.TEXT, ort.x, ort.y)
        pop.set_pointing_to(Gdk.Rectangle(x, y, max(ort.width, 8), ort.height))
        kiste = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=8)
        kiste.set_border_width(12)
        grund = Gtk.Label(label=fund.get("grund", ""), xalign=0)
        grund.set_line_wrap(True)
        grund.set_max_width_chars(40)
        kiste.pack_start(grund, False, False, 0)
        if fund.get("neu"):
            alt = fund.get("zeigeAlt") or fund.get("alt", "")
            neu = fund.get("zeigeNeu") or fund["neu"]
            kiste.pack_start(Gtk.Label(label="%s  →  %s" % (alt, neu), xalign=0),
                             False, False, 0)
            knopf = Gtk.Button.new_with_label("Nehmen" if fund.get("art") == "vorschlag" else "Ändern")
            knopf.get_style_context().add_class("suggested-action")
            knopf.connect("clicked", lambda *_: (pop.popdown(), self._uebernehmen(e)))
            kiste.pack_start(knopf, False, False, 0)
        kiste.show_all()
        pop.add(kiste)
        pop.popup()

    # ===== Eine Änderung übernehmen =====

    def _uebernehmen(self, e):
        """Wie uebernimm() der Web-App: prüfen, lernen, ersetzen, grün markieren."""
        fund = e["fund"]
        a = self.puffer.get_iter_at_offset(e["von"])
        b = self.puffer.get_iter_at_offset(e["bis"])
        if self.puffer.get_text(a, b, True) != fund.get("alt"):
            self._liste_neu()                      # Stelle passt nicht mehr
            return
        jetzt = self._text()
        # Die einzige Stelle, an der feststeht, was der Mensch wollte: lernen.
        self.pruefer.js("Gelernt.merkeAenderung(%s);" % json.dumps(fund))
        self._merke_zurueck(jetzt)

        self._intern = True
        von = e["von"]
        self.puffer.delete(a, b)
        self.puffer.insert_with_tags(self.puffer.get_iter_at_offset(von),
                                     fund["neu"], self.tag_gruen)
        self._intern = False
        if self.ki_modus:
            self.eintraege = [x for x in self.eintraege if x is not e]
        self._nach_aenderung()
        if self.eintraege or self.ki_modus:     # eine offene Liste nachziehen
            self._liste_neu()

    # ===== Die Liste der Kästen =====

    def _liste_leeren(self):
        for kind in self.liste.get_children():
            kind.destroy()
        self.eintraege = []
        self.liste_rolle.hide()

    def _liste_neu(self):
        if self.ki_modus:
            self._ki_liste_zeigen()
        else:
            self._korrigieren()

    def _karte(self, e):
        fund = e["fund"]
        art = fund.get("art", "")
        rahmen = Gtk.Box(spacing=10)
        rahmen.get_style_context().add_class("fund")
        rahmen.get_style_context().add_class("fund-" + art)

        kiste = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=2)
        sorte = Gtk.Label(label=SORTEN.get(art, "Sicher falsch"), xalign=0)
        sorte.get_style_context().add_class("fundsorte")
        kiste.pack_start(sorte, False, False, 0)

        if art == "hinweis":
            if fund.get("stelle"):
                s = fund["stelle"]
                s = s if len(s) <= 70 else s[:70].rstrip() + " …"
                kiste.pack_start(self._label("„%s“" % s), False, False, 0)
        elif art == "vorschlag":
            kiste.pack_start(self._label(fund.get("alt", "")), False, False, 0)
            neu = self._label(fund.get("neu", ""))
            neu.get_style_context().add_class("fundrichtig")
            kiste.pack_start(neu, False, False, 0)
        else:
            zeile = Gtk.Box(spacing=6)
            alt = Gtk.Label(label=fund.get("zeigeAlt") or fund.get("alt", ""))
            alt.get_style_context().add_class("fundfalsch")
            neu = Gtk.Label(label=fund.get("zeigeNeu") or fund.get("neu", ""))
            neu.get_style_context().add_class("fundrichtig")
            zeile.pack_start(alt, False, False, 0)
            zeile.pack_start(Gtk.Label(label="→"), False, False, 0)
            zeile.pack_start(neu, False, False, 0)
            kiste.pack_start(zeile, False, False, 0)

        grund = self._label(fund.get("grund", ""))
        grund.get_style_context().add_class("fundgrund")
        kiste.pack_start(grund, False, False, 0)
        rahmen.pack_start(kiste, True, True, 0)

        if art != "hinweis":
            knopf = Gtk.Button.new_with_label("Nehmen" if art == "vorschlag" else "Ändern")
            knopf.set_valign(Gtk.Align.CENTER)
            knopf.get_style_context().add_class("suggested-action")
            knopf.connect("clicked", lambda *_: self._uebernehmen(e))
            rahmen.pack_start(knopf, False, False, 0)
        return rahmen

    def _label(self, text):
        l = Gtk.Label(label=text, xalign=0)
        l.set_line_wrap(True)
        l.set_selectable(True)
        return l

    def _liste_zeigen(self, eintraege, mit_werkzeug=True):
        for kind in self.liste.get_children():
            kind.destroy()
        self.eintraege = eintraege
        for e in eintraege:
            self.liste.pack_start(self._karte(e), False, False, 0)
        if mit_werkzeug and self._ki_da():
            self.liste.pack_start(self._werkzeug_karte(len(eintraege) > 0), False, False, 0)
        self.liste.show_all()
        if eintraege or (mit_werkzeug and self._ki_da()):
            self.liste_rolle.show()
        else:
            self.liste_rolle.hide()

    # ===== Korrigieren: die Kästen =====

    def _korrigieren(self, *_):
        text = self._text()
        self.ki_modus = False
        if not text.strip():
            self._meldung("Es steht noch nichts da.")
            self._liste_leeren()
            return
        if not self.pruefer.bereit:
            self._meldung("Die Prüfung startet noch. Gleich noch einmal drücken.")
            return
        self.pruefer.js("return findeProbleme(%s);" % json.dumps(text),
                        lambda funde: self._funde_da(text, funde))

    def _funde_da(self, text, funde):
        if self._text() != text:
            return
        karte = u16_zu_zeichen(text)
        eintraege = []
        for fund in funde or []:
            try:
                von, bis = karte[int(fund["von"])], karte[int(fund["bis"])]
            except (KeyError, ValueError, IndexError):
                continue
            eintraege.append({"fund": fund, "von": von, "bis": bis})
        self._liste_zeigen(eintraege)
        if not eintraege:
            self._meldung("Nichts gefunden.")
        else:
            self._meldung(self._zusammenfassung([e["fund"] for e in eintraege]))
            self.pruefer.js("Gelernt.merkeGezeigt(%s);" % json.dumps([e["fund"] for e in eintraege]))
        self._danach_pruefen()

    def _zusammenfassung(self, funde):
        hinweise = sum(1 for f in funde if f.get("art") == "hinweis")
        aendern = len(funde) - hinweise
        teile = []
        if aendern:
            teile.append("1 Stelle zum Ändern" if aendern == 1 else "%d Stellen zum Ändern" % aendern)
        if hinweise:
            teile.append("1 Hinweis zum Satzbau" if hinweise == 1 else "%d Hinweise zum Satzbau" % hinweise)
        return " · ".join(teile) + "."

    def _danach_pruefen(self):
        """Steht nichts mehr zum Ändern da, ist der Text fertig."""
        offen = any(e["fund"].get("art") != "hinweis" for e in self.eintraege)
        self._danach_zeigen(not offen)

    def _danach_zeigen(self, sichtbar):
        self.knopf_kopieren.set_visible(sichtbar)
        self.knopf_korrigieren.set_visible(not sichtbar)
        self.knopf_alles.set_visible(not sichtbar)

    # ===== Alles ändern (grün markiert) =====

    def _alles_aendern(self, *_):
        text = self._text()
        if not text.strip():
            self._meldung("Es steht noch nichts da.")
            return
        if not self.pruefer.bereit:
            return
        self.pruefer.js(
            "const e = korrigiereMitStellen(%s);"
            "const h = findeProbleme(e.text).filter(f => f.art === 'hinweis');"
            "return {text: e.text, anzahl: e.anzahl, stellen: e.stellen, hinweise: h};"
            % json.dumps(text), lambda erg: self._alles_da(text, erg))

    def _alles_da(self, vorher, erg):
        if not erg or self._text() != vorher:
            return
        self._liste_leeren()
        self.ki_modus = False
        if erg["anzahl"] > 0:
            self._merke_zurueck(vorher)
            self._setze_text(erg["text"])
            karte = u16_zu_zeichen(erg["text"])
            for st in erg["stellen"]:
                self.puffer.apply_tag(self.tag_gruen,
                                      self.puffer.get_iter_at_offset(karte[st["von"]]),
                                      self.puffer.get_iter_at_offset(karte[st["bis"]]))
        n = erg["anzahl"]
        hinweise = erg.get("hinweise") or []
        if n == 0:
            self._meldung("Nichts zu ändern." if hinweise else "Alles in Ordnung.")
        else:
            self._meldung("1 Stelle verbessert" if n == 1 else "%d Stellen verbessert" % n, gut=True)
        for h in hinweise:
            self.liste.pack_start(self._label_zeile(h.get("grund", "")), False, False, 0)
        if hinweise:
            self.liste.show_all()
            self.liste_rolle.show()
        self._danach_zeigen(n > 0)

    def _label_zeile(self, text):
        l = self._label(text)
        l.set_margin_top(2)
        return l

    # ===== Rückgängig und der Papierkorb =====

    def _merke_zurueck(self, text, im_eimer=False):
        self.vorheriger_text = text
        self.vorheriger_zettel = self.cfg.get("zettel", "") if im_eimer else None
        self.im_eimer = im_eimer
        self.knopf_zurueck.set_visible(not im_eimer)
        self._leeren_anzeigen()

    def _leeren_anzeigen(self):
        pfeil = self.im_eimer and self.vorheriger_text is not None
        self.knopf_leeren.set_image(Gtk.Image.new_from_icon_name(
            "edit-undo-symbolic" if pfeil else "edit-delete-symbolic", Gtk.IconSize.BUTTON))
        self.knopf_leeren.set_tooltip_text("Text zurückholen" if pfeil else "Text löschen")
        ctx = self.knopf_leeren.get_style_context()
        (ctx.remove_class if pfeil else ctx.add_class)("destructive-action")
        self.knopf_leeren.set_visible(bool(self._text()) or pfeil)

    def _vergiss_zurueck(self):
        if self.vorheriger_text is None:
            return
        self.vorheriger_text = None
        self.vorheriger_zettel = None
        self.im_eimer = False
        self.knopf_zurueck.hide()

    def _zurueckholen(self, *_):
        if self.vorheriger_text is None:
            return
        text, zettel = self.vorheriger_text, self.vorheriger_zettel
        self.vorheriger_text = None
        self.vorheriger_zettel = None
        self.im_eimer = False
        self.knopf_zurueck.hide()
        if zettel:
            self.cfg["zettel"] = zettel
            self.pruefer.speicher_schreib("zettel", zettel)
        self._liste_leeren()
        self._danach_zeigen(False)
        self._meldung("")
        self._setze_text(text)

    def _leeren(self, *_):
        if self.im_eimer and self.vorheriger_text is not None:
            self._zurueckholen()
            return
        text = self._text()
        if not text:
            return
        self._liste_leeren()
        self._danach_zeigen(False)
        self._merke_zurueck(text, im_eimer=True)
        self.cfg["zettel"] = ""
        self.pruefer.speicher_schreib("zettel", "")
        self._setze_text("")
        self._meldung("")
        self.feld.grab_focus()

    def _kopieren(self, *_):
        text = self._text().strip()
        if not text:
            self._meldung("Es steht noch nichts da.")
            return
        Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD).set_text(text, -1)
        self._meldung("Text kopiert. Jetzt dort einfügen, wo er hin soll (Strg+V).", gut=True)

    # ===== KI =====

    def _ki_da(self):
        modell = self.cfg.get("modell", "")
        return modell.startswith(OLLAMA_MARKE) or bool(self.cfg.get("apiKey"))

    def _ki_zeigen(self):
        """KI-Knopf in der Kopfzeile nur, wenn ein Weg gangbar ist."""
        vorhanden = self._ki_da()
        self.knopf_ki.set_visible(vorhanden)
        if vorhanden:
            for kind in self.ki_popover.get_children():
                kind.destroy()
            kiste = self._werkzeug_inhalt(False)
            kiste.set_border_width(12)
            kiste.set_size_request(340, -1)
            self.ki_popover.add(kiste)
            kiste.show_all()

    def _werkzeug_karte(self, mit_funden):
        rahmen = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=4)
        rahmen.get_style_context().add_class("fund")
        rahmen.get_style_context().add_class("fund-werkzeug")
        rahmen.pack_start(self._werkzeug_inhalt(mit_funden), False, False, 0)
        return rahmen

    def _werkzeug_inhalt(self, mit_funden):
        kiste = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6)
        lokal = self.cfg.get("modell", "").startswith(OLLAMA_MARKE)
        sorte = Gtk.Label(label="Bleibt auf diesem Rechner" if lokal else "Braucht Internet",
                          xalign=0)
        sorte.get_style_context().add_class("fundsorte")
        titel = Gtk.Label(xalign=0)
        titel.set_markup("<b>%s</b>" % ("Reicht das nicht?" if mit_funden else "Noch etwas damit machen?"))
        kiste.pack_start(sorte, False, False, 0)
        kiste.pack_start(titel, False, False, 0)

        # Für wen?
        kiste.pack_start(Gtk.Label(label="Für wen?", xalign=0), False, False, 0)
        reihe = Gtk.FlowBox()
        reihe.set_selection_mode(Gtk.SelectionMode.NONE)
        reihe.set_max_children_per_line(6)
        gruppe = None
        for name in EMPFAENGER:
            knopf = Gtk.RadioButton.new_with_label_from_widget(gruppe, name)
            gruppe = gruppe or knopf
            knopf.set_mode(False)
            knopf.set_active(name == self.cfg.get("empfaenger", "egal"))
            knopf.connect("toggled", self._empfaenger_gewaehlt, name)
            reihe.add(knopf)
        kiste.pack_start(reihe, False, False, 0)

        # Worum geht’s?
        kiste.pack_start(Gtk.Label(label="Worum geht’s? (freiwillig)", xalign=0), False, False, 0)
        zettel = Gtk.Entry()
        zettel.set_max_length(300)
        zettel.set_placeholder_text("z. B. Widerspruch gegen die Kürzung — kurz und höflich")
        zettel.set_text(str(self.cfg.get("zettel", "")))
        zettel.connect("changed", self._zettel_geaendert)
        kiste.pack_start(zettel, False, False, 0)

        # Die drei Wege
        knoepfe = Gtk.Box(spacing=6, homogeneous=True)
        for beschriftung, tun in (("KI-Korrektur", self._ki_korrektur),
                                  ("Vorschläge", self._ki_vorschlaege),
                                  (self.cfg.get("sprache", "Englisch"), self._ki_uebersetzen)):
            k = Gtk.Button.new_with_label(beschriftung)
            k.connect("clicked", lambda b, f=tun: self._ki_los(f))
            knoepfe.pack_start(k, True, True, 0)
        kiste.pack_start(knoepfe, False, False, 0)
        return kiste

    def _ki_los(self, tun):
        self.ki_popover.popdown()
        tun()

    def _empfaenger_gewaehlt(self, knopf, name):
        if knopf.get_active():
            self.cfg["empfaenger"] = name
            self.pruefer.speicher_schreib("empfaenger", name)

    def _zettel_geaendert(self, eingabe):
        self.cfg["zettel"] = eingabe.get_text()
        self.pruefer.speicher_schreib("zettel", eingabe.get_text())

    def _ki_sperren(self, meldung):
        self.beschaeftigt = True
        self.knopf_ki.set_sensitive(False)
        self._meldung(meldung)

    def _ki_frei(self):
        self.beschaeftigt = False
        self.knopf_ki.set_sensitive(True)

    def _ki_text(self):
        text = self._text().strip()
        if not text:
            self._meldung("Es steht noch kein Text da.")
            return None
        if self.beschaeftigt:
            return None
        return text

    def _ki_ganzer_text(self, anweisung_js, laeuft, fertig):
        text = self._ki_text()
        if text is None:
            return
        self._ki_sperren(laeuft)
        self._liste_leeren()
        self.pruefer.js(
            "const r = await kiAnfrage(%s, %s);"
            "if (r.cent !== null && r.cent !== undefined) merkeKosten(r.cent);"
            "return {ergebnis: r.ergebnis, fehler: r.fehler,"
            " geld: (r.cent !== null && r.cent !== undefined) ? alsGeld(r.cent) : null};"
            % (anweisung_js, json.dumps(text)),
            lambda erg: self._ki_ganz_da(erg, fertig))

    def _ki_ganz_da(self, erg, fertig):
        self._ki_frei()
        if not erg:
            self._meldung("Die KI hat nicht geantwortet.")
            return
        if erg.get("fehler"):
            self._meldung(erg["fehler"])
            return
        self._merke_zurueck(self._text())
        self._setze_text(erg["ergebnis"])
        self._meldung(fertig + (" · " + erg["geld"] if erg.get("geld") else ""), gut=True)

    def _ki_korrektur(self):
        wahl = self.cfg.get("empfaenger", "egal")
        melde = {"Amt": "fürs Amt", "Arbeit": "für die Arbeit", "Freunde": "für Freunde",
                 "Forum": "fürs Forum", "Bewerbung": "für die Bewerbung"}.get(wahl, "")
        fertig = ("Fertig korrigiert" + (" · " + melde if melde else "")
                  + (" · nach deinem Zettel" if self.cfg.get("zettel") else "")
                  + ". Nicht einverstanden? Rückgängig holt den alten Text.")
        self._ki_ganzer_text("kiKorrektur(empfaengerLies(), zettelLies())",
                             "Die KI liest deinen Text … einen Moment.", fertig)

    def _ki_uebersetzen(self):
        sprache = self.cfg.get("sprache", "Englisch")
        self._ki_ganzer_text("kiUebersetzung(%s)" % json.dumps(sprache),
                             "Die KI übersetzt … einen Moment.",
                             "Übersetzt nach %s. Das Deutsche holt Rückgängig wieder." % sprache)

    def _ki_vorschlaege(self):
        text = self._ki_text()
        if text is None:
            return
        self._ki_sperren("Die KI liest deinen Text … einen Moment.")
        self._liste_leeren()
        self.pruefer.js(
            "const t = %s;"
            "const r = await kiAnfrage(kiVorschlagAnweisung(empfaengerLies(), zettelLies()), t, VORSCHLAG_BAUPLAN);"
            "if (r.cent !== null && r.cent !== undefined) merkeKosten(r.cent);"
            "const geld = (r.cent !== null && r.cent !== undefined) ? alsGeld(r.cent) : null;"
            "if (r.fehler) return {fehler: r.fehler};"
            "const roh = leseListe(r.ergebnis);"
            "if (roh === null) return {fehler: 'Die Antwort war nicht zu lesen. Bitte noch einmal versuchen.'};"
            "return {geld, liste: roh.filter(v => v && typeof v.alt === 'string' && typeof v.neu === 'string'"
            " && v.alt !== v.neu && t.includes(v.alt)).map(v => ({alt: v.alt, neu: v.neu, art: 'vorschlag',"
            " grund: String(v.grund || 'Leichter zu lesen.')}))};" % json.dumps(self._text().strip()),
            self._ki_vorschlaege_da)

    def _ki_vorschlaege_da(self, erg):
        self._ki_frei()
        if not erg:
            self._meldung("Die KI hat nicht geantwortet.")
            return
        if erg.get("fehler"):
            self._meldung(erg["fehler"])
            return
        geld = " · " + erg["geld"] if erg.get("geld") else ""
        if not erg["liste"]:
            self._meldung("Die KI hatte nichts zu verbessern." + geld)
            return
        self.ki_modus = True
        self.ki_vorschlaege = erg["liste"]
        self._ki_liste_zeigen()
        self.status.set_text(self.status.get_text() + geld)

    def _ki_liste_zeigen(self):
        """Die Vorschläge suchen ihre Stelle selbst: nach jeder Änderung sitzen
        die übrigen woanders."""
        text = self._text()
        eintraege, belegt = [], []
        for v in sorted(getattr(self, "ki_vorschlaege", []), key=lambda v: text.find(v["alt"])):
            von = text.find(v["alt"])
            if von == -1:
                continue
            bis = von + len(v["alt"])
            if any(von < b and a < bis for a, b in belegt):
                continue
            belegt.append((von, bis))
            eintraege.append({"fund": v, "von": von, "bis": bis})
        self.ki_vorschlaege = [e["fund"] for e in eintraege]
        if not eintraege:
            self._liste_leeren()
            self._meldung("Fertig — alle Vorschläge sind durch.")
            self._danach_zeigen(True)
            return
        self._liste_zeigen(eintraege)
        n = len(eintraege)
        self._meldung("1 Vorschlag. „Nehmen“ setzt ihn ein." if n == 1
                      else "%d Vorschläge. Jeden einzeln mit „Nehmen“ einsetzen." % n)
        self._danach_zeigen(False)

    # ===== Vorlesen =====

    def _vorlesen(self, *_):
        if self.liest:
            basis.vorlesen_beenden()
            self._lesen_ende()
            return
        if self.puffer.get_has_selection():
            a, b = self.puffer.get_selection_bounds()
            text = self.puffer.get_text(a, b, True)
        else:
            text = self._text()
        if not text.strip():
            return
        stimme = self.cfg.get("lesestimme") or ""
        tempo = int(self.cfg.get("lesetempo") or 0)
        if not basis.vorlesen(text, stimme, tempo):
            self._meldung("Keine Stimme gefunden. Bitte speech-dispatcher installieren.")
            return
        self.liest = True
        self.knopf_lesen.set_image(Gtk.Image.new_from_icon_name(
            "media-playback-stop-symbolic", Gtk.IconSize.BUTTON))
        GLib.timeout_add(500, self._lesen_pruefen)

    def _lesen_pruefen(self):
        if not self.liest:
            return False
        lauf = basis.VORLESER.get("lauf")
        if lauf is None or lauf.poll() is not None:
            self._lesen_ende()
            return False
        return True

    def _lesen_ende(self):
        self.liest = False
        self.knopf_lesen.set_image(Gtk.Image.new_from_icon_name(
            "audio-volume-high-symbolic", Gtk.IconSize.BUTTON))

    # ===== Einstellungen =====

    def _einstellungen_oeffnen(self, *_):
        self.einstellungen.aktualisieren()
        self.stapel.set_visible_child_name("einst")
        self.kopf.set_title("Einstellungen")
        self.kopf.set_subtitle("")
        for k in (self.knopf_lesen, self.knopf_einst, self.knopf_ki):
            k.hide()
        self.knopf_zu.show()

    def _einstellungen_schliessen(self, *_):
        self.einstellungen._schluessel_verbergen()
        self.stapel.set_visible_child_name("text")
        self.kopf.set_title("Schreibhilfe")
        self.kopf.set_subtitle("Findet, was der Rechtschreibprüfer übersieht")
        self.knopf_zu.hide()
        self.knopf_lesen.show()
        self.knopf_einst.show()
        self.knopf_ki.set_visible(self._ki_da())
        self.feld.grab_focus()

    def _taste(self, _w, ereignis):
        if ereignis.keyval == Gdk.KEY_Escape and self.stapel.get_visible_child_name() == "einst":
            self._einstellungen_schliessen()
            return True
        return False

    def cfg_setzen(self, name, wert):
        """Ein Wert für alle: Speicher der Web-App und dieser Stand."""
        self.cfg[name] = wert
        if wert in (None, ""):
            self.pruefer.speicher_loesch(name)
        else:
            self.pruefer.speicher_schreib(name, wert)
        if name in ("apiKey", "modell"):
            self._ki_zeigen()
        elif name == "sprache":
            self._ki_zeigen()
        elif name == "wortmarker":
            self._wort_markieren()

    def _beenden(self, *_):
        self._speichern()
        basis.vorlesen_beenden()


# ---------- Das Einstellungsfenster ----------

class Einstellungen(Gtk.ScrolledWindow):
    """Eine Seite im Hauptfenster — kein zweites Fenster."""

    def __init__(self, haupt):
        super().__init__()
        self.haupt = haupt
        self.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
        self._lade = False
        self.schluessel_wecker = None

        kiste = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6)
        kiste.set_border_width(16)
        self.add(kiste)

        # --- KI-Werkzeuge ---
        kiste.pack_start(self._titel("KI-Werkzeuge"), False, False, 0)
        kiste.pack_start(Gtk.Label(label="API-Schlüssel (für Korrigieren und Übersetzen)",
                                   xalign=0), False, False, 0)
        self.schluessel = Gtk.Entry()
        self.schluessel.set_visibility(False)
        self.schluessel.set_placeholder_text("sk-ant-…")
        self.schluessel.connect("changed", self._schluessel_geaendert)
        kiste.pack_start(self.schluessel, False, False, 0)
        self.schluessel_stand = self._hinweis("")
        kiste.pack_start(self.schluessel_stand, False, False, 0)
        reihe = Gtk.Box(spacing=6)
        self.knopf_zeigen = Gtk.Button.new_with_label("Anzeigen")
        self.knopf_zeigen.connect("clicked", self._schluessel_zeigen)
        kopieren = Gtk.Button.new_with_label("Kopieren")
        kopieren.connect("clicked", self._schluessel_kopieren)
        weg = Gtk.Button.new_with_label("Schlüssel löschen")
        weg.connect("clicked", lambda *_: self.schluessel.set_text(""))
        reihe.pack_start(self.knopf_zeigen, False, False, 0)
        reihe.pack_start(kopieren, False, False, 0)
        reihe.pack_start(weg, False, False, 0)
        reihe.pack_end(Gtk.LinkButton.new_with_label(
            "https://platform.claude.com/settings/keys", "Schlüssel erstellen ↗"), False, False, 0)
        kiste.pack_start(reihe, False, False, 0)

        kiste.pack_start(Gtk.Label(label="Modell", xalign=0), False, False, 0)
        self.modell = Gtk.ComboBoxText()
        self.modell.connect("changed", self._modell_gewaehlt)
        kiste.pack_start(self.modell, False, False, 0)
        self.modell_hinweis = self._hinweis("")
        kiste.pack_start(self.modell_hinweis, False, False, 0)

        self.kosten = self._hinweis("")
        kiste.pack_start(self.kosten, False, False, 0)
        self.kosten_weg = Gtk.Button.new_with_label("Zähler zurücksetzen")
        self.kosten_weg.set_halign(Gtk.Align.START)
        self.kosten_weg.connect("clicked", self._kosten_weg)
        kiste.pack_start(self.kosten_weg, False, False, 0)

        kiste.pack_start(Gtk.Label(label="Übersetzen nach", xalign=0), False, False, 0)
        self.sprache = Gtk.ComboBoxText()
        for s in SPRACHEN:
            self.sprache.append_text(s)
        self.sprache.connect("changed", lambda c: self._lade or haupt.cfg_setzen(
            "sprache", c.get_active_text()))
        kiste.pack_start(self.sprache, False, False, 0)

        # --- Vorlesen ---
        self.vorlesen_gruppe = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6)
        self.vorlesen_gruppe.pack_start(self._titel("Vorlesen"), False, False, 0)
        self.vorlesen_gruppe.pack_start(Gtk.Label(label="Stimme", xalign=0), False, False, 0)
        self.stimme = Gtk.ComboBoxText()
        self.stimmen = basis.piper_stimmen()
        self.stimme.append("", "Standardstimme")
        for s in self.stimmen:
            self.stimme.append(s["kennung"], s["name"])
        self.stimme.connect("changed", lambda c: self._lade or haupt.cfg_setzen(
            "lesestimme", c.get_active_id() or ""))
        self.vorlesen_gruppe.pack_start(self.stimme, False, False, 0)
        self.vorlesen_gruppe.pack_start(Gtk.Label(label="Tempo", xalign=0), False, False, 0)
        zeile = Gtk.Box(spacing=8)
        self.tempo = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, -60, 60, 10)
        self.tempo.set_draw_value(False)
        self.tempo.set_hexpand(True)
        self.tempo.connect("value-changed", self._tempo_geaendert)
        self.tempo_stand = Gtk.Label(label="normal")
        zeile.pack_start(self.tempo, True, True, 0)
        zeile.pack_start(self.tempo_stand, False, False, 0)
        self.vorlesen_gruppe.pack_start(zeile, False, False, 0)
        probe = Gtk.Button.new_with_label("Stimme anhören")
        probe.set_halign(Gtk.Align.START)
        probe.connect("clicked", self._probe)
        self.vorlesen_gruppe.pack_start(probe, False, False, 0)
        kiste.pack_start(self.vorlesen_gruppe, False, False, 0)

        # --- Anzeige ---
        kiste.pack_start(self._titel("Anzeige"), False, False, 0)
        self.marker = Gtk.CheckButton(label="Wort unter dem Cursor hervorheben")
        self.marker.connect("toggled", lambda c: self._lade or haupt.cfg_setzen(
            "wortmarker", c.get_active()))
        kiste.pack_start(self.marker, False, False, 0)
        self.live = Gtk.CheckButton(label="Fehler beim Schreiben unterstreichen")
        self.live.connect("toggled", self._live_umschalten)
        kiste.pack_start(self.live, False, False, 0)

        schrift = Gtk.Box(spacing=6)
        schrift.pack_start(Gtk.Label(label="Schriftgröße", xalign=0), True, True, 0)
        self.schrift_stand = Gtk.Label()
        klein = Gtk.Button.new_with_label("A−")
        gross = Gtk.Button.new_with_label("A+")
        klein.connect("clicked", lambda *_: self._schrift(-1))
        gross.connect("clicked", lambda *_: self._schrift(+1))
        schrift.pack_start(klein, False, False, 0)
        schrift.pack_start(self.schrift_stand, False, False, 0)
        schrift.pack_start(gross, False, False, 0)
        kiste.pack_start(schrift, False, False, 0)

        design = Gtk.Box(spacing=6)
        design.pack_start(Gtk.Label(label="Design", xalign=0), True, True, 0)
        self.design = Gtk.ComboBoxText()
        for k, n in (("system", "Wie das System"), ("hell", "Hell"), ("dunkel", "Dunkel")):
            self.design.append(k, n)
        self.design.connect("changed", self._design_gewaehlt)
        design.pack_start(self.design, False, False, 0)
        kiste.pack_start(design, False, False, 0)

        # --- Gedächtnis ---
        kiste.pack_start(self._titel("Gedächtnis"), False, False, 0)
        self.gelernt = self._hinweis("")
        kiste.pack_start(self.gelernt, False, False, 0)
        reihe = Gtk.Box(spacing=6)
        self.gelernt_weg = Gtk.Button.new_with_label("Vergessen")
        self.gelernt_weg.connect("clicked", self._gelernt_weg)
        sichern = Gtk.Button.new_with_label("Sichern (kopieren)")
        sichern.connect("clicked", self._sichern)
        einspielen = Gtk.Button.new_with_label("Einspielen …")
        einspielen.connect("clicked", self._einspielen)
        for k in (self.gelernt_weg, sichern, einspielen):
            reihe.pack_start(k, False, False, 0)
        kiste.pack_start(reihe, False, False, 0)
        self.einspiel_kiste = Gtk.Revealer()
        eb = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6)
        eb.pack_start(Gtk.Label(label="Sicherungs-Text vom anderen Gerät hier einfügen:",
                                xalign=0), False, False, 0)
        self.einspiel_feld = Gtk.TextView()
        self.einspiel_feld.set_wrap_mode(Gtk.WrapMode.CHAR)
        er = Gtk.ScrolledWindow()
        er.set_shadow_type(Gtk.ShadowType.IN)
        er.set_min_content_height(90)
        er.add(self.einspiel_feld)
        eb.pack_start(er, False, False, 0)
        ok = Gtk.Button.new_with_label("Einspielen")
        ok.set_halign(Gtk.Align.START)
        ok.get_style_context().add_class("suggested-action")
        ok.connect("clicked", self._einspielen_los)
        eb.pack_start(ok, False, False, 0)
        self.einspiel_kiste.add(eb)
        kiste.pack_start(self.einspiel_kiste, False, False, 0)
        self.gelernt_meldung = self._hinweis("")
        kiste.pack_start(self.gelernt_meldung, False, False, 0)

        self.show_all()
        self.einspiel_kiste.show_all()

    def _titel(self, text):
        l = Gtk.Label(label=text, xalign=0)
        l.get_style_context().add_class("gruppe-titel")
        return l

    def _hinweis(self, text):
        l = Gtk.Label(label=text, xalign=0)
        l.set_line_wrap(True)
        l.set_max_width_chars(60)
        l.get_style_context().add_class("fusszeile-hinweis")
        return l

    # ----- Werte laden -----

    def aktualisieren(self):
        cfg = self.haupt.cfg
        self._lade = True
        self.schluessel.set_text(cfg.get("apiKey", ""))
        self._schluessel_verbergen()
        self._schluessel_stand()
        self.sprache.set_active(SPRACHEN.index(cfg["sprache"]) if cfg.get("sprache") in SPRACHEN else 0)
        self.stimme.set_active_id(cfg.get("lesestimme") or "")
        if self.stimme.get_active_id() is None:
            self.stimme.set_active_id("")
        self.tempo.set_value(int(cfg.get("lesetempo") or 0))
        self._tempo_text()
        self.marker.set_active(bool(cfg.get("wortmarker", True)))
        self.live.set_active(bool(self.haupt.ui.get("live", True)))
        self.schrift_stand.set_text("%d" % int(self.haupt.ui.get("schrift", 15)))
        self.design.set_active_id(self.haupt.ui.get("design", "system"))
        self._lade = False
        self._modelle_laden()
        self._kosten_laden()
        self._gelernt_laden()

    def _modelle_laden(self):
        gewaehlt = self.haupt.cfg.get("modell", "claude-opus-5")
        self._lade = True
        self.modell.remove_all()
        for wert, name in CLAUDE_MODELLE:
            self.modell.append(wert, name)
        self.modell.set_active_id(gewaehlt if not gewaehlt.startswith(OLLAMA_MARKE) else None)
        self._lade = False

        def lokal(namen):
            namen = list(namen or [])
            if gewaehlt.startswith(OLLAMA_MARKE) and gewaehlt[len(OLLAMA_MARKE):] not in namen:
                namen.insert(0, gewaehlt[len(OLLAMA_MARKE):])
            self._lade = True
            for n in namen:
                self.modell.append(OLLAMA_MARKE + n, "Auf diesem Rechner: " + n)
            self.modell.set_active_id(gewaehlt)
            self._lade = False
            self._modell_hinweis(not namen)
        self.haupt.pruefer.js(
            "try { return await ollamaModelle(); } catch (e) { return []; }", lokal)

    def _modell_hinweis(self, nichts):
        modell = self.haupt.cfg.get("modell", "")
        if modell.startswith(OLLAMA_MARKE):
            t = ("Läuft auf diesem Rechner: kostenlos, ohne Internet, der Text bleibt hier. "
                 "Dauert länger und korrigiert gröber als Claude.")
        elif nichts:
            t = ("Auf diesem Rechner wurde kein Modell gefunden. Läuft Ollama? "
                 "Im Terminal: ollama serve")
        else:
            t = ("Läuft im Netz: braucht Schlüssel und Guthaben, dafür genauer und "
                 "in Sekunden fertig.")
        self.modell_hinweis.set_text(t)

    def _modell_gewaehlt(self, combo):
        if self._lade:
            return
        wert = combo.get_active_id()
        if wert:
            self.haupt.cfg_setzen("modell", wert)
            self._modell_hinweis(False)

    def _kosten_laden(self):
        def da(k):
            k = k or {"anzahl": 0, "cent": 0}
            n = int(k.get("anzahl", 0))
            if n == 0:
                self.kosten.set_text("Noch nichts verbraucht.")
            else:
                self.kosten.set_text("Bisher: %d %s · %s (US)" % (
                    n, "Anfrage" if n == 1 else "Anfragen", alt_geld(float(k.get("cent", 0)))))
            self.kosten_weg.set_visible(n > 0)
        self.haupt.pruefer.js("return Speicher.lies('kosten', {anzahl: 0, cent: 0});", da)

    def _kosten_weg(self, *_):
        self.haupt.pruefer.speicher_loesch("kosten")
        self.kosten.set_text("Noch nichts verbraucht.")
        self.kosten_weg.hide()

    # ----- Schlüssel -----

    def _schluessel_geaendert(self, eintrag):
        if self._lade:
            return
        self.haupt.cfg_setzen("apiKey", eintrag.get_text().strip())
        self._schluessel_stand()

    def _schluessel_stand(self):
        s = self.haupt.cfg.get("apiKey", "")
        if not s:
            self.schluessel_stand.set_text("Kein Schlüssel gespeichert — deshalb fehlt der KI-Knopf.")
            return
        kurz = s[:11] + "…" + s[-4:]
        t = "Gespeichert: %s · %d Zeichen" % (kurz, len(s))
        if not s.startswith("sk-ant-"):
            t += " — beginnt nicht mit „sk-ant-“. Das sieht nicht nach einem Anthropic-Schlüssel aus."
        self.schluessel_stand.set_text(t)

    def _schluessel_zeigen(self, *_):
        if self.schluessel.get_visibility():
            self._schluessel_verbergen()
            return
        if not self.schluessel.get_text():
            self.schluessel_stand.set_text("Es ist kein Schlüssel gespeichert.")
            return
        self.schluessel.set_visibility(True)
        self.knopf_zeigen.set_label("Verbergen")
        if self.schluessel_wecker:
            GLib.source_remove(self.schluessel_wecker)
        self.schluessel_wecker = GLib.timeout_add_seconds(15, self._schluessel_verbergen)

    def _schluessel_verbergen(self):
        if self.schluessel_wecker:
            GLib.source_remove(self.schluessel_wecker)
            self.schluessel_wecker = None
        self.schluessel.set_visibility(False)
        self.knopf_zeigen.set_label("Anzeigen")
        return False

    def _schluessel_kopieren(self, *_):
        s = self.schluessel.get_text().strip()
        if not s:
            self.schluessel_stand.set_text("Es ist kein Schlüssel gespeichert.")
            return
        Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD).set_text(s, -1)
        self.schluessel_stand.set_text(
            "Schlüssel kopiert. Auf dem anderen Gerät einfügen — und die Zwischenablage "
            "danach mit etwas anderem überschreiben.")

    # ----- Vorlesen -----

    def _tempo_text(self):
        w = int(self.tempo.get_value())
        self.tempo_stand.set_text("normal" if w == 0 else ("schneller" if w > 0 else "langsamer"))

    def _tempo_geaendert(self, scale):
        self._tempo_text()
        if not self._lade:
            self.haupt.cfg_setzen("lesetempo", int(scale.get_value()))

    def _probe(self, *_):
        basis.vorlesen("Guten Tag. So klingt die Stimme beim Vorlesen.",
                       self.haupt.cfg.get("lesestimme") or "",
                       int(self.haupt.cfg.get("lesetempo") or 0))

    # ----- Anzeige -----

    def _live_umschalten(self, schalter):
        if self._lade:
            return
        self.haupt.ui["live"] = schalter.get_active()
        self.haupt._ui_schreiben()
        self.haupt._live_planen()

    def _schrift(self, schritt):
        g = max(10, min(32, int(self.haupt.ui.get("schrift", 15)) + schritt))
        self.haupt.ui["schrift"] = g
        self.haupt._ui_schreiben()
        self.haupt.schrift_anwenden()
        self.schrift_stand.set_text("%d" % g)

    def _design_gewaehlt(self, combo):
        if self._lade:
            return
        self.haupt.ui["design"] = combo.get_active_id() or "system"
        self.haupt._ui_schreiben()
        self.haupt.design_anwenden()

    # ----- Gedächtnis -----

    def _gelernt_laden(self):
        def da(s):
            s = s or {"woerter": 0, "inRuhe": 0}
            teile = []
            if s["woerter"]:
                teile.append("1 eigene Schreibweise" if s["woerter"] == 1
                             else "%d eigene Schreibweisen" % s["woerter"])
            if s["inRuhe"]:
                teile.append("1 Wort in Ruhe gelassen" if s["inRuhe"] == 1
                             else "%d Wörter in Ruhe gelassen" % s["inRuhe"])
            self.gelernt.set_text(" · ".join(teile) if teile else
                                  "Noch nichts gelernt. Jedes „Ändern“ bringt der App etwas bei.")
            self.gelernt_weg.set_visible(bool(teile))
        self.haupt.pruefer.js("return Gelernt.stand();", da)

    def _gelernt_weg(self, *_):
        self.haupt.pruefer.js("Gelernt.leeren();")
        self._gelernt_laden()

    def _sichern(self, *_):
        def da(erg):
            if not erg or not erg.get("text"):
                self.gelernt_meldung.set_text("Noch nichts gelernt — es gibt nichts zu sichern.")
                return
            Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD).set_text(erg["text"], -1)
            self.gelernt_meldung.set_text(
                "Gedächtnis kopiert. Auf dem anderen Gerät „Einspielen“ drücken.")
        self.haupt.pruefer.js(
            "const s = Gelernt.stand(); if (!s.woerter && !s.inRuhe) return {text: null};"
            "return {text: sicherungBauen()};", da)

    def _einspielen(self, *_):
        self.einspiel_kiste.set_reveal_child(not self.einspiel_kiste.get_reveal_child())
        if self.einspiel_kiste.get_reveal_child():
            self.einspiel_feld.grab_focus()

    def _einspielen_los(self, *_):
        puffer = self.einspiel_feld.get_buffer()
        roh = puffer.get_text(puffer.get_start_iter(), puffer.get_end_iter(), True)
        if not roh.strip():
            return

        def da(erg):
            if not erg:
                return
            if erg.get("fehler"):
                self.gelernt_meldung.set_text(erg["fehler"])
                return
            puffer.set_text("")
            self.einspiel_kiste.set_reveal_child(False)
            self.gelernt_meldung.set_text(
                "Eingespielt: %d Schreibweisen, %d Wörter in Ruhe. Was hier schon stand, "
                "blieb erhalten." % (erg["neueWoerter"], erg["neueRuhe"]))
            self.haupt._bereit()                  # Einstellungen neu einlesen
            self.aktualisieren()
        self.haupt.pruefer.js("return sicherungEinspielen(%s);" % json.dumps(roh), da)


def main():
    if not os.path.isfile(os.path.join(basis.WEB, "index.html")):
        print("Die App liegt nicht neben diesem Programm: %s" % basis.WEB, file=sys.stderr)
        return 1
    port = basis.server_starten()
    os.makedirs(DATEN, exist_ok=True)
    os.makedirs(basis.ZWISCHEN, exist_ok=True)

    app = Gtk.Application(application_id="de.schreibhilfe.native")
    app.fenster = None

    def aktivieren(app):
        f = app.fenster
        if f is None:
            f = app.fenster = Fenster(port)
            app.add_window(f)
            f.show_all()
            # show_all blendet auch verborgene Teile ein — Zustand neu setzen.
            f.knopf_zurueck.set_visible(f.vorheriger_text is not None and not f.im_eimer)
            f.knopf_kopieren.hide()
            f.liste_rolle.hide()
            f.vorschlag_leiste.hide()
            f.knopf_ki.hide()
            f.knopf_zu.hide()
            f.stapel.set_visible_child_name("text")
            f._leeren_anzeigen()
            f.present()
            return
        # Zweiter Start (Icon, Tastenkürzel): sichtbar und vorn → wegklappen,
        # sonst nach vorn holen.
        if f.get_visible() and f.is_active():
            f.iconify()
        else:
            f.deiconify()
            f.present()

    app.connect("activate", aktivieren)
    return app.run([sys.argv[0]])


if __name__ == "__main__":
    sys.exit(main())
