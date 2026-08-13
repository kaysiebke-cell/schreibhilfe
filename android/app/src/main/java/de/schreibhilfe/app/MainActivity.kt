package de.schreibhilfe.app

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject

/**
 * Die App ist ein Rahmen um dieselbe Web-App, die auch bei GitHub Pages liegt.
 * Es gibt also nur EINE Quelle für Oberfläche und Logik.
 *
 * Geladen wird über den WebViewAssetLoader unter einer echten https-Adresse
 * (appassets.androidplatform.net) statt über file://. Das ist wichtig:
 * nur so gelten localStorage und die KI-Anfrage an api.anthropic.com als
 * sicherer Ursprung — über file:// würde beides scheitern.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var assetLoader: WebViewAssetLoader

    /** Text, der beim Start von außen hereingereicht wurde (Teilen / Verarbeiten). */
    private var uebergebenerText: String? = null
    private var seiteFertig = false

    private val startAdresse = "https://appassets.androidplatform.net/assets/www/index.html"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webview)

        assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        richteWebViewEin()
        uebergebenerText = leseTextAus(intent)
        webView.loadUrl(startAdresse)

        // Zurück-Taste: erst im Verlauf der Seite zurück, dann die App schließen.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })
    }

    /** Die App läuft im singleTop-Modus: erneutes Teilen landet hier statt in onCreate. */
    override fun onNewIntent(neuerIntent: Intent) {
        super.onNewIntent(neuerIntent)
        setIntent(neuerIntent)
        val text = leseTextAus(neuerIntent) ?: return
        uebergebenerText = text
        if (seiteFertig) reicheTextHinein(text)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun richteWebViewEin() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true      // localStorage: gespeicherter Text, Schlüssel, Schriftgröße
            allowFileAccess = false       // nicht nötig, alles kommt über den AssetLoader
            allowContentAccess = false
            // Eine WebView ignoriert die Android-Einstellung „Schriftgröße“ von
            // Haus aus: textZoom steht fest auf 100. Wer sie im System groß
            // gestellt hat, bekäme in der App trotzdem Normalgröße. A− / A+
            // wirken weiterhin obendrauf.
            textZoom = (resources.configuration.fontScale * 100).toInt()
        }

        webView.addJavascriptInterface(AndroidBruecke(), "AndroidBridge")

        // Ohne WebChromeClient sind window.alert, confirm und prompt in einer
        // WebView wirkungslos: confirm liefert wortlos false, und ein Knopf,
        // der eine Rückfrage stellt, tut dann schlicht nichts. Genau daran ist
        // der Löschen-Knopf gescheitert. Die Web-App fragt inzwischen nicht
        // mehr nach — der Client steht hier, damit die Falle nicht wiederkommt.
        webView.webChromeClient = WebChromeClient()

        webView.webViewClient = object : WebViewClient() {

            override fun shouldInterceptRequest(
                view: WebView, request: WebResourceRequest
            ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

            /**
             * Alles, was nicht zur App selbst gehört (wa.me, sms:, mailto:), gibt die
             * App an Android weiter. Sonst würde die WebView versuchen, WhatsApp als
             * Webseite darzustellen.
             */
            override fun shouldOverrideUrlLoading(
                view: WebView, request: WebResourceRequest
            ): Boolean {
                val adresse = request.url
                if (adresse.host == "appassets.androidplatform.net") return false
                oeffneAussen(Intent(Intent.ACTION_VIEW, adresse))
                return true
            }

            override fun onPageFinished(view: WebView, url: String) {
                seiteFertig = true
                reicheSystemfarbenHinein()
                reicheRueckgabeHinein()
                uebergebenerText?.let { reicheTextHinein(it); uebergebenerText = null }
            }
        }
    }

    /**
     * Kam der Text aus dem Markier-Menü, nimmt die andere App ihn auch wieder
     * entgegen — dann ersetzt der verbesserte Text die Markierung an Ort und
     * Stelle. Beim Teilen geht das nicht: Dort gibt es keinen Rückweg.
     * Manche Apps bitten ausdrücklich nur ums Lesen (READONLY), das wird
     * geachtet.
     */
    private var darfZurueckgeben = false

    /** Holt den Text aus „Teilen an …“ oder aus dem Markier-Menü („Verarbeiten“). */
    private fun leseTextAus(intent: Intent?): String? {
        if (intent == null) return null
        darfZurueckgeben = false
        val text = when (intent.action) {
            Intent.ACTION_SEND ->
                if (intent.type == "text/plain") intent.getStringExtra(Intent.EXTRA_TEXT) else null
            Intent.ACTION_PROCESS_TEXT -> {
                darfZurueckgeben =
                    !intent.getBooleanExtra(Intent.EXTRA_PROCESS_TEXT_READONLY, false)
                intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString()
            }
            else -> null
        }
        return text?.takeIf { it.isNotBlank() }
    }

    /**
     * Sagt der Web-App, ob der Knopf „Zurückgeben“ etwas zu tun hat. Wird auch
     * nach einem neuen Intent gemeldet — die Seite läuft dann schon und würde
     * es sonst nicht mitbekommen.
     */
    private fun reicheRueckgabeHinein() {
        webView.evaluateJavascript(
            "window.KannZurueckgeben = $darfZurueckgeben;" +
            "window.dispatchEvent(new Event('rueckgabe'));",
            null
        )
    }

    /** Schreibt den übergebenen Text ins Schreibfeld der Web-App. */
    private fun reicheTextHinein(text: String) {
        val alsJs = JSONObject.quote(text)
        webView.evaluateJavascript(
            """
            (function () {
              var feld = document.getElementById('text');
              if (!feld) return;
              feld.value = $alsJs;
              feld.dispatchEvent(new Event('input'));
              var pruefen = document.getElementById('btn-pruefen');
              if (pruefen) pruefen.click();
              feld.focus();
            })();
            """.trimIndent(),
            null
        )
        reicheRueckgabeHinein()
    }

    /**
     * Material You: Android 12 leitet aus dem Hintergrundbild eine Farbpalette
     * ab. Aus CSS kommt man an die nicht heran, also liest die App sie hier aus
     * und legt sie als `window.SystemFarben` in die Seite. Ob die Web-App sie
     * benutzt, entscheidet der Schalter in den Einstellungen — die
     * Bedeutungsfarben (grün/gelb/rot) bleiben in jedem Fall unangetastet,
     * damit ein Fund erkennbar bleibt.
     */
    private fun reicheSystemfarbenHinein() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return

        fun hex(id: Int) = String.format("#%06X", 0xFFFFFF and ContextCompat.getColor(this, id))

        val palette = JSONObject().apply {
            put("hell", JSONObject().apply {
                put("petrol", hex(android.R.color.system_accent1_600))
                put("petrolDeep", hex(android.R.color.system_accent1_800))
                put("paper", hex(android.R.color.system_neutral1_100))
                put("paperRaised", hex(android.R.color.system_neutral1_50))
                put("surface", hex(android.R.color.system_neutral1_10))
                put("ink", hex(android.R.color.system_neutral1_900))
                put("inkSoft", hex(android.R.color.system_neutral2_700))
                put("line", hex(android.R.color.system_neutral2_300))
            })
            put("dunkel", JSONObject().apply {
                put("petrol", hex(android.R.color.system_accent1_200))
                put("petrolDeep", hex(android.R.color.system_accent1_100))
                put("paper", hex(android.R.color.system_neutral1_900))
                put("paperRaised", hex(android.R.color.system_neutral1_800))
                put("surface", hex(android.R.color.system_neutral1_700))
                put("ink", hex(android.R.color.system_neutral1_50))
                put("inkSoft", hex(android.R.color.system_neutral2_200))
                put("line", hex(android.R.color.system_neutral2_600))
            })
        }

        webView.evaluateJavascript(
            "window.SystemFarben = $palette;" +
                "window.dispatchEvent(new Event('systemfarben'));",
            null
        )
    }

    /**
     * Färbt Status- und Navigationsleiste passend zur Web-App ein. Die Web-App
     * meldet ihre eigene Hell/Dunkel-Wahl über die Brücke — sonst hätte man
     * eine dunkle App mit hellen Systemleisten, sobald die Wahl in der App vom
     * System abweicht.
     */
    private fun faerbeLeisten(dunkel: Boolean, oben: String, unten: String) {
        window.statusBarColor = Color.parseColor(oben)
        window.navigationBarColor = Color.parseColor(unten)
        WindowCompat.getInsetsController(window, window.decorView).apply {
            // Helle Leiste braucht dunkle Symbole und umgekehrt.
            isAppearanceLightStatusBars = !dunkel
            isAppearanceLightNavigationBars = !dunkel
        }
    }

    private fun oeffneAussen(intent: Intent) {
        try {
            startActivity(intent)
        } catch (fehlt: ActivityNotFoundException) {
            Toast.makeText(this, R.string.keine_app_dafuer, Toast.LENGTH_SHORT).show()
        }
    }

    /**
     * Brücke für die Web-App.
     *
     * Eine Android-WebView kennt weder `navigator.share` noch die
     * Zwischenablage über `navigator.clipboard` — beide Knöpfe würden ins
     * Leere laufen. Deshalb erledigt die App das selbst. Die Web-App erkennt
     * an `window.AndroidBridge`, dass sie in der App läuft, und nimmt dann
     * diesen Weg statt der Web-Schnittstellen.
     *
     * Die Methoden hier werden aus einem eigenen Faden der WebView gerufen,
     * nicht aus dem der Oberfläche — deshalb überall `runOnUiThread`.
     */
    inner class AndroidBruecke {

        /** Öffnet das System-Teilen-Menü: WhatsApp, SMS, E-Mail und alles Weitere. */
        @JavascriptInterface
        fun teilen(text: String) {
            if (text.isBlank()) return
            val senden = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, text)
            }
            runOnUiThread {
                oeffneAussen(Intent.createChooser(senden, getString(R.string.teilen_titel)))
            }
        }

        /**
         * Meldet die aktuelle Darstellung der Web-App, damit Status- und
         * Navigationsleiste dieselben Farben bekommen.
         */
        @JavascriptInterface
        fun leisten(dunkel: Boolean, oben: String, unten: String) {
            runOnUiThread { faerbeLeisten(dunkel, oben, unten) }
        }

        /**
         * Gibt den Text an die App zurück, aus der er markiert wurde — dort
         * ersetzt er die Markierung. Danach schließt sich die Schreibhilfe,
         * man landet also wieder in WhatsApp, Facebook oder wo man war.
         */
        @JavascriptInterface
        fun zurueckgeben(text: String) {
            if (text.isBlank() || !darfZurueckgeben) return
            runOnUiThread {
                setResult(RESULT_OK, Intent().putExtra(Intent.EXTRA_PROCESS_TEXT, text))
                finish()
            }
        }

        /**
         * Holt den Text aus der Zwischenablage — nur auf Knopfdruck, nie von
         * selbst. „Kopieren“ steht in jedem Markier-Menü ganz vorn, nie hinter
         * dem ⋮; über die Zwischenablage kommt der Text also auch aus Apps
         * herein, die fremde Menüeinträge gar nicht anbieten.
         *
         * Gelesen wird im Vordergrund-Thread: Aus dem Binder-Thread der Brücke
         * heraus wirft die Zwischenablage auf manchen Geräten. Das Ergebnis
         * geht deshalb als Ereignis zurück an die Seite.
         */
        @JavascriptInterface
        fun frageZwischenablage() {
            runOnUiThread {
                val ablage = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                val text = ablage.primaryClip
                    ?.takeIf { it.itemCount > 0 }
                    ?.getItemAt(0)
                    ?.coerceToText(this@MainActivity)
                    ?.toString()
                    .orEmpty()
                webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('zwischenablage'," +
                        "{detail:${JSONObject.quote(text)}}));",
                    null
                )
            }
        }

        /** Legt den Text in die Zwischenablage, damit er sich woanders einfügen lässt. */
        @JavascriptInterface
        fun kopieren(text: String) {
            if (text.isBlank()) return
            runOnUiThread {
                val ablage = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                ablage.setPrimaryClip(ClipData.newPlainText(getString(R.string.app_name), text))
            }
        }
    }
}
