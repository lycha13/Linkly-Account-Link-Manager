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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import app.linkly.manager.data.Account

@Composable
fun AccountsScreen(state: UiState, viewModel: LinklyViewModel) {
    var query by remember { mutableStateOf("") }
    var filter by remember { mutableStateOf("") }
    var showAdd by remember { mutableStateOf(false) }
    var detail by remember { mutableStateOf<Account?>(null) }
    var toDelete by remember { mutableStateOf<Account?>(null) }

    val accounts = state.accounts.filter { account ->
        (filter.isBlank() || account.type == filter) &&
            (query.isBlank() || listOf(account.label, account.value).joinToString(" ").contains(query, ignoreCase = true))
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { showAdd = true },
                icon = { Icon(Icons.Filled.Add, contentDescription = null) },
                text = { Text("Tambah akun") },
            )
        },
    ) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                Text("Pusat akun", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                Text("Akun tertaut", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text(
                    "Menghapus di sini hanya menghapus catatan Linkly. Akun asli tidak berubah.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            item {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    label = { Text("Cari email, nomor HP, atau label") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(selected = filter.isEmpty(), onClick = { filter = "" }, label = { Text("Semua") })
                    FilterChip(selected = filter == "google", onClick = { filter = "google" }, label = { Text("Google") })
                    FilterChip(selected = filter == "email", onClick = { filter = "email" }, label = { Text("Email") })
                    FilterChip(selected = filter == "phone", onClick = { filter = "phone" }, label = { Text("HP") })
                }
            }
            if (accounts.isEmpty()) {
                item { EmptyMessage("Tidak ada akun yang cocok.") }
            }
            items(accounts, key = { it.id }) { account ->
                SectionCard(title = account.label) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Avatar(typeInitial(account.type))
                        Column(Modifier.weight(1f)) {
                            Text(account.value, style = MaterialTheme.typography.bodyMedium)
                            Text(
                                "${typeLabel(account.type)} · ${account.appCount} aplikasi",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    Spacer(Modifier.height(10.dp))
                    HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = .5f))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        TextButton(onClick = { detail = account }) { Text("Lihat detail") }
                        TextButton(onClick = { toDelete = account }) {
                            Text("Hapus catatan", color = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
            item { Spacer(Modifier.height(70.dp)) }
        }
    }

    if (showAdd) {
        AddAccountDialog(
            onDismiss = { showAdd = false },
            onSave = { type, label, value, note ->
                viewModel.addAccount(type, label, value, note)
                showAdd = false
            },
        )
    }

    detail?.let { account ->
        AlertDialog(
            onDismissRequest = { detail = null },
            title = { Text(account.label) },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    Text(account.value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(6.dp))
                    Text("Jenis: ${typeLabel(account.type)}", style = MaterialTheme.typography.bodySmall)
                    Text("Ditambahkan: ${formatDate(account.createdAt)}", style = MaterialTheme.typography.bodySmall)
                    account.note?.let { Text("Catatan: $it", style = MaterialTheme.typography.bodySmall) }
                    Spacer(Modifier.height(10.dp))
                    Text("Aplikasi yang memakai akun ini", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodySmall)
                    if (account.apps.isEmpty()) {
                        Text("Belum ada.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    } else {
                        account.apps.forEach { app ->
                            Row(
                                Modifier.fillMaxWidth().padding(vertical = 4.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(app.appName, style = MaterialTheme.typography.bodySmall)
                                StatusChip(app.status)
                            }
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { detail = null }) { Text("Tutup") } },
            dismissButton = {
                TextButton(onClick = {
                    val id = account.id
                    detail = null
                    viewModel.deleteAccountRecord(id)
                }) { Text("Hapus catatan", color = MaterialTheme.colorScheme.error) }
            },
        )
    }

    toDelete?.let { account ->
        AlertDialog(
            onDismissRequest = { toDelete = null },
            title = { Text("Hapus catatan akun?") },
            text = {
                Text(
                    "${account.label} akan dihapus dari Linkly beserta catatan keterkaitannya. " +
                        "Akun Google/email/nomor HP Anda tidak terhapus dan akses di layanan lain tidak berubah."
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.deleteAccountRecord(account.id)
                    toDelete = null
                }) { Text("Hapus catatan", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { toDelete = null }) { Text("Batal") } },
        )
    }
}

@Composable
private fun AddAccountDialog(
    onDismiss: () -> Unit,
    onSave: (type: String, label: String, value: String, note: String?) -> Unit,
) {
    var type by remember { mutableStateOf("google") }
    var label by remember { mutableStateOf("") }
    var value by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Tambah akun") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(selected = type == "google", onClick = { type = "google" }, label = { Text("Google") })
                    FilterChip(selected = type == "email", onClick = { type = "email" }, label = { Text("Email") })
                    FilterChip(selected = type == "phone", onClick = { type = "phone" }, label = { Text("HP") })
                }
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = label,
                    onValueChange = { label = it },
                    label = { Text("Label") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = value,
                    onValueChange = { value = it },
                    label = { Text(if (type == "phone") "Nomor HP" else "Alamat email") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = if (type == "phone") KeyboardType.Phone else KeyboardType.Email,
                    ),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = { Text("Catatan (opsional)") },
                    modifier = Modifier.fillMaxWidth(),
                )
                error?.let {
                    Spacer(Modifier.height(6.dp))
                    Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    "Jangan masukkan kata sandi atau kode OTP.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        confirmButton = {
            TextButton(onClick = {
                if (label.isBlank() || value.isBlank()) {
                    error = "Label dan nilai akun wajib diisi."
                } else {
                    onSave(type, label.trim(), value.trim(), note.ifBlank { null })
                }
            }) { Text("Simpan") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Batal") } },
    )
}
