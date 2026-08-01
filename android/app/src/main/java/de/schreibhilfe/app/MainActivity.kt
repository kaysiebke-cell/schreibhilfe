package de.schreibhilfe.app

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
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
        }

        webView.addJavascriptInterface(AndroidBruecke(), "AndroidBridge")

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
                uebergebenerText?.let { reicheTextHinein(it); uebergebenerText = null }
            }
        }
    }

    /** Holt den Text aus „Teilen an …“ oder aus dem Markier-Menü („Verarbeiten“). */
    private fun leseTextAus(intent: Intent?): String? {
        if (intent == null) return null
        val text = when (intent.action) {
            Intent.ACTION_SEND ->
                if (intent.type == "text/plain") intent.getStringExtra(Intent.EXTRA_TEXT) else null
            Intent.ACTION_PROCESS_TEXT ->
                intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString()
            else -> null
        }
        return text?.takeIf { it.isNotBlank() }
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
