package app.linkly.manager.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Purple = Color(0xFF6658E8)
val PurpleLight = Color(0xFF9B8DFF)
val Navy = Color(0xFF111827)
val NavyDeep = Color(0xFF0D1422)
val SurfaceLight = Color(0xFFF4F5FB)
val SurfaceDark = Color(0xFF151F31)
val Green = Color(0xFF12855F)
val GreenSoft = Color(0xFFE6F7EF)
val Amber = Color(0xFF94620C)
val AmberSoft = Color(0xFFFFF4DC)
val Red = Color(0xFFC93B4D)
val RedSoft = Color(0xFFFFF0F1)
val Muted = Color(0xFF6F7A90)

private val LightColors = lightColorScheme(
    primary = Purple,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFEEECFF),
    onPrimaryContainer = Color(0xFF2A2170),
    secondary = Navy,
    onSecondary = Color.White,
    background = SurfaceLight,
    onBackground = Color(0xFF172033),
    surface = Color.White,
    onSurface = Color(0xFF172033),
    surfaceVariant = SurfaceLight,
    onSurfaceVariant = Muted,
    outline = Color(0xFFE6E9F2),
    error = Red,
    errorContainer = RedSoft,
    onErrorContainer = Red,
)

private val DarkColors = darkColorScheme(
    primary = PurpleLight,
    onPrimary = Color(0xFF1A1140),
    primaryContainer = Color(0xFF241F45),
    onPrimaryContainer = Color(0xFFDAD4FF),
    secondary = Color(0xFFAEBBD0),
    background = NavyDeep,
    onBackground = Color(0xFFE9EEFB),
    surface = SurfaceDark,
    onSurface = Color(0xFFE9EEFB),
    surfaceVariant = Color(0xFF1B2536),
    onSurfaceVariant = Color(0xFF95A3BA),
    outline = Color(0xFF263248),
    error = Color(0xFFFF8A9B),
    errorContainer = Color(0xFF3A1620),
    onErrorContainer = Color(0xFFFF8A9B),
)

@Composable
fun LinklyTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = MaterialTheme.typography,
        content = content,
    )
}
