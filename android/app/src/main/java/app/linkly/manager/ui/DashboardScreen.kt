package app.linkly.manager.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
fun DashboardScreen(state: UiState, onNavigate: (String) -> Unit) {
    val dashboard = state.dashboard
    val numbers = dashboard?.numbers

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text(
                "RINGKASAN WORKSPACE",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(4.dp))
            Text("Semua akun, satu kendali.", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Text(
                "Pantau akun dan aplikasi yang Anda catat.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        if (dashboard?.demo == true) {
            item {
                Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = MaterialTheme.shapes.medium) {
                    Text(
                        "Mode data contoh aktif. Hapus dari Pengaturan bila tidak diperlukan.",
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(12.dp),
                    )
                }
            }
        }

        item {
            StatRow(
                "Akun" to (numbers?.accounts ?: 0).toString(),
                "Aplikasi" to (numbers?.apps ?: 0).toString(),
            )
            Spacer(Modifier.height(10.dp))
            StatRow(
                "Koneksi aktif" to (numbers?.activeConnections ?: 0).toString(),
                "Perlu ditinjau" to (numbers?.needsReview ?: 0).toString(),
            )
        }

        item {
            SectionCard(
                title = "Akun yang dikelola",
                trailing = { TextButton(onClick = { onNavigate("accounts") }) { Text("Lihat semua") } },
            ) {
                if (state.accounts.isEmpty()) {
                    EmptyMessage("Belum ada akun. Tambahkan akun pertama Anda di tab Akun.")
                } else {
                    state.accounts.take(5).forEachIndexed { index, account ->
                        Row(
                            Modifier.fillMaxWidth().padding(vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Avatar(typeInitial(account.type))
                            Column(Modifier.weight(1f)) {
                                Text(account.label, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                                Text(
                                    account.value,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Text(
                                typeLabel(account.type),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        if (index != state.accounts.take(5).lastIndex) {
                            HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = .5f))
                        }
                    }
                }
            }
        }

        item {
            SectionCard(
                title = "Perlu ditinjau",
                trailing = { TextButton(onClick = { onNavigate("apps") }) { Text("Lihat aplikasi") } },
            ) {
                val review = dashboard?.review.orEmpty()
                if (review.isEmpty()) {
                    EmptyMessage("Tidak ada keterkaitan yang perlu ditinjau.")
                } else {
                    review.forEach { link ->
                        Row(
                            Modifier.fillMaxWidth().padding(vertical = 7.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Avatar(link.appName.take(2))
                            Column(Modifier.weight(1f)) {
                                Text(link.appName, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                                Text(
                                    link.accountValue,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            StatusChip(link.status)
                        }
                    }
                }
            }
        }

        item {
            SectionCard(
                title = "Aktivitas terbaru",
                trailing = { TextButton(onClick = { onNavigate("history") }) { Text("Lihat semua") } },
            ) {
                val activity = dashboard?.activity.orEmpty()
                if (activity.isEmpty()) {
                    EmptyMessage("Belum ada aktivitas.")
                } else {
                    activity.forEach { item ->
                        Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                            Text(item.title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                            Text(
                                item.detail ?: "",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Text(
                                formatDateTime(item.createdAt),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }

        item {
            Text(
                "Linkly hanya mencatat tindakan Anda. Status \"dicabut\" perlu dikonfirmasi penyedia atau oleh Anda sendiri.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
