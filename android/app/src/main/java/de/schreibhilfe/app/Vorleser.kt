package de.schreibhilfe.app

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

/**
 * Die Brücke zur Stimme des Handys.
 *
 * Am PC und in Chrome bringt der Browser die Stimmen selbst mit; die Web-App
 * fragt sie über `speechSynthesis.getVoices()` ab. Eine Android-WebView kennt
 * diese Schnittstelle zwar, hat aber keine einzige Stimme dahinter — die Liste
 * bleibt immer leer.
 *
 * Die Web-App zieht daraus den richtigen Schluss und blendet das ganze
 * Vorlesen aus: Ein Knopf, der beim Antippen nichts tut, ist schlimmer als
 * keiner. Nur sah es in der App dadurch so aus, als fehle die Neuerung — die
 * Dateien in der APK waren die richtigen, die Stimme fehlte.
 *
 * Android selbst kann sprechen, über TextToSpeech. Diese Klasse reicht das in
 * die Webseite durch und ist damit der dritte Weg zur Stimme, neben dem
 * Browser und dem Sprachdienst am Linux-Rechner.
 *
 * Die Stimmen stehen nicht sofort bereit: TextToSpeech meldet sich erst, wenn
 * es fertig eingerichtet ist. Deshalb sagt diese Klasse der Webseite Bescheid,
 * sobald es so weit ist — dasselbe Muster wie „voiceschanged" im Browser.
 */
class Vorleser(ctx: Context, private val webView: WebView) {

    private val amHauptfaden = Handler(Looper.getMainLooper())

    /** Steht erst nach dem Einrichten auf true. Vorher gibt es nichts zu holen. */
    private var bereit = false

    private var stimme: TextToSpeech? = null

    init {
        /* Der Rückruf kommt aus einem fremden Faden; alles Weitere gehört auf
           den Hauptfaden, weil es die WebView anfasst. */
        stimme = TextToSpeech(ctx.applicationContext) { ergebnis ->
            amHauptfaden.post {
                bereit = ergebnis == TextToSpeech.SUCCESS
                if (bereit) {
                    runCatching { stimme?.language = Locale.GERMAN }
                    stimme?.setOnUtteranceProgressListener(zuhoerer)
                }
                /* Auch ein Fehlschlag wird gemeldet: Dann bleibt die Liste leer,
                   die Gruppe bleibt aus, und niemand wartet auf etwas, das nicht
                   kommt. */
                melde("stimmen-da")
            }
        }
    }

    /**
     * Meldet zurück, wenn der letzte Satz gesprochen ist — daraufhin heißt der
     * Knopf drüben wieder „Vorlesen" statt „Anhalten".
     */
    private val zuhoerer = object : UtteranceProgressListener() {
        override fun onStart(id: String?) = Unit

        override fun onDone(id: String?) {
            if (id == ENDE) melde("vorlesen-fertig")
        }

        @Deprecated("Von Android so vorgesehen; die neue Fassung ruft die andere.")
        override fun onError(id: String?) {
            melde("vorlesen-fertig")
        }

        override fun onError(id: String?, fehler: Int) {
            melde("vorlesen-fertig")
        }

        /* Beim Anhalten über stop() kommt kein onDone. Ohne diese Meldung bliebe
           der Knopf auf „Anhalten" stehen, obwohl längst Ruhe ist. */
        override fun onStop(id: String?, hatBegonnen: Boolean) {
            melde("vorlesen-fertig")
        }
    }

    /**
     * Die deutschen Stimmen dieses Geräts, als JSON für die Webseite.
     *
     * Die Kennung ist der technische Name der Stimme (etwa
     * „de-de-x-nfh#female_1") — daran erkennt Android sie beim nächsten Mal
     * wieder. Der Name daneben ist der, den der Mensch liest, und er sagt nur
     * das, was ihn unterscheidet: eine Nummer und woher die Stimme kommt.
     */
    @JavascriptInterface
    fun stimmen(): String {
        if (!bereit) return "[]"
        val gefunden = runCatching { stimme?.voices?.toList() }.getOrNull().orEmpty()
        val deutsche = gefunden
            .filter { it.locale?.language == Locale.GERMAN.language }
            /* Stimmen aus dem Netz brauchen Internet und stocken ohne. Die vom
               Gerät zuerst — sie sind immer da. */
            .sortedBy { it.isNetworkConnectionRequired }

        val liste = JSONArray()
        deutsche.forEachIndexed { i, s ->
            liste.put(
                JSONObject()
                    .put("kennung", s.name)
                    .put("name", "Stimme ${i + 1}${land(s)}")
            )
        }
        return liste.toString()
    }

    /** „ (Österreich)" — aber nur, wenn es etwas zu unterscheiden gibt. */
    private fun land(s: Voice): String {
        val land = s.locale?.getDisplayCountry(Locale.GERMAN).orEmpty()
        return if (land.isBlank()) "" else " ($land)"
    }

    /**
     * Liest [was] vor. [kennung] ist die gewählte Stimme (leer = die des
     * Systems), [tempo] geht von −60 bis 60 wie der Schieber im Zahnrad.
     */
    @JavascriptInterface
    fun sprich(was: String, kennung: String, tempo: Int) {
        if (!bereit || was.isBlank()) return
        amHauptfaden.post {
            val tts = stimme ?: return@post

            if (kennung.isNotBlank()) {
                val gewaehlt = runCatching {
                    tts.voices?.firstOrNull { it.name == kennung }
                }.getOrNull()
                if (gewaehlt != null) runCatching { tts.voice = gewaehlt }
            }

            /* Dieselbe Umrechnung wie im Browser-Weg: 1,0 ist das Gewohnte,
               der Ausgangspunkt liegt knapp darunter. Wer mithört, um Fehler zu
               hören, braucht die Zeit. */
            val rate = (0.95 + tempo / 100.0).coerceIn(0.4, 2.0)
            runCatching { tts.setSpeechRate(rate.toFloat()) }

            /* Satzweise, wie im Browser auch: Lange Texte brechen manche
               Stimmen ab, und die Pausen zwischen den Sätzen braucht ohnehin
               jeder, der mitliest. Nur der letzte Satz trägt die Kennung ENDE —
               an ihr erkennt der Zuhörer oben, dass Schluss ist. */
            val saetze = was.split(Regex("(?<=[.!?:;])\\s+|\\n+"))
                .map { it.trim() }
                .filter { it.isNotEmpty() }
            if (saetze.isEmpty()) return@post

            saetze.forEachIndexed { i, satz ->
                val zuerst = i == 0
                val id = if (i == saetze.lastIndex) ENDE else "satz$i"
                tts.speak(
                    satz,
                    if (zuerst) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD,
                    null,
                    id
                )
            }
        }
    }

    /** Hält mitten im Satz an — der Knopf trägt dann „Anhalten". */
    @JavascriptInterface
    fun anhalten() {
        amHauptfaden.post { runCatching { stimme?.stop() } }
    }

    /** Räumt beim Schließen der App auf; sonst spricht die Stimme weiter. */
    fun beenden() {
        runCatching { stimme?.stop() }
        runCatching { stimme?.shutdown() }
        stimme = null
        bereit = false
    }

    /** Ein Ereignis an die Webseite — dort hängen die Zuhörer in app.js daran. */
    private fun melde(ereignis: String) {
        webView.post {
            webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent(${JSONObject.quote(ereignis)}));",
                null
            )
        }
    }

    private companion object {
        const val ENDE = "ende"
    }
}
