package com.satran.jobapply.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val LightColors = lightColorScheme(
    primary = Color(0xFF2E6B34),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFB2F1B0),
    onPrimaryContainer = Color(0xFF0A2109),
    secondary = Color(0xFF52634F),
    secondaryContainer = Color(0xFFD5E8CF),
    tertiary = Color(0xFF39656B),
    background = Color(0xFFFBFDF7),
    surface = Color(0xFFFBFDF7),
    surfaceVariant = Color(0xFFDEE5D9),
    error = Color(0xFFBA1A1A),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF97D796),
    onPrimary = Color(0xFF00390B),
    primaryContainer = Color(0xFF15521E),
    onPrimaryContainer = Color(0xFFB2F1B0),
    secondary = Color(0xFFB9CCB4),
    secondaryContainer = Color(0xFF3A4B38),
    tertiary = Color(0xFFA1CED5),
    background = Color(0xFF10140F),
    surface = Color(0xFF10140F),
    surfaceVariant = Color(0xFF424940),
    error = Color(0xFFFFB4AB),
)

/**
 * Şemada karşılığı olmayan, anlam taşıyan renkler.
 *
 * "Başvuruldu" işareti yeşil ana renkten ayrışsın diye mavi: yeşil zaten
 * seçim ve olumlu durum için kullanılıyor, ikisi karışmasın.
 */
@Immutable
data class SatranColors(
    val applied: Color,
)

private val LightExtras = SatranColors(applied = Color(0xFF1A56DB))
private val DarkExtras = SatranColors(applied = Color(0xFF8AB4F8))

val LocalSatranColors = staticCompositionLocalOf { LightExtras }

/** Tema dışı anlam renklerine kısa erişim. */
val satranColors: SatranColors
    @Composable get() = LocalSatranColors.current

@Composable
fun SatranTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colors = if (darkTheme) DarkColors else LightColors
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            // Kenardan kenara mod pencere rengini kendisi yonetir; burada yalnizca
            // durum cubugu simgelerinin kontrastini temaya gore ayarliyoruz.
            val window = (view.context as Activity).window
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
        }
    }

    CompositionLocalProvider(LocalSatranColors provides if (darkTheme) DarkExtras else LightExtras) {
        MaterialTheme(
            colorScheme = colors,
            typography = Typography(),
            content = content,
        )
    }
}
