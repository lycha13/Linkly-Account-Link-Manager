package app.linkly.manager

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import app.linkly.manager.ui.AuthScreen
import app.linkly.manager.ui.LinklyViewModel
import app.linkly.manager.ui.MainScaffold
import app.linkly.manager.ui.theme.LinklyTheme

class MainActivity : ComponentActivity() {

    private val viewModel: LinklyViewModel by viewModels {
        LinklyViewModel.factory(application)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val state by viewModel.state.collectAsState()
            LinklyTheme(darkTheme = state.darkTheme) {
                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    when {
                        state.booting -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator()
                        }
                        state.user == null -> AuthScreen(
                            state = state,
                            onLogin = viewModel::login,
                            onRegister = viewModel::register,
                        )
                        else -> MainScaffold(
                            state = state,
                            settings = state.settings,
                            viewModel = viewModel,
                        )
                    }
                }
            }
        }
    }
}
