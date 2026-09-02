#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Die Schreibhilfe als eigenes Fenster — ohne Browser drumherum.

Am Handy steckt dieselbe Web-App in einem Android-Rahmen (siehe android/).
Das hier ist derselbe Gedanke für den PC: ein Fenster, eine Anzeigefläche,
dieselben Dateien aus online/. Kein zweiter Nachbau.

Warum überhaupt, wo doch ein Chrome-Fenster reicht?

  · Chrome lässt eine Seite, die aus dem Internet kommt, nicht an einen Dienst
    auf dem eigenen Rechner heran. Genau das braucht Ollama. Hier kommt die
    Seite von 127.0.0.1 — damit entfällt die Sperre.
  · Was in Chrome gespeichert ist, hängt an der Netz-Adresse. Ein Update der
    veröffentlichten Seite kann es also nicht kaputtmachen, ein Wechsel des
    Browsers verliert es aber. Dieses Fenster hat sein eigenes, festes
    Verzeichnis und ist von beidem unabhängig.
  · Und es zeigt immer den Stand aus dem eigenen Ordner, nicht den zuletzt
    veröffentlichten.

Der kleine Webserver läuft nur, solange das Fenster offen ist. Er hört
ausschließlich auf 127.0.0.1 — von außen ist nichts zu erreichen.
"""

import functools
import http.server
import json
import os
import shutil
import socket
import subprocess
import sys
import threading

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("WebKit2", "4.1")
from gi.repository import GLib, Gtk, WebKit2                # noqa: E402

# Ohne diese Zeile heißt das Fenster für den Arbeitsplatz „schreibhilfe.py“.
# Dann findet der Menüeintrag sein eigenes Fenster nicht wieder, und in der
# Leiste steht das Programm zweimal: einmal als Symbol, einmal als Fenster.
GLib.set_prgname("schreibhilfe")

HIER = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(os.path.dirname(HIER), "online")

# Fester Port, damit die Adresse gleich bleibt: An ihr hängt der Speicher der
# App. Ein wechselnder Port hieße jedes Mal ein leeres Gedächtnis.
PORT = 8321

# Eigener Platz für das, was sich die App merkt — Schriftgröße, Thema,
# gelernte Wörter, der Text im Feld.
DATEN = os.path.expanduser("~/.local/share/schreibhilfe")
ZWISCHEN = os.path.expanduser("~/.cache/schreibhilfe")


# Was gerade vorgelesen wird — damit ein zweiter Antipp es anhalten kann.
VORLESER = {"lauf": None, "rechner": None}

# Eine Stimme, die nicht nach Maschine klingt.
#
# speech-dispatcher spricht hier über espeak-ng, und das ist ein
# Formantsynthesizer: Er rechnet Laute zusammen, statt sie aus Aufnahmen zu
# setzen. Er KANN nicht menschlich klingen — das ist Bauart, nicht Einstellung.
# Wer sich seinen Brief vorlesen lässt, um Fehler zu hören, hört sonst vor
# allem espeak.
#
# Piper ist ein neuronaler Synthesizer, läuft offline auf der CPU und braucht
# für viereinhalb Sekunden Ton eine Viertelsekunde. Er liegt außerhalb des
# Projekts unter ~/.local/share/schreibhilfe/piper — 90 MB gehören nicht ins
# Repo. Ist er da, spricht er; sonst bleibt es bei spd-say.
PIPER_ORT = os.path.expanduser("~/.local/share/schreibhilfe/piper")
PIPER = os.path.join(PIPER_ORT, "piper", "piper")
PIPER_STIMME = os.path.join(PIPER_ORT, "de_DE-thorsten-medium.onnx")


def piper_da():
    """Ist die gute Stimme eingerichtet — und lässt sie sich abspielen?"""
    return bool(os.path.isfile(PIPER) and os.access(PIPER, os.X_OK)
                and os.path.isfile(PIPER_STIMME)
                and (shutil.which("paplay") or shutil.which("aplay")))


def vorlesen_mit_piper(text):
    """Piper schreibt rohen Ton, das Abspielprogramm nimmt ihn direkt entgegen.

    Über eine Zwischendatei zu gehen hieße: erst den ganzen Brief rechnen, dann
    anfangen. So beginnt der Ton nach dem ersten Satz.
    """
    rate = "22050"      # steht so in de_DE-thorsten-medium.onnx.json
    if shutil.which("paplay"):
        abspielen = ["paplay", "--raw", "--rate=" + rate,
                     "--format=s16le", "--channels=1"]
    else:
        abspielen = ["aplay", "-q", "-r", rate, "-f", "S16_LE", "-c", "1",
                     "-t", "raw", "-"]

    sprechen = subprocess.Popen(
        [PIPER, "--model", PIPER_STIMME, "--output_raw"],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL, start_new_session=True)
    ton = subprocess.Popen(abspielen, stdin=sprechen.stdout,
                           stderr=subprocess.DEVNULL, start_new_session=True)
    # Sonst bekäme piper kein SIGPIPE, wenn das Abspielen abbricht.
    sprechen.stdout.close()

    def fuettern():
        try:
            sprechen.stdin.write(text.encode("utf-8"))
            sprechen.stdin.close()
        except (OSError, ValueError):
            pass

    threading.Thread(target=fuettern, daemon=True).start()
    VORLESER["lauf"] = ton
    VORLESER["rechner"] = sprechen
    return True


def vorlesen(text):
    """Liest den Text laut vor, über den Sprachdienst des Arbeitsplatzes.

    Im Browser gibt es dafür speechSynthesis. WebKitGTK bringt das nicht mit —
    in diesem Fenster gäbe es die Sprachausgabe also gar nicht, ausgerechnet
    dort, wo ein längerer Brief geschrieben wird. Über einen Fehler liest das
    Auge hinweg; das Ohr stolpert darüber. Deshalb hier derselbe Weg wie im
    Schreibprogramm: spd-say.
    """
    vorlesen_beenden()

    if not piper_da() and not shutil.which("spd-say"):
        return False

    # Nicht endlos: Der Dienst nimmt ohnehin nur begrenzt viel auf einmal.
    text = text.strip()[:20000]
    if not text:
        return False

    if piper_da():
        return vorlesen_mit_piper(text)

    VORLESER["lauf"] = subprocess.Popen(
        ["spd-say", "-l", "de", "-w", text], start_new_session=True)
    return True


def vorlesen_beenden():
    """Hält das Vorlesen an — auch das, was noch in der Warteschlange steht."""
    # Bei Piper sind es zwei Prozesse: einer rechnet, einer spielt ab. Nur den
    # zweiten anzuhalten hieße, dass der erste weiterrechnet.
    for schluessel in ("lauf", "rechner"):
        vorgang = VORLESER.get(schluessel)
        VORLESER[schluessel] = None
        if vorgang and vorgang.poll() is None:
            try:
                vorgang.terminate()
                # Abholen, sonst bleibt ein Zombie stehen, bis zufällig das
                # nächste Vorlesen ihn einsammelt.
                vorgang.wait(timeout=2)
            except (OSError, subprocess.SubprocessError):
                pass
    if shutil.which("spd-say"):
        try:
            subprocess.run(["spd-say", "-C"], timeout=5)     # Warteschlange leeren
        except (OSError, subprocess.SubprocessError):
            pass


class Leise(http.server.SimpleHTTPRequestHandler):
    """Wie der eingebaute Server, nur ohne Zeile für jede Datei.

    Dazu die eine Auskunft, die eine Webseite nicht selbst geben kann: ob auf
    diesem Rechner jemand sprechen kann, und wenn ja, das Sprechen selbst.
    """

    def log_message(self, format, *args):                   # noqa: A002
        pass

    def _antworte(self, inhalt):
        roh = json.dumps(inhalt).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(roh)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(roh)

    def do_GET(self):
        if self.path == "/kann-vorlesen":
            self._antworte({"ja": piper_da() or bool(shutil.which("spd-say")),
                            "gut": piper_da()})
            return
        if self.path == "/vorlesen-stopp":
            vorlesen_beenden()
            self._antworte({"ja": True})
            return
        super().do_GET()

    def do_POST(self):
        if self.path != "/vorlesen":
            self.send_error(404)
            return
        laenge = int(self.headers.get("Content-Length") or 0)
        roh = self.rfile.read(laenge).decode("utf-8", "replace")
        try:
            text = json.loads(roh).get("text", "")
        except ValueError:
            text = ""
        self._antworte({"ja": vorlesen(text)})


def server_starten():
    """Gibt den Port zurück, auf dem geliefert wird.

    Läuft schon ein Fenster, ist der Port belegt — dann liefert eben jenes,
    und dieses hier hängt sich nur mit an. Zwei Fenster auf derselben Adresse
    teilen sich damit auch denselben Speicher, was richtig ist: Es ist
    dieselbe App.
    """
    with socket.socket() as probe:
        if probe.connect_ex(("127.0.0.1", PORT)) == 0:
            return PORT                                     # liefert schon wer

    aufgabe = functools.partial(Leise, directory=WEB)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), aufgabe)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return PORT


def main():
    if not os.path.isfile(os.path.join(WEB, "index.html")):
        print("Die App liegt nicht neben diesem Programm: %s" % WEB, file=sys.stderr)
        return 1

    port = server_starten()

    os.makedirs(DATEN, exist_ok=True)
    os.makedirs(ZWISCHEN, exist_ok=True)
    speicher = WebKit2.WebsiteDataManager(base_data_directory=DATEN,
                                          base_cache_directory=ZWISCHEN)
    umgebung = WebKit2.WebContext.new_with_website_data_manager(speicher)

    ansicht = WebKit2.WebView.new_with_context(umgebung)
    einst = ansicht.get_settings()
    # Kein Rechtsklick-Menü mit „Untersuchen“: Das ist ein Schreibprogramm,
    # keine Werkbank.
    einst.set_enable_developer_extras(False)
    einst.set_enable_write_console_messages_to_stdout(False)
    # Damit die App merkt, dass sie in einem eigenen Fenster läuft und nicht
    # im Browser. Sie schaltet dann den Dienstarbeiter ab — der ist hier nicht
    # nur überflüssig (die Dateien liegen ja auf der Platte), sondern
    # schädlich: Sein Zwischenspeicher überlebte jede Änderung am Ordner, und
    # das Fenster zeigte tagelang eine alte Fassung. Genau dafür gibt es die
    # Kennung schon in der Android-App.
    einst.set_user_agent(einst.get_user_agent() + " Schreibhilfe/1.0")

    fenster = Gtk.Window(title="Schreibhilfe")
    fenster.set_default_size(1000, 780)
    symbol = os.path.expanduser("~/.local/share/icons/schreibhilfe.png")
    if os.path.isfile(symbol):
        fenster.set_icon_from_file(symbol)
    fenster.add(ansicht)
    fenster.connect("destroy", Gtk.main_quit)

    ansicht.load_uri("http://localhost:%d/" % port)
    fenster.show_all()
    Gtk.main()
    return 0


if __name__ == "__main__":
    sys.exit(main())
