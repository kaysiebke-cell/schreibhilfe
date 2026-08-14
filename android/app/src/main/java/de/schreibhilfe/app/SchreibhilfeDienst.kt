package de.schreibhilfe.app

import android.accessibilityservice.AccessibilityService
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.os.Build
import android.content.IntentFilter
import android.content.BroadcastReceiver
import android.graphics.PixelFormat
import android.graphics.Rect
import android.os.Bundle
import android.util.Log
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
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

    /** Merkt die selbst gewählte Stelle, während der Knopf der Tastatur ausweicht. */
    private var ausgewichen = false
    private var platzVorher = 0
    private var zuletztGeprueft = 0L

    /**
     * Text, der aus der App zurück ins Feld soll. Er wird eingesetzt, sobald
     * wieder ein beschreibbares Feld einer FREMDEN App im Vordergrund ist —
     * also sobald man aus der Schreibhilfe zurück in WhatsApp landet.
     */
    private var wartenderText: String? = null

    private val rueckgabeEmpfaenger = object : BroadcastReceiver() {
        override fun onReceive(zusammenhang: Context?, absicht: Intent?) {
            val text = absicht?.getStringExtra(Intent.EXTRA_TEXT) ?: return
            wartenderText = text
            Log.i(MARKE, "Text wartet auf das Feld (${text.length} Zeichen)")
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        Log.i(MARKE, "Dienst verbunden")
        runCatching {
            // Der Dienst läuft in einem eigenen Prozess, damit er nicht mitstirbt,
            // wenn die App aus den letzten Apps weggewischt wird. Zwei Prozesse
            // derselben App dürfen sich aber nicht dasselbe WebView-Verzeichnis
            // teilen — deshalb hier ein eigener Name.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                runCatching { WebView.setDataDirectorySuffix("dienst") }
            }
            registerReceiver(
                rueckgabeEmpfaenger, IntentFilter(ZURUECK_INS_FELD),
                Context.RECEIVER_NOT_EXPORTED
            )
            fenster = getSystemService(Context.WINDOW_SERVICE) as WindowManager
            bauePruefer()
            zeigeKnopf()
        }.onFailure { Log.e(MARKE, "Start fehlgeschlagen", it) }
    }

    /**
     * Kommt oder geht die Tastatur, muss der Knopf ausweichen — sonst liegt er
     * mitten auf den Buchstaben. Fensterwechsel sind das Signal dafür.
     *
     * Hier wird bewusst wenig getan: Android trennt Bedienungshilfen ab, die zu
     * lange brauchen, und die Fensterliste abzufragen ist ein teurer Aufruf über
     * Prozessgrenzen. Deshalb nur bei Fensterwechseln, höchstens alle 300 ms —
     * und alles gekapselt, damit eine Ausnahme nicht den ganzen Dienst kostet.
     */
    override fun onAccessibilityEvent(ereignis: AccessibilityEvent?) {
        val art = ereignis?.eventType ?: return
        if (art != AccessibilityEvent.TYPE_WINDOWS_CHANGED &&
            art != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return

        val jetzt = System.currentTimeMillis()
        if (jetzt - zuletztGeprueft < 300) return
        zuletztGeprueft = jetzt

        runCatching { weicheTastaturAus() }
            .onFailure { Log.w(MARKE, "Ausweichen ging nicht", it) }
        runCatching { setzeWartendenTextEin() }
            .onFailure { Log.w(MARKE, "Einsetzen ging nicht", it) }
    }

    override fun onInterrupt() { /* nichts nötig */ }

    override fun onDestroy() {
        runCatching { unregisterReceiver(rueckgabeEmpfaenger) }
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
                    Log.i(MARKE, "Prüfung bereit")
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
            .onFailure { Log.e(MARKE, "Knopf ließ sich nicht anlegen", it); return }
        Log.i(MARKE, "Knopf liegt bei ${neueLage.x}/${neueLage.y}")

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
        private var gedruecktSeit = 0L
        private val schwelle = 8 * resources.displayMetrics.density

        @SuppressLint("ClickableViewAccessibility")
        override fun onTouch(sicht: View, bewegung: MotionEvent): Boolean {
            when (bewegung.action) {
                MotionEvent.ACTION_DOWN -> {
                    gedruecktSeit = bewegung.eventTime
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
                    if (geschoben) {
                        Merker.merkeKnopf(this@SchreibhilfeDienst, meineLage.x, meineLage.y)
                        // Wer den Knopf bei offener Tastatur umsetzt, meint diese
                        // Stelle — nicht die, von der er vorhin ausgewichen ist.
                        ausgewichen = false
                        platzVorher = meineLage.y
                    } else if (bewegung.eventTime - gedruecktSeit > 500) {
                        // Langer Druck: rüber in die Schreibhilfe, mit dem Text
                        oeffneAppMitText()
                    } else {
                        korrigiereFokussiertesFeld()
                    }
                    return true
                }
            }
            return false
        }
    }

    // ------------------------------------------------------------ Korrigieren

    private fun korrigiereFokussiertesFeld() = runCatching { korrigiereWirklich() }
        .onFailure { Log.e(MARKE, "Korrigieren fehlgeschlagen", it); laeuft = false }

    private fun korrigiereWirklich() {
        if (laeuft) return
        if (!prueferBereit) { Log.w(MARKE, "Abbruch: Prüfung noch nicht geladen"); blinke(R.color.knopf_fehler); melde(R.string.noch_nicht_bereit); return }

        val feld = fokussiertesFeld()
        if (feld == null) { Log.w(MARKE, "Abbruch: kein beschreibbares Feld im Vordergrund"); blinke(R.color.knopf_fehler); melde(R.string.kein_textfeld); return }

        val text = feld.text?.toString().orEmpty()
        Log.i(MARKE, "Feld gefunden in ${feld.packageName}, ${text.length} Zeichen")
        if (text.isBlank()) { Log.w(MARKE, "Abbruch: Feld ist leer"); blinke(R.color.knopf_nichts); melde(R.string.feld_leer); return }

        laeuft = true
        val befehl = "JSON.stringify(korrigiereAlles(${JSONObject.quote(text)}))"
        pruefer?.evaluateJavascript(befehl) { antwort ->
            laeuft = false
            val ergebnis = leseErgebnis(antwort)
            if (ergebnis == null) { Log.e(MARKE, "Antwort der Prüfung unlesbar: $antwort"); blinke(R.color.knopf_fehler); melde(R.string.pruefung_fehlgeschlagen); return@evaluateJavascript }

            val (neuerText, anzahl) = ergebnis
            if (anzahl == 0 || neuerText == text) { Log.i(MARKE, "Nichts zu ändern (Funde: $anzahl)"); blinke(R.color.knopf_nichts); melde(R.string.nichts_gefunden); return@evaluateJavascript }

            // Den Knoten neu holen: der von vorhin kann inzwischen veraltet sein.
            val jetzigesFeld = fokussiertesFeld() ?: feld
            val angaben = Bundle().apply {
                putCharSequence(
                    AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, neuerText
                )
            }
            val hatGeklappt =
                jetzigesFeld.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, angaben)
            Log.i(MARKE, "$anzahl Änderungen, Ersetzen geklappt: $hatGeklappt")

            if (hatGeklappt) {
                blinke(R.color.knopf_gut)
                melde(resources.getQuantityString(R.plurals.verbessert, anzahl, anzahl))
            } else {
                blinke(R.color.knopf_fehler)
                melde(R.string.ersetzen_ging_nicht)
            }
        }
    }

    /**
     * Langer Druck: die Schreibhilfe öffnen und den Text aus dem Feld mitnehmen.
     *
     * Nicht jede App lässt sich von außen beschreiben, und manches will man
     * lieber selbst entscheiden als in einem Rutsch ersetzen lassen. Dann ist
     * der Weg in die App der richtige — von dort geht der Text per Teilen zurück.
     */
    private fun oeffneAppMitText() {
        val text = fokussiertesFeld()?.text?.toString().orEmpty()
        Log.i(MARKE, "Langer Druck: App öffnen, ${text.length} Zeichen")
        val absicht = Intent(this, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            action = Intent.ACTION_SEND
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, text)
            // Sagt der App: Hier gibt es einen Rückweg ins Feld.
            putExtra(VOM_KNOPF, true)
        }
        blinke(R.color.knopf_gut)
        runCatching { startActivity(absicht) }
            .onFailure { Log.e(MARKE, "App ließ sich nicht öffnen", it) }
    }

    /**
     * Setzt den aus der App zurückgegebenen Text ein, sobald das Ziel wieder
     * da ist. Die eigene App wird dabei ausgelassen — sonst landete der Text
     * im Schreibfeld der Schreibhilfe statt in WhatsApp.
     */
    private fun setzeWartendenTextEin() {
        val text = wartenderText ?: return
        val feld = fokussiertesFeld() ?: return
        if (feld.packageName?.toString() == packageName) return

        val angaben = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        val geklappt = feld.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, angaben)
        Log.i(MARKE, "Rückgabe in ${feld.packageName} eingesetzt: $geklappt")
        if (geklappt) {
            wartenderText = null
            blinke(R.color.knopf_gut)
            melde(R.string.text_zurueck)
        }
    }

    // ------------------------------------------------------- Sichtbare Antwort

    /**
     * Der Knopf antwortet selbst, statt sich auf einen Toast zu verlassen.
     *
     * Ein Toast erscheint klein, oft halb hinter der Tastatur, und ist nach
     * einer Sekunde weg — den übersieht man. Ein kurzes Aufleuchten des
     * Knopfes sieht man dagegen, ohne hinzuschauen oder zu lesen:
     * grün heißt verbessert, grau heißt nichts zu tun, rot heißt ging nicht.
     */
    private fun blinke(farbeId: Int) {
        val k = knopf ?: return
        k.post {
            k.background?.setTint(getColor(farbeId))
            k.animate().scaleX(1.3f).scaleY(1.3f).setDuration(110)
                .withEndAction { k.animate().scaleX(1f).scaleY(1f).setDuration(180).start() }
                .start()
            k.postDelayed({ k.background?.setTintList(null) }, 900)
        }
    }

    // ------------------------------------------------- Der Tastatur ausweichen

    /** Obere Kante der Bildschirmtastatur, oder -1 wenn keine da ist. */
    private fun tastaturKante(): Int {
        for (fensterInfo in windows) {
            if (fensterInfo.type == AccessibilityWindowInfo.TYPE_INPUT_METHOD) {
                val kasten = Rect()
                fensterInfo.getBoundsInScreen(kasten)
                if (kasten.height() > 0) return kasten.top
            }
        }
        return -1
    }

    /**
     * Schiebt den Knopf über die Tastatur und danach wieder an seinen Platz.
     * Die selbst gewählte Stelle wird dabei nicht überschrieben — sie gilt
     * weiter, sobald die Tastatur verschwindet.
     */
    private fun weicheTastaturAus() {
        val meineLage = lage ?: return
        val k = knopf ?: return
        val hoehe = k.height.takeIf { it > 0 } ?: return
        val luft = (8 * resources.displayMetrics.density).roundToInt()

        val kante = tastaturKante()
        if (kante > 0) {
            val hoechstens = kante - hoehe - luft
            if (meineLage.y > hoechstens) {
                if (!ausgewichen) { platzVorher = meineLage.y; ausgewichen = true }
                meineLage.y = maxOf(0, hoechstens)
                runCatching { fenster?.updateViewLayout(k, meineLage) }
            }
        } else if (ausgewichen) {
            meineLage.y = platzVorher
            ausgewichen = false
            runCatching { fenster?.updateViewLayout(k, meineLage) }
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

    companion object {
        private const val MARKE = "Schreibhilfe"

        /** Die App reicht den korrigierten Text hierüber an den Dienst zurück. */
        const val ZURUECK_INS_FELD = "de.schreibhilfe.app.ZURUECK_INS_FELD"

        /** Markiert eine Absicht, die vom Schwebeknopf kommt. */
        const val VOM_KNOPF = "de.schreibhilfe.app.VOM_KNOPF"
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
