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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import app.linkly.manager.data.UserSettings

@Composable
fun SettingsScreen(
    state: UiState,
    settings: UserSettings?,
    viewModel: LinklyViewModel,
    openUrl: (String) -> Unit,
) {
    var reviewDays by remember { mutableStateOf(settings?.reviewDays?.toString() ?: "180") }
    var showDisconnect by remember { mutableStateOf(false) }
    var showResetDemo by remember { mutableStateOf(false) }
    var showClear by remember { mutableStateOf(false) }
    var showDeleteAccount by remember { mutableStateOf(false) }

    LaunchedEffect(settings?.reviewDays) {
        settings?.reviewDays?.let { reviewDays = it.toString() }
    }

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Text("PREFERENSI", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
            Text("Pengaturan", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Text(
                "Tampilan, privasi, integrasi, dan pengelolaan data.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        item {
            SectionCard(title = "Tampilan") {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column {
                        Text("Dark mode", style = MaterialTheme.typography.bodyMedium)
                        Text(
                            "Tema disimpan di perangkat dan akun.",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Switch(checked = state.darkTheme, onCheckedChange = viewModel::setDarkTheme)
                }
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = reviewDays,
                    onValueChange = { reviewDays = it.filter(Char::isDigit) },
                    label = { Text("Periode tinjauan (hari)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    "Keterkaitan lebih lama dari periode ini ditandai perlu ditinjau.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(6.dp))
                Button(onClick = {
                    val days = reviewDays.toIntOrNull() ?: 0
                    if (days in 7..3650) viewModel.setReviewDays(days)
                }) { Text("Simpan periode") }
            }
        }

        item {
            SectionCard(title = "Akun Google") {
                val google = state.google
                when {
                    google == null -> Text("Memuat status…", style = MaterialTheme.typography.bodySmall)
                    !google.available -> {
                        Text(
                            "Integrasi Google belum aktif di server ini. Isi GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, dan ENCRYPTION_KEY pada .env server.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    google.connected -> {
                        Text("Terhubung sebagai ${google.email}", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                        Text(
                            "Izin: ${google.scopes.joinToString(", ")}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            if (google.canRevokeProgrammatically)
                                "Pencabutan token otomatis tersedia."
                            else "ENCRYPTION_KEY belum diatur; pencabutan token otomatis tidak tersedia.",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.height(8.dp))
                        OutlinedButton(onClick = { showDisconnect = true }) { Text("Putuskan koneksi Google") }
                        google.permissionsUrl?.let { url ->
                            TextButton(onClick = { openUrl(url) }) { Text("Buka izin Google untuk aplikasi lain") }
                        }
                    }
                    else -> {
                        Text(
                            "Hubungkan akun Google untuk mencatat identitas Google Anda. Hanya izin openid email profile.",
                            style = MaterialTheme.typography.bodySmall,
                        )
                        google.misconfigured?.let {
                            Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
                        }
                        Spacer(Modifier.height(8.dp))
                        Button(onClick = { viewModel.openGoogleConnect(openUrl) }) { Text("Hubungkan Google") }
                        Text(
                            "Halaman persetujuan Google akan terbuka di browser.",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }

        item {
            SectionCard(title = "Data Anda") {
                Text(
                    state.user?.let { "${it.name} · ${it.email}" } ?: "—",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.height(8.dp))
                OutlinedButton(onClick = { showResetDemo = true }) { Text("Muat ulang data contoh") }
                OutlinedButton(onClick = { showClear = true }) { Text("Kosongkan semua catatan") }
                TextButton(onClick = { showDeleteAccount = true }) {
                    Text("Hapus akun Linkly & seluruh data", color = MaterialTheme.colorScheme.error)
                }
                Spacer(Modifier.height(6.dp))
                Text(
                    "Ekspor JSON tersedia pada web app. Menghapus akun Linkly tidak memengaruhi akun Google/email/nomor HP Anda.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        item {
            SectionCard(title = "Privasi & keamanan") {
                listOf(
                    "Linkly tidak pernah meminta kata sandi, OTP, atau recovery code.",
                    "Hanya email, label, dan catatan yang disimpan — tanpa token di UI.",
                    "Token sesi Android disimpan di EncryptedSharedPreferences.",
                    "Tindakan berisiko memerlukan konfirmasi eksplisit.",
                    "Linkly tidak mengklaim memutus tautan tanpa bukti penyedia.",
                ).forEach { line ->
                    Text("• $line", style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(4.dp))
                }
            }
        }

        item {
            SectionCard(title = "Batas kemampuan") {
                Text(
                    "Linkly tidak dapat menemukan semua akun Anda di semua layanan dan tidak dapat menghapus akun Google, email utama, atau nomor HP. Tindakan eksternal mengikuti prosedur resmi penyedia.",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }

        item { Spacer(Modifier.height(12.dp)) }
    }

    if (showDisconnect) {
        AlertDialog(
            onDismissRequest = { showDisconnect = false },
            title = { Text("Putuskan koneksi Google?") },
            text = { Text("Linkly memanggil endpoint pencabutan token Google bila tersedia, lalu menghapus data koneksi. Akses aplikasi lain tidak terpengaruh.") },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.disconnectGoogle()
                    showDisconnect = false
                }) { Text("Putuskan") }
            },
            dismissButton = { TextButton(onClick = { showDisconnect = false }) { Text("Batal") } },
        )
    }
    if (showResetDemo) {
        AlertDialog(
            onDismissRequest = { showResetDemo = false },
            title = { Text("Muat ulang data contoh?") },
            text = { Text("Catatan akun dan keterkaitan Anda saat ini akan diganti data contoh.") },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.resetDemo()
                    showResetDemo = false
                }) { Text("Muat ulang") }
            },
            dismissButton = { TextButton(onClick = { showResetDemo = false }) { Text("Batal") } },
        )
    }
    if (showClear) {
        AlertDialog(
            onDismissRequest = { showClear = false },
            title = { Text("Kosongkan semua catatan?") },
            text = { Text("Seluruh akun, keterkaitan, dan riwayat di Linkly dihapus. Akun asli tidak berubah.") },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.clearWorkspace()
                    showClear = false
                }) { Text("Kosongkan") }
            },
            dismissButton = { TextButton(onClick = { showClear = false }) { Text("Batal") } },
        )
    }
    if (showDeleteAccount) {
        AlertDialog(
            onDismissRequest = { showDeleteAccount = false },
            title = { Text("Hapus akun Linkly?") },
            text = { Text("Seluruh data Linkly dihapus permanen dan Anda akan keluar. Tindakan ini tidak dapat dibatalkan.") },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.deleteLinklyAccount()
                    showDeleteAccount = false
                }) { Text("Hapus permanen", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { showDeleteAccount = false }) { Text("Batal") } },
        )
    }
}
