package app.linkly.manager.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.linkly.manager.ui.theme.Amber
import app.linkly.manager.ui.theme.AmberSoft
import app.linkly.manager.ui.theme.Green
import app.linkly.manager.ui.theme.GreenSoft
import app.linkly.manager.ui.theme.Muted
import app.linkly.manager.ui.theme.Red
import app.linkly.manager.ui.theme.RedSoft
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

fun typeLabel(type: String): String = when (type) {
    "google" -> "Google"
    "email" -> "Email"
    "phone" -> "Nomor HP"
    else -> type
}

fun typeInitial(type: String): String = when (type) {
    "google" -> "G"
    "email" -> "@"
    "phone" -> "☎"
    else -> "?"
}

data class StatusMeta(val label: String, val tone: String)

fun statusMeta(status: String): StatusMeta = when (status) {
    "connected" -> StatusMeta("Terhubung", "ok")
    "review" -> StatusMeta("Perlu ditinjau", "warn")
    "revocation_pending" -> StatusMeta("Menunggu konfirmasi", "warn")
    "revoked_verified" -> StatusMeta("Dicabut · terverifikasi", "ok")
    "revoked_attested" -> StatusMeta("Dicabut · konfirmasi pengguna", "muted")
    "deletion_pending" -> StatusMeta("Penghapusan diproses", "warn")
    "deleted_attested" -> StatusMeta("Dihapus · konfirmasi pengguna", "muted")
    else -> StatusMeta(status, "muted")
}

fun formatDate(iso: String?): String {
    if (iso.isNullOrBlank()) return "—"
    return runCatching {
        val date = Instant.parse(iso).atZone(ZoneId.systemDefault()).toLocalDate()
        date.format(DateTimeFormatter.ofPattern("dd MMM yyyy"))
    }.getOrElse { iso.take(10).ifBlank { "—" } }
}

fun formatDateTime(iso: String?): String {
    if (iso.isNullOrBlank()) return "—"
    return runCatching {
        val zoned = Instant.parse(iso).atZone(ZoneId.systemDefault())
        zoned.format(DateTimeFormatter.ofPattern("dd MMM yyyy · HH:mm"))
    }.getOrElse { formatDate(iso) }
}

fun todayIsoDate(): String = LocalDate.now().toString()

@Composable
fun StatusChip(status: String, modifier: Modifier = Modifier) {
    val meta = statusMeta(status)
    val (background, foreground) = when (meta.tone) {
        "ok" -> GreenSoft to Green
        "warn" -> AmberSoft to Amber
        "muted" -> MaterialTheme.colorScheme.surfaceVariant to Muted
        else -> RedSoft to Red
    }
    Surface(
        color = background,
        shape = RoundedCornerShape(20.dp),
        modifier = modifier,
    ) {
        Text(
            text = meta.label,
            color = foreground,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp),
        )
    }
}

@Composable
fun Avatar(initial: String, modifier: Modifier = Modifier, color: Color = MaterialTheme.colorScheme.primaryContainer) {
    Surface(
        color = color,
        shape = RoundedCornerShape(12.dp),
        modifier = modifier.size(38.dp),
    ) {
        Column(
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = initial.take(2).uppercase(),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
            )
        }
    }
}

@Composable
fun SectionCard(
    title: String,
    modifier: Modifier = Modifier,
    trailing: (@Composable () -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(16.dp),
        tonalElevation = 0.dp,
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                trailing?.invoke()
            }
            Spacer(Modifier.height(10.dp))
            content()
        }
    }
}

@Composable
fun KeyValue(label: String, value: String) {
    Column(Modifier.padding(vertical = 7.dp)) {
        Text(label.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(6.dp))
        HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = .6f))
    }
}

@Composable
fun EmptyMessage(message: String) {
    Column(
        Modifier.fillMaxWidth().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(message, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
fun Dot(color: Color, modifier: Modifier = Modifier) {
    Spacer(
        modifier
            .size(8.dp)
            .clip(CircleShape)
            .background(color)
    )
}
