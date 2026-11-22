package app.linkly.manager.ui

import android.app.Application
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import app.linkly.manager.LinklyApplication
import app.linkly.manager.data.Account
import app.linkly.manager.data.ActivityItem
import app.linkly.manager.data.AppDetailResponse
import app.linkly.manager.data.AppInfo
import app.linkly.manager.data.Dashboard
import app.linkly.manager.data.GoogleStatus
import app.linkly.manager.data.Instructions
import app.linkly.manager.data.LinkItem
import app.linkly.manager.data.LinklyRepository
import app.linkly.manager.data.SessionStore
import app.linkly.manager.data.User
import app.linkly.manager.data.UserSettings
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class PendingInstructions(
    val linkId: String,
    val instructions: Instructions,
    val kind: Kind,
) {
    enum class Kind { UNLINK, DELETE }
}

data class UiState(
    val booting: Boolean = true,
    val user: User? = null,
    val settings: UserSettings? = null,
    val google: GoogleStatus? = null,
    val dashboard: Dashboard? = null,
    val accounts: List<Account> = emptyList(),
    val apps: List<AppInfo> = emptyList(),
    val links: List<LinkItem> = emptyList(),
    val activity: List<ActivityItem> = emptyList(),
    val appDetail: AppDetailResponse? = null,
    val busy: Boolean = false,
    val message: String? = null,
    val error: String? = null,
    val pending: PendingInstructions? = null,
    val darkTheme: Boolean = false,
)

class LinklyViewModel(
    private val repository: LinklyRepository,
    private val sessionStore: SessionStore,
) : ViewModel() {

    private val _state = MutableStateFlow(UiState(darkTheme = sessionStore.theme == "dark"))
    val state: StateFlow<UiState> = _state.asStateFlow()

    init {
        if (repository.hasSession) {
            launch {
                val me = repository.me()
                _state.update { it.copy(user = me.user, settings = me.settings, google = me.google) }
                loadAll()
            }
        } else {
            _state.update { it.copy(booting = false) }
        }
    }

    /* ---------------- Helper ---------------- */

    private fun launch(block: suspend () -> Unit) {
        viewModelScope.launch {
            _state.update { it.copy(busy = true, error = null) }
            try {
                block()
            } catch (error: Exception) {
                _state.update { it.copy(error = error.message ?: "Terjadi kesalahan.") }
            } finally {
                _state.update { it.copy(busy = false, booting = false) }
            }
        }
    }

    private suspend fun loadAll() {
        val dashboard = repository.dashboard()
        val accounts = repository.accounts()
        val apps = repository.apps()
        val activity = repository.activity()
        val settings = repository.settings()
        val google = repository.googleStatus()
        _state.update {
            it.copy(
                dashboard = dashboard,
                accounts = accounts,
                apps = apps,
                activity = activity,
                settings = settings,
                google = google,
                booting = false,
            )
        }
    }

    fun refresh() = launch { loadAll() }

    fun clearMessage() = _state.update { it.copy(message = null) }
    fun clearError() = _state.update { it.copy(error = null) }

    /* ---------------- Autentikasi ---------------- */

    fun login(email: String, password: String) = launch {
        if (email.isBlank() || password.isBlank()) error("Email dan password wajib diisi.")
        val user = repository.login(email, password)
        _state.update { it.copy(user = user) }
        loadAll()
    }

    fun register(name: String, email: String, password: String) = launch {
        if (name.isBlank() || email.isBlank() || password.length < 8) {
            error("Nama, email, dan password minimal 8 karakter wajib diisi.")
        }
        val user = repository.register(name, email, password)
        _state.update { it.copy(user = user, message = "Workspace dibuat dengan data contoh.") }
        loadAll()
    }

    fun logout() = launch {
        repository.logout()
        _state.value = UiState(booting = false, darkTheme = _state.value.darkTheme)
    }

    fun deleteLinklyAccount() = launch {
        repository.deleteLinklyAccount()
        repository.logout()
        _state.value = UiState(booting = false, darkTheme = _state.value.darkTheme)
    }

    /* ---------------- Akun ---------------- */

    fun addAccount(type: String, label: String, value: String, note: String?) = launch {
        repository.createAccount(type, label, value, note)
        _state.update { it.copy(message = "Akun ditambahkan.") }
        loadAll()
    }

    fun deleteAccountRecord(id: String) = launch {
        val result = repository.deleteAccountRecord(id)
        _state.update {
            it.copy(message = "Catatan akun dihapus. ${result.removedLinks} keterkaitan ikut dihapus dari Linkly.")
        }
        loadAll()
    }

    /* ---------------- Aplikasi & keterkaitan ---------------- */

    fun loadApp(slug: String) = launch {
        _state.update { it.copy(appDetail = repository.app(slug)) }
    }

    fun addLink(appId: String, accountId: String, linkedAt: String?, note: String?) = launch {
        repository.createLink(appId, accountId, linkedAt, note)
        _state.update { it.copy(message = "Keterkaitan dicatat.") }
        loadAll()
        _state.value.appDetail?.app?.slug?.let { slug ->
            _state.update { it.copy(appDetail = repository.app(slug)) }
        }
    }

    fun markStatus(id: String, status: String) = launch {
        repository.patchLink(id, status)
        _state.update { it.copy(message = "Status diperbarui.") }
        loadAll()
    }

    fun removeLink(id: String) = launch {
        repository.deleteLink(id)
        _state.update { it.copy(message = "Catatan keterkaitan dihapus dari Linkly.") }
        loadAll()
    }

    fun startUnlink(id: String) = launch {
        val result = repository.startUnlink(id)
        _state.update {
            it.copy(
                pending = result.instructions?.let { info ->
                    PendingInstructions(id, info, PendingInstructions.Kind.UNLINK)
                },
                message = "Proses dicatat sebagai menunggu konfirmasi.",
            )
        }
        loadAll()
    }

    fun startDeletion(id: String) = launch {
        val result = repository.startDeletion(id)
        _state.update {
            it.copy(
                pending = result.instructions?.let { info ->
                    PendingInstructions(id, info, PendingInstructions.Kind.DELETE)
                },
                message = "Proses penghapusan dicatat.",
            )
        }
        loadAll()
    }

    fun confirmPending() = launch {
        val pending = _state.value.pending ?: return@launch
        when (pending.kind) {
            PendingInstructions.Kind.UNLINK -> repository.confirmUnlink(pending.linkId)
            PendingInstructions.Kind.DELETE -> repository.confirmDeletion(pending.linkId)
        }
        _state.update { it.copy(pending = null, message = "Status dicatat atas konfirmasi Anda.") }
        loadAll()
    }

    fun dismissPending() = _state.update { it.copy(pending = null) }

    /** Konfirmasi langsung dari dialog kelola keterkaitan (tanpa tahap instruksi). */
    fun confirmUnlinkNow(id: String) = launch {
        repository.confirmUnlink(id)
        _state.update { it.copy(message = "Pemutusan ditandai selesai atas konfirmasi Anda.") }
        loadAll()
    }

    fun confirmDeletionNow(id: String) = launch {
        repository.confirmDeletion(id)
        _state.update { it.copy(message = "Penghapusan ditandai selesai atas konfirmasi Anda.") }
        loadAll()
    }

    /* ---------------- Dukungan ---------------- */

    fun setDarkTheme(dark: Boolean) {
        sessionStore.theme = if (dark) "dark" else "light"
        _state.update { it.copy(darkTheme = dark) }
        viewModelScope.launch { runCatching { repository.updateSettings(theme = if (dark) "dark" else "light") } }
    }

    fun setReviewDays(days: Int) = launch {
        val settings = repository.updateSettings(reviewDays = days)
        _state.update { it.copy(settings = settings, message = "Periode tinjauan disimpan.") }
        loadAll()
    }

    fun openGoogleConnect(onUrl: (String) -> Unit) = launch {
        onUrl(repository.googleStart())
    }

    fun disconnectGoogle() = launch {
        val result = repository.googleDisconnect()
        _state.update {
            it.copy(
                message = if (result.verification == "google_api")
                    "Token dicabut dan dikonfirmasi Google."
                else "Koneksi Google dihapus dari Linkly.",
            )
        }
        loadAll()
    }

    fun resetDemo() = launch {
        repository.resetDemo()
        _state.update { it.copy(message = "Data contoh dimuat.") }
        loadAll()
    }

    fun clearWorkspace() = launch {
        repository.clearWorkspace()
        _state.update { it.copy(message = "Workspace dikosongkan.") }
        loadAll()
    }

    companion object {
        fun factory(application: Application): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    val app = application as LinklyApplication
                    return LinklyViewModel(app.repository, app.sessionStore) as T
                }
            }
    }
}
