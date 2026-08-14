package de.schreibhilfe.app

import android.accessibilityservice.AccessibilityService
import android.annotation.SuppressLint
import android.content.Context
import android.graphics.PixelFormat
import android.os.Bundle
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ImageView
import android.widget.Toast
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import org.json.JSONTokener
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * Korrigieren, ohne die App zu verlassen.
 *
 * Der Dienst legt einen schwebenden Knopf über alle Apps. Ein Tipp darauf:
 * Text aus dem gerade beschriebenen Feld holen, prüfen, verbessert
 * zurückschreiben — in WhatsApp, in der Mail, überall.
 *
 * Geprüft wird mit DERSELBEN Logik wie in der App: eine unsichtbare
 * Web-Ansicht lädt die gleiche Seite und stellt `korrigiereAlles()` bereit.
 * So gibt es nur eine Fassung der Regeln, die gepflegt werden muss.
 */
class SchreibhilfeDienst : AccessibilityService() {

    private var fenster: WindowManager? = null
    private var knopf: ImageView? = null
    private var lage: WindowManager.LayoutParams? = null

    /** Unsichtbare Web-Ansicht, nur als Rechenknecht für die Prüfung. */
    private var pruefer: WebView? = null
    private var prueferBereit = false

    private var laeuft = false

    override fun onServiceConnected() {
        super.onServiceConnected()
        fenster = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        bauePruefer()
        zeigeKnopf()
    }

    override fun onAccessibilityEvent(ereignis: AccessibilityEvent?) { /* nichts nötig */ }
    override fun onInterrupt() { /* nichts nötig */ }

    override fun onDestroy() {
        knopf?.let { runCatching { fenster?.removeView(it) } }
        knopf = null
        pruefer?.destroy()
        pruefer = null
        super.onDestroy()
    }

    // ---------------------------------------------------------------- Prüfer

    @SuppressLint("SetJavaScriptEnabled")
    private fun bauePruefer() {
        val lader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        pruefer = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true          // dieselbe Ablage wie die App
            settings.allowFileAccess = false
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    sicht: WebView, anfrage: WebResourceRequest
                ): WebResourceResponse? = lader.shouldInterceptRequest(anfrage.url)

                override fun onPageFinished(sicht: WebView, adresse: String) {
                    prueferBereit = true
                }
            }
            loadUrl("https://appassets.androidplatform.net/assets/www/index.html")
        }
    }

    // ----------------------------------------------------------- Schwebeknopf

    private fun zeigeKnopf() {
        if (knopf != null) return

        val rand = (12 * resources.displayMetrics.density).roundToInt()
        val neuerKnopf = ImageView(this).apply {
            setImageResource(R.drawable.ic_schwebeknopf)
            setBackgroundResource(R.drawable.schwebeknopf_hintergrund)
            setPadding(rand, rand, rand, rand)
            contentDescription = getString(R.string.knopf_beschreibung)
            elevation = 8 * resources.displayMetrics.density
        }

        // TYPE_ACCESSIBILITY_OVERLAY: ein Bedienungshilfe-Dienst darf ohne die
        // zusätzliche Berechtigung „über anderen Apps anzeigen" ein Fenster legen.
        val neueLage = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = Merker.knopfX(this@SchreibhilfeDienst)
            y = Merker.knopfY(this@SchreibhilfeDienst)
        }

        neuerKnopf.setOnTouchListener(SchiebeUndTippe(neueLage))

        runCatching { fenster?.addView(neuerKnopf, neueLage) }
            .onFailure { return }

        knopf = neuerKnopf
        lage = neueLage
    }

    /**
     * Unterscheidet Schieben von Tippen: Wer den Knopf verrückt, will ihn
     * umsetzen; wer ihn nur antippt, will korrigieren. Die Grenze liegt bei
     * ein paar Bildpunkten, damit ein leicht wackliger Finger noch als Tipp gilt.
     */
    private inner class SchiebeUndTippe(
        private val meineLage: WindowManager.LayoutParams
    ) : View.OnTouchListener {

        private var startX = 0
        private var startY = 0
        private var fingerX = 0f
        private var fingerY = 0f
        private var geschoben = false
        private val schwelle = 8 * resources.displayMetrics.density

        @SuppressLint("ClickableViewAccessibility")
        override fun onTouch(sicht: View, bewegung: MotionEvent): Boolean {
            when (bewegung.action) {
                MotionEvent.ACTION_DOWN -> {
                    startX = meineLage.x; startY = meineLage.y
                    fingerX = bewegung.rawX; fingerY = bewegung.rawY
                    geschoben = false
                    sicht.alpha = 0.6f
                    return true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = bewegung.rawX - fingerX
                    val dy = bewegung.rawY - fingerY
                    if (abs(dx) > schwelle || abs(dy) > schwelle) geschoben = true
                    if (geschoben) {
                        meineLage.x = startX + dx.roundToInt()
                        meineLage.y = startY + dy.roundToInt()
                        runCatching { fenster?.updateViewLayout(sicht, meineLage) }
                    }
                    return true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    sicht.alpha = 1f
                    if (geschoben) Merker.merkeKnopf(this@SchreibhilfeDienst, meineLage.x, meineLage.y)
                    else korrigiereFokussiertesFeld()
                    return true
                }
            }
            return false
        }
    }

    // ------------------------------------------------------------ Korrigieren

    private fun korrigiereFokussiertesFeld() {
        if (laeuft) return
        if (!prueferBereit) { melde(R.string.noch_nicht_bereit); return }

        val feld = fokussiertesFeld()
        if (feld == null) { melde(R.string.kein_textfeld); return }

        val text = feld.text?.toString().orEmpty()
        if (text.isBlank()) { melde(R.string.feld_leer); return }

        laeuft = true
        val befehl = "JSON.stringify(korrigiereAlles(${JSONObject.quote(text)}))"
        pruefer?.evaluateJavascript(befehl) { antwort ->
            laeuft = false
            val ergebnis = leseErgebnis(antwort)
            if (ergebnis == null) { melde(R.string.pruefung_fehlgeschlagen); return@evaluateJavascript }

            val (neuerText, anzahl) = ergebnis
            if (anzahl == 0 || neuerText == text) { melde(R.string.nichts_gefunden); return@evaluateJavascript }

            // Den Knoten neu holen: der von vorhin kann inzwischen veraltet sein.
            val jetzigesFeld = fokussiertesFeld() ?: feld
            val angaben = Bundle().apply {
                putCharSequence(
                    AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, neuerText
                )
            }
            val hatGeklappt =
                jetzigesFeld.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, angaben)

            if (hatGeklappt) {
                melde(resources.getQuantityString(R.plurals.verbessert, anzahl, anzahl))
            } else {
                melde(R.string.ersetzen_ging_nicht)
            }
        }
    }

    /** Das Textfeld, in dem gerade geschrieben wird — quer über alle Fenster. */
    private fun fokussiertesFeld(): AccessibilityNodeInfo? {
        rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
            ?.let { if (it.isEditable) return it }

        // Manche Apps (und geteilte Bildschirme) hängen den Fokus in ein
        // anderes Fenster — deshalb zur Sicherheit alle durchsehen.
        for (fensterInfo in windows) {
            fensterInfo.root?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
                ?.let { if (it.isEditable) return it }
        }
        return null
    }

    /**
     * evaluateJavascript liefert den Rückgabewert JSON-verpackt: unsere
     * JSON-Zeichenkette steckt also noch einmal in Anführungszeichen.
     */
    private fun leseErgebnis(antwort: String?): Pair<String, Int>? {
        if (antwort == null || antwort == "null") return null
        return runCatching {
            val innen = JSONTokener(antwort).nextValue() as String
            val daten = JSONObject(innen)
            daten.getString("text") to daten.getInt("anzahl")
        }.getOrNull()
    }

    private fun melde(text: String) = Toast.makeText(this, text, Toast.LENGTH_SHORT).show()
    private fun melde(textId: Int) = melde(getString(textId))
}

/** Merkt sich, wohin der Knopf geschoben wurde. */
private object Merker {
    private const val ABLAGE = "schwebeknopf"

    fun knopfX(zusammenhang: Context) =
        zusammenhang.getSharedPreferences(ABLAGE, Context.MODE_PRIVATE).getInt("x", 24)

    fun knopfY(zusammenhang: Context) =
        zusammenhang.getSharedPreferences(ABLAGE, Context.MODE_PRIVATE)
            .getInt("y", zusammenhang.resources.displayMetrics.heightPixels / 3)

    fun merkeKnopf(zusammenhang: Context, x: Int, y: Int) {
        zusammenhang.getSharedPreferences(ABLAGE, Context.MODE_PRIVATE)
            .edit().putInt("x", x).putInt("y", y).apply()
    }
}
