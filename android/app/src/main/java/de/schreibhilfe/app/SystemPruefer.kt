package de.schreibhilfe.app

import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.textservice.SentenceSuggestionsInfo
import android.view.textservice.SpellCheckerSession
import android.view.textservice.SuggestionsInfo
import android.view.textservice.TextInfo
import android.view.textservice.TextServicesManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Die Brücke zu Androids eigener Rechtschreibprüfung.
 *
 * Die roten Wellenlinien im Textfeld malt die Tastatur (auf diesem Gerät Gboards
 * AndroidSpellCheckerService). Eine Webseite sieht davon nichts — es gibt keinen
 * Weg im Browser, die Vorschläge dahinter abzufragen.
 *
 * Der Android-Teil der App darf aber fragen: über den TextServicesManager. Diese
 * Klasse reicht das Ergebnis in die Webseite durch.
 *
 * Zweck ist vorerst das Messen: Findet Androids Prüfer etwas, das der eigene
 * Wörterbuch-Teil übersieht? Deshalb hängt hier noch nichts in der Bedienung,
 * die Antwort geht nur an `window.systemPruefung()`.
 *
 * Die Prüfung läuft nicht sofort ab: Der Dienst antwortet über einen Zuhörer,
 * irgendwann später. Darum bekommt jede Anfrage eine Rufnummer, unter der die
 * Webseite ihre Antwort wiedererkennt.
 */
class SystemPruefer(private val ctx: Context, private val webView: WebView) {

    private val amHauptfaden = Handler(Looper.getMainLooper())

    /** Der Dienst nimmt keine beliebig langen Texte an. Sicherheitshalber klein halten. */
    private val HAPPEN_LAENGE = 400

    /** Antwortet der Dienst gar nicht, darf die Webseite nicht ewig warten. */
    private val GEDULD_MS = 5000L

    private class Happen(val text: String, val versatz: Int)

    /** Meldet, ob auf diesem Gerät überhaupt eine Prüfung eingeschaltet ist. */
    @JavascriptInterface
    fun bereit(): Boolean {
        val dienst = dienst() ?: return false
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            runCatching { dienst.isSpellCheckerEnabled }.getOrDefault(true)
        } else {
            true
        }
    }

    /**
     * Prüft [text] und meldet das Ergebnis unter [ruf] an die Webseite zurück.
     * Der Aufruf kommt aus einem fremden Faden — die Sitzung braucht aber einen
     * Looper, also alles auf den Hauptfaden schieben.
     */
    @JavascriptInterface
    fun pruefe(text: String, ruf: Int) {
        amHauptfaden.post { starte(text, ruf) }
    }

    private fun dienst(): TextServicesManager? =
        ctx.getSystemService(Context.TEXT_SERVICES_MANAGER_SERVICE) as? TextServicesManager

    private fun starte(text: String, ruf: Int) {
        val dienst = dienst()
        if (dienst == null) {
            melde(ruf, fehler("Auf diesem Gerät gibt es keinen Textdienst."))
            return
        }

        val happen = zerlege(text)
        if (happen.isEmpty()) {
            melde(ruf, JSONObject().put("funde", JSONArray()))
            return
        }

        // Die Sitzung wird erst unten erzeugt, der Zuhörer muss sie aber
        // schließen können. In Kotlin fängt der Zuhörer die Variable selbst ein,
        // nicht ihren jetzigen (leeren) Wert.
        var sitzung: SpellCheckerSession? = null
        val erledigt = AtomicBoolean(false)

        val zuhoerer = object : SpellCheckerSession.SpellCheckerSessionListener {
            /** Nur für die wortweise Prüfung; hier wird satzweise gefragt. */
            override fun onGetSuggestions(ergebnisse: Array<SuggestionsInfo>?) = Unit

            override fun onGetSentenceSuggestions(ergebnisse: Array<SentenceSuggestionsInfo>?) {
                if (!erledigt.compareAndSet(false, true)) return
                melde(ruf, werteAus(text, happen, ergebnisse))
                sitzung?.close()
            }
        }

        sitzung = neueSitzung(dienst, zuhoerer)
        if (sitzung == null) {
            melde(ruf, fehler("Es ist keine Rechtschreibprüfung eingeschaltet."))
            return
        }

        val offen = sitzung
        runCatching {
            offen.getSentenceSuggestions(happen.map { TextInfo(it.text) }.toTypedArray(), 5)
        }.onFailure {
            if (erledigt.compareAndSet(false, true)) {
                melde(ruf, fehler("Der Prüfer nahm den Text nicht an: ${it.message}"))
                offen.close()
            }
            return
        }

        amHauptfaden.postDelayed({
            if (erledigt.compareAndSet(false, true)) {
                melde(ruf, fehler("Der Prüfer hat nicht geantwortet."))
                offen.close()
            }
        }, GEDULD_MS)
    }

    /**
     * Welche Sprache der Prüfer bedient, steht in den Systemeinstellungen. Erst
     * danach fragen, und nur wenn das nichts hergibt auf Deutsch bestehen.
     */
    private fun neueSitzung(
        dienst: TextServicesManager,
        zuhoerer: SpellCheckerSession.SpellCheckerSessionListener,
    ): SpellCheckerSession? =
        runCatching { dienst.newSpellCheckerSession(null, Locale.GERMAN, zuhoerer, true) }.getOrNull()
            ?: runCatching { dienst.newSpellCheckerSession(null, null, zuhoerer, true) }.getOrNull()
            ?: runCatching { dienst.newSpellCheckerSession(null, Locale.GERMAN, zuhoerer, false) }.getOrNull()

    /** Zerlegt den Text in Happen und merkt sich, wo jeder im Ganzen anfängt. */
    private fun zerlege(text: String): List<Happen> {
        val liste = mutableListOf<Happen>()
        var start = 0
        while (start < text.length) {
            var ende = minOf(start + HAPPEN_LAENGE, text.length)
            if (ende < text.length) {
                // Nicht mitten im Wort abschneiden — sonst meldet der Prüfer
                // Bruchstücke als Fehler.
                val luecke = text.lastIndexOf(' ', ende)
                if (luecke > start) ende = luecke + 1
            }
            liste.add(Happen(text.substring(start, ende), start))
            start = ende
        }
        return liste
    }

    private fun werteAus(
        ganz: String,
        happen: List<Happen>,
        ergebnisse: Array<SentenceSuggestionsInfo>?,
    ): JSONObject {
        val funde = JSONArray()
        ergebnisse?.forEachIndexed { i, satz ->
            val versatz = happen.getOrNull(i)?.versatz ?: 0
            for (j in 0 until satz.suggestionsCount) {
                val info = satz.getSuggestionsInfoAt(j) ?: continue
                val von = versatz + satz.getOffsetAt(j)
                val bis = von + satz.getLengthAt(j)
                if (von < 0 || bis > ganz.length || bis <= von) continue

                val merkmale = info.suggestionsAttributes
                // Was im Wörterbuch steht, ist kein Fund.
                if (merkmale and SuggestionsInfo.RESULT_ATTR_IN_THE_DICTIONARY != 0) continue

                val vorschlaege = JSONArray()
                for (k in 0 until info.suggestionsCount) vorschlaege.put(info.getSuggestionAt(k))

                funde.put(
                    JSONObject()
                        .put("von", von)
                        .put("bis", bis)
                        .put("wort", ganz.substring(von, bis))
                        .put("vorschlaege", vorschlaege)
                        .put("tippfehler", merkmale and SuggestionsInfo.RESULT_ATTR_LOOKS_LIKE_TYPO != 0)
                        .put("empfohlen", merkmale and SuggestionsInfo.RESULT_ATTR_HAS_RECOMMENDED_SUGGESTIONS != 0)
                        .put("merkmale", merkmale)
                )
            }
        }
        return JSONObject().put("funde", funde)
    }

    private fun fehler(grund: String) = JSONObject().put("fehler", grund)

    private fun melde(ruf: Int, ergebnis: JSONObject) {
        // Als Zeichenkette hinüberreichen und drüben auspacken: so kann kein
        // Zeichen aus dem Text den eingesetzten JavaScript-Ausdruck sprengen.
        val nutzlast = JSONObject.quote(ergebnis.toString())
        webView.post {
            webView.evaluateJavascript(
                "window.__systemPrueferAntwort && window.__systemPrueferAntwort($ruf, JSON.parse($nutzlast));",
                null
            )
        }
    }
}
