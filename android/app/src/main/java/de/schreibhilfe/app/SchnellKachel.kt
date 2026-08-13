package de.schreibhilfe.app

import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.service.quicksettings.TileService

/**
 * Die Kachel in den Schnelleinstellungen: von oben wischen, einmal tippen,
 * die Schreibhilfe ist da — egal in welcher App man gerade steckt.
 *
 * Der kurze Weg über das Markier-Menü hängt daran, ob die andere App fremde
 * Einträge überhaupt anbietet, und Xiaomi schiebt sie hinter das ⋮. Die Kachel
 * gehört dagegen zum System und ist immer an derselben Stelle.
 *
 * Einmalig hinzufügen: Schnelleinstellungen ganz aufziehen → Stift/Bearbeiten
 * → „Schreibhilfe“ nach oben ziehen.
 */
class SchnellKachel : TileService() {

    override fun onClick() {
        super.onClick()

        val start = Intent(this, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }

        /* Ab Android 14 wirft die alte Fassung von startActivityAndCollapse eine
           Ausnahme — dort ist nur noch der Weg über einen PendingIntent erlaubt.
           Das Handy, für das das hier gebaut wird, läuft auf Android 15. */
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startActivityAndCollapse(
                PendingIntent.getActivity(this, 0, start, PendingIntent.FLAG_IMMUTABLE)
            )
        } else {
            @Suppress("DEPRECATION")
            startActivityAndCollapse(start)
        }
    }
}
