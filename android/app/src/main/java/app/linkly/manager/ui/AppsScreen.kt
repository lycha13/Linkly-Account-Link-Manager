package app.linkly.manager.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
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
import androidx.compose.ui.unit.dp
import app.linkly.manager.data.Account
import app.linkly.manager.data.AppInfo
import app.linkly.manager.data.LinkItem

@Composable
fun AppsScreen(state: UiState, viewModel: LinklyViewModel, onOpenApp: (String) -> Unit) {
    var query by remember { mutableStateOf("") }
    var onlyMine by remember { mutableStateOf(false) }
    var showAdd by remember { mutableStateOf(false) }

    val apps = state.apps.filter { app ->
        (!onlyMine || app.linkCount > 0) &&
            (query.isBlank() || "${app.name} ${app.category} ${app.linkedAccounts.joinToString(" ")}"
                .contains(query, ignoreCase = true))
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { showAdd = true },
                icon = { Icon(Icons.Filled.Add, contentDescription = null) },
                text = { Text("Catat keterkaitan") },
            )
        },
    ) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                Text("Inventaris", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                Text("Daftar aplikasi", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text(
                    "Keterkaitan hanya muncul bila Anda mencatatnya. Linkly tidak memindai perangkat.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            item {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    label = { Text("Cari aplikasi, kategori, atau akun") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                FilterChip(
                    selected = onlyMine,
                    onClick = { onlyMine = !onlyMine },
                    label = { Text("Hanya yang saya catat") },
                )
            }

            items(apps, key = { it.id }) { app ->
                SectionCard(
                    title = app.name,
                    trailing = { StatusChip(if (app.linkCount > 0) "connected" else "review") },
                ) {
                    Text(
                        "${app.category} · ${app.methods.joinToString { typeLabel(it) }}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        if (app.linkCount > 0) "${app.linkCount} keterkaitan tercatat" else "Belum dicatat",
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Spacer(Modifier.height(4.dp))
                    TextButton(onClick = { onOpenApp(app.slug) }) { Text("Detail aplikasi") }
                }
            }
            item { Spacer(Modifier.height(70.dp)) }
        }
    }

    if (showAdd) {
        AddLinkDialog(
            apps = state.apps,
            accounts = state.accounts,
            onDismiss = { showAdd = false },
            onSave = { appId, accountId, linkedAt, note ->
                viewModel.addLink(appId, accountId, linkedAt, note)
                showAdd = false
            },
        )
    }
}

@Composable
fun AppDetailScreen(
    state: UiState,
    slug: String,
    viewModel: LinklyViewModel,
    onBack: () -> Unit,
) {
    LaunchedEffect(slug) { viewModel.loadApp(slug) }
    var manage by remember { mutableStateOf<LinkItem?>(null) }
    var showAdd by remember { mutableStateOf(false) }
    val detail = state.appDetail

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            TextButton(onClick = onBack) { Text("← Kembali") }
        }
        if (detail == null || detail.app.slug != slug) {
            item { EmptyMessage("Memuat detail aplikasi…") }
        } else {
            val app = detail.app
            item {
                Text("INFORMASI LAYANAN", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                Text(app.name, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text(
                    "${app.category} · ${app.developer ?: "Pengembang tidak dicatat"}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(8.dp))
                OutlinedButton(onClick = { showAdd = true }) { Text("＋ Catat keterkaitan") }
            }
            item {
                SectionCard(title = "Keterkaitan akun Anda") {
                    if (detail.links.isEmpty()) {
                        EmptyMessage("Belum ada akun yang tercatat untuk aplikasi ini.")
                    } else {
                        detail.links.forEach { link ->
                            Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Column(Modifier.weight(1f)) {
                                        Text(link.accountValue, style = MaterialTheme.typography.bodyMedium)
                                        Text(
                                            "${typeLabel(link.method)} · ${formatDate(link.linkedAt)}",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                    StatusChip(link.status)
                                }
                                TextButton(onClick = { manage = link }) { Text("Kelola") }
                            }
                            HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = .5f))
                        }
                    }
                }
            }
            item {
                SectionCard(title = "Informasi aplikasi") {
                    KeyValue("Kategori", app.category)
                    KeyValue("Pengembang", app.developer ?: "—")
                    KeyValue("Metode login umum", app.methods.joinToString { typeLabel(it) })
                    KeyValue("Situs resmi", app.website ?: "—")
                    KeyValue("Izin umum", app.permissions.joinToString(" · "))
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Izin di atas adalah gambaran umum, bukan hasil pembacaan izin akun Anda.",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            item {
                SectionCard(title = "Memutus tautan") {
                    Text(app.unlink.guide, style = MaterialTheme.typography.bodySmall)
                    app.unlink.url?.let {
                        Spacer(Modifier.height(6.dp))
                        Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                    }
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Status hanya berubah setelah Anda mengonfirmasi langkah resmi sudah dijalankan.",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            item {
                SectionCard(title = "Penghapusan akun aplikasi") {
                    Text(app.deletion.guide, style = MaterialTheme.typography.bodySmall)
                    app.deletion.url?.let {
                        Spacer(Modifier.height(6.dp))
                        Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                    }
                }
            }
            item {
                SectionCard(title = "Batasan") {
                    Text(
                        "Linkly tidak menghapus akun Google, email utama, atau nomor HP Anda, dan tidak menyimpan kata sandi/OTP.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }
    }

    if (showAdd && detail != null) {
        AddLinkDialog(
            apps = state.apps,
            accounts = state.accounts,
            preselectAppId = detail.app.id,
            onDismiss = { showAdd = false },
            onSave = { appId, accountId, linkedAt, note ->
                viewModel.addLink(appId, accountId, linkedAt, note)
                showAdd = false
            },
        )
    }

    manage?.let { link ->
        ManageLinkDialog(link = link, viewModel = viewModel, onDismiss = { manage = null })
    }
}

@Composable
fun ManageLinkDialog(link: LinkItem, viewModel: LinklyViewModel, onDismiss: () -> Unit) {
    var confirmRemove by remember { mutableStateOf(false) }
    val canUnlink = link.status !in listOf(
        "revocation_pending", "revoked_attested", "revoked_verified", "deletion_pending", "deleted_attested"
    )

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("${link.appName} · ${link.accountValue}") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Status", style = MaterialTheme.typography.bodySmall)
                    StatusChip(link.status)
                }
                Spacer(Modifier.height(6.dp))
                Text("Metode: ${typeLabel(link.method)}", style = MaterialTheme.typography.bodySmall)
                Text("Sejak: ${formatDate(link.linkedAt)}", style = MaterialTheme.typography.bodySmall)
                if (link.scopes.isNotEmpty()) {
                    Text("Izin dicatat: ${link.scopes.joinToString(", ")}", style = MaterialTheme.typography.bodySmall)
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    "Status ini catatan Linkly, bukan bukti langsung dari penyedia.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(10.dp))
                HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = .5f))
                if (canUnlink) {
                    TextButton(onClick = {
                        viewModel.startUnlink(link.id)
                        onDismiss()
                    }) { Text("Mulai pemutusan tautan") }
                }
                if (link.status == "revocation_pending") {
                    TextButton(onClick = {
                        viewModel.confirmUnlinkNow(link.id)
                        onDismiss()
                    }) { Text("Saya sudah mencabut akses") }
                }
                if (link.status !in listOf("deletion_pending", "deleted_attested")) {
                    TextButton(onClick = {
                        viewModel.startDeletion(link.id)
                        onDismiss()
                    }) { Text("Penghapusan akun aplikasi") }
                }
                if (link.status == "deletion_pending") {
                    TextButton(onClick = {
                        viewModel.confirmDeletionNow(link.id)
                        onDismiss()
                    }) { Text("Tandai penghapusan selesai") }
                }
                if (link.status == "connected") {
                    TextButton(onClick = {
                        viewModel.markStatus(link.id, "review")
                        onDismiss()
                    }) { Text("Tandai perlu ditinjau") }
                }
                if (link.status == "review") {
                    TextButton(onClick = {
                        viewModel.markStatus(link.id, "connected")
                        onDismiss()
                    }) { Text("Tandai terhubung") }
                }
                TextButton(onClick = { confirmRemove = true }) {
                    Text("Hapus catatan dari Linkly", color = MaterialTheme.colorScheme.error)
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Tutup") } },
        dismissButton = null,
    )

    if (confirmRemove) {
        AlertDialog(
            onDismissRequest = { confirmRemove = false },
            title = { Text("Hapus catatan keterkaitan?") },
            text = { Text("Catatan dihapus dari Linkly. Aplikasi dan akun aslinya tidak berubah.") },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.removeLink(link.id)
                    confirmRemove = false
                    onDismiss()
                }) { Text("Hapus catatan", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { confirmRemove = false }) { Text("Batal") } },
        )
    }
}

@Composable
private fun AddLinkDialog(
    apps: List<AppInfo>,
    accounts: List<Account>,
    preselectAppId: String = "",
    onDismiss: () -> Unit,
    onSave: (appId: String, accountId: String, linkedAt: String?, note: String?) -> Unit,
) {
    if (apps.isEmpty()) {
        AlertDialog(
            onDismissRequest = onDismiss,
            title = { Text("Katalog belum siap") },
            text = { Text("Daftar aplikasi belum dimuat atau koneksi terputus.") },
            confirmButton = { TextButton(onClick = onDismiss) { Text("Tutup") } },
        )
        return
    }

    var appId by remember { mutableStateOf(preselectAppId.ifBlank { apps.first().id }) }
    var method by remember { mutableStateOf("google") }
    var accountId by remember { mutableStateOf("") }
    var expanded by remember { mutableStateOf(false) }
    var linkedAt by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }

    val selectedApp = apps.firstOrNull { it.id == appId } ?: apps.first()
    val methods = selectedApp.methods

    LaunchedEffect(appId, apps) {
        method = methods.firstOrNull() ?: "email"
        accountId = accounts.firstOrNull { it.type == method }?.id ?: ""
    }
    LaunchedEffect(method) {
        accountId = accounts.firstOrNull { it.type == method }?.id ?: ""
    }
    val availableAccounts = accounts.filter { it.type == method }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Catat keterkaitan") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                Box {
                    OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth()) {
                        Text("${selectedApp.name} · ${selectedApp.category}")
                    }
                    DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                        apps.forEach { app ->
                            DropdownMenuItem(
                                text = { Text("${app.name} — ${app.category}") },
                                onClick = { appId = app.id; expanded = false },
                            )
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
                Text("Metode masuk", style = MaterialTheme.typography.labelMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    methods.forEach { option ->
                        FilterChip(
                            selected = method == option,
                            onClick = { method = option },
                            label = { Text(typeLabel(option)) },
                        )
                    }
                }
                Spacer(Modifier.height(8.dp))
                Text("Akun", style = MaterialTheme.typography.labelMedium)
                if (availableAccounts.isEmpty()) {
                    Text(
                        "Belum ada akun ${typeLabel(method)}. Tambahkan dulu di tab Akun.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                } else {
                    availableAccounts.forEach { account ->
                        Row(
                            Modifier.fillMaxWidth().clickable { accountId = account.id },
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RadioButton(selected = accountId == account.id, onClick = { accountId = account.id })
                            Column {
                                Text(account.label, style = MaterialTheme.typography.bodySmall)
                                Text(
                                    account.value,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = linkedAt,
                    onValueChange = { linkedAt = it },
                    label = { Text("Tanggal keterkaitan (yyyy-MM-dd, opsional)") },
                    singleLine = true,
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
                    "Status awal \"Terhubung\" karena Anda menyatakannya demikian.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        confirmButton = {
            TextButton(onClick = {
                if (accountId.isBlank()) {
                    error = "Pilih akun terlebih dahulu."
                } else {
                    onSave(appId, accountId, linkedAt.ifBlank { null }, note.ifBlank { null })
                }
            }) { Text("Simpan") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Batal") } },
    )
}
