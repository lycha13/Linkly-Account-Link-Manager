package app.linkly.manager.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Apps
import androidx.compose.material.icons.outlined.DarkMode
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.LightMode
import androidx.compose.material.icons.outlined.Logout
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Dashboard
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import app.linkly.manager.data.UserSettings

private data class NavItem(val route: String, val label: String, val icon: ImageVector)

private val navItems = listOf(
    NavItem("dashboard", "Dashboard", Icons.Outlined.Dashboard),
    NavItem("accounts", "Akun", Icons.Outlined.Person),
    NavItem("apps", "Aplikasi", Icons.Outlined.Apps),
    NavItem("history", "Riwayat", Icons.Outlined.History),
    NavItem("settings", "Atur", Icons.Outlined.Settings),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScaffold(
    state: UiState,
    settings: UserSettings?,
    viewModel: LinklyViewModel,
) {
    val navController: NavHostController = rememberNavController()
    val backStack by navController.currentBackStackEntryAsState()
    val currentRoute = backStack?.destination?.route ?: "dashboard"
    val snackbar = remember { SnackbarHostState() }
    val context = LocalContext.current

    LaunchedEffect(state.message) {
        state.message?.let {
            snackbar.showSnackbar(it)
            viewModel.clearMessage()
        }
    }
    LaunchedEffect(state.error) {
        state.error?.let {
            snackbar.showSnackbar(it)
            viewModel.clearError()
        }
    }

    val isDetail = currentRoute.startsWith("app/")
    val title = when {
        currentRoute == "app/{slug}" || isDetail -> "Detail aplikasi"
        currentRoute == "dashboard" -> "Dashboard"
        currentRoute == "accounts" -> "Akun tertaut"
        currentRoute == "apps" -> "Daftar aplikasi"
        currentRoute == "history" -> "Riwayat aktivitas"
        currentRoute == "settings" -> "Pengaturan"
        else -> "Linkly"
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(title, fontWeight = FontWeight.Bold)
                        val theme = if (state.darkTheme) "Dark" else "Light"
                        Text(
                            "Linkly · $theme mode",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.setDarkTheme(!state.darkTheme) }) {
                        Icon(
                            if (state.darkTheme) Icons.Outlined.LightMode else Icons.Outlined.DarkMode,
                            contentDescription = "Ganti tema",
                        )
                    }
                    IconButton(onClick = viewModel::logout) {
                        Icon(Icons.Outlined.Logout, contentDescription = "Keluar")
                    }
                },
            )
        },
        bottomBar = {
            if (!isDetail) {
                NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                    navItems.forEach { item ->
                        NavigationBarItem(
                            selected = currentRoute == item.route,
                            onClick = {
                                navController.navigate(item.route) {
                                    popUpTo(navController.graph.startDestinationId) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = { Icon(item.icon, contentDescription = item.label) },
                            label = { Text(item.label, style = MaterialTheme.typography.labelSmall) },
                        )
                    }
                }
            }
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = "dashboard",
            modifier = Modifier.padding(innerPadding),
        ) {
            composable("dashboard") {
                DashboardScreen(state) { route -> navController.navigate(route) }
            }
            composable("accounts") {
                AccountsScreen(state, viewModel)
            }
            composable("apps") {
                AppsScreen(state, viewModel) { slug -> navController.navigate("app/$slug") }
            }
            composable("app/{slug}") { entry ->
                val slug = entry.arguments?.getString("slug") ?: ""
                AppDetailScreen(
                    state = state,
                    slug = slug,
                    viewModel = viewModel,
                    onBack = { navController.popBackStack() },
                )
            }
            composable("history") { HistoryScreen(state) }
            composable("settings") {
                SettingsScreen(
                    state = state,
                    settings = settings,
                    viewModel = viewModel,
                    openUrl = { url ->
                        runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
                    },
                )
            }
        }
    }

    state.pending?.let { pending ->
        AlertDialog(
            onDismissRequest = viewModel::dismissPending,
            title = { Text(pending.instructions.title.ifBlank { "Langkah resmi" }) },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    Text(pending.instructions.guide, style = MaterialTheme.typography.bodySmall)
                    pending.instructions.url?.let { url ->
                        Spacer(Modifier.height(8.dp))
                        Text(
                            url,
                            color = MaterialTheme.colorScheme.primary,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        TextButton(onClick = {
                            runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
                        }) { Text("Buka halaman resmi") }
                    }
                    if (pending.instructions.consequences.isNotEmpty()) {
                        Spacer(Modifier.height(10.dp))
                        Text("Konsekuensi", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodySmall)
                        pending.instructions.consequences.forEach {
                            Text("• $it", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    Text(
                        "Linkly tidak memverifikasi tindakan ini secara otomatis. Status hanya berubah setelah Anda menekan konfirmasi di bawah.",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = viewModel::confirmPending) { Text("Saya sudah menjalankannya") }
            },
            dismissButton = {
                TextButton(onClick = viewModel::dismissPending) { Text("Nanti saja") }
            },
        )
    }
}

@Composable
fun RowStat(label: String, value: String, modifier: Modifier = Modifier) {
    androidx.compose.material3.Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = MaterialTheme.shapes.medium,
        modifier = modifier,
    ) {
        Column(Modifier.padding(14.dp)) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(4.dp))
            Text(value, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
fun StatRow(vararg stats: Pair<String, String>) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        stats.forEach { (label, value) ->
            RowStat(label, value, Modifier.weight(1f))
        }
    }
}
