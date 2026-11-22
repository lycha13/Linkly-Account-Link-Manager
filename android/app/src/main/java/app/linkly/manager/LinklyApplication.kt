package app.linkly.manager

import android.app.Application
import app.linkly.manager.data.LinklyRepository
import app.linkly.manager.data.SessionStore

class LinklyApplication : Application() {

    lateinit var sessionStore: SessionStore
        private set
    lateinit var repository: LinklyRepository
        private set

    override fun onCreate() {
        super.onCreate()
        sessionStore = SessionStore(this)
        repository = LinklyRepository(sessionStore)
    }
}
