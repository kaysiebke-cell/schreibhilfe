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
import os
import socket
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


class Leise(http.server.SimpleHTTPRequestHandler):
    """Wie der eingebaute Server, nur ohne Zeile für jede Datei."""

    def log_message(self, format, *args):                   # noqa: A002
        pass


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
