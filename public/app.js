/* Linkly — web client.
   Aplikasi satu halaman tanpa framework. Semua data berasal dari REST API
   di origin yang sama; sesi memakai cookie HttpOnly. */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const TYPE_LABEL = { google: "Google", email: "Email", phone: "Nomor HP" };
const TYPE_ICON = { google: "G", email: "@", phone: "☎" };

const STATUS = {
  connected: { label: "Terhubung", tone: "ok" },
  review: { label: "Perlu ditinjau", tone: "warn" },
  revocation_pending: { label: "Menunggu konfirmasi", tone: "warn" },
  revoked_verified: { label: "Dicabut · terverifikasi", tone: "ok" },
  revoked_attested: { label: "Dicabut · dikonfirmasi pengguna", tone: "muted" },
  deletion_pending: { label: "Penghapusan diproses", tone: "warn" },
  deleted_attested: { label: "Dihapus · dikonfirmasi pengguna", tone: "muted" },
};

const state = {
  user: null,
  settings: { theme: "light", reviewDays: 180, demoSeeded: false },
  google: null,
  accounts: [],
  apps: [],
  dashboard: null,
  route: "dashboard",
};

/* ---------------- Utilitas ---------------- */

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
}

function fmtDate(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("id-ID", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function statusChip(status) {
  const meta = STATUS[status] || { label: status, tone: "muted" };
  return `<span class="status-chip ${meta.tone}">${escapeHtml(meta.label)}</span>`;
}

function toast(message, type = "ok") {
  const element = $("#toast");
  element.textContent = message;
  element.className = `toast show ${type === "error" ? "error" : ""}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), 3200);
}

async function api(path, { method = "GET", body } = {}) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok) {
    const error = new Error(data?.error?.message || `Permintaan gagal (${response.status}).`);
    error.code = data?.error?.code;
    error.status = response.status;
    throw error;
  }
  return data;
}

/* ---------------- Modal ---------------- */

function openModal(html, onMount) {
  const root = $("#modalRoot");
  root.innerHTML = `<div class="modalbg" id="modalbg"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
  $("#modalbg").addEventListener("click", (event) => {
    if (event.target.id === "modalbg") closeModal();
  });
  if (onMount) onMount($(".modal", root));
  return root;
}

function closeModal() {
  $("#modalRoot").innerHTML = "";
}

function confirmModal({ title, message, confirmLabel = "Lanjutkan", danger = true, requireTyping = null, onConfirm }) {
  openModal(
    `<h2>${escapeHtml(title)}</h2>
     <p class="sub">${message}</p>
     ${requireTyping ? `<label class="field"><span>Ketik <b>${escapeHtml(requireTyping)}</b> untuk melanjutkan</span><input id="confirmTyping" autocomplete="off"></label>` : ""}
     <p class="form-error hidden" id="confirmError"></p>
     <div class="modalfoot">
       <button class="btn soft" type="button" data-action="close-modal">Batal</button>
       <button class="btn ${danger ? "danger" : "primary"}" type="button" id="confirmBtn">${escapeHtml(confirmLabel)}</button>
     </div>`,
    (modal) => {
      $("#confirmBtn", modal).addEventListener("click", async () => {
        if (requireTyping && $("#confirmTyping", modal).value.trim() !== requireTyping) {
          const error = $("#confirmError", modal);
          error.textContent = `Ketik ${requireTyping} dengan huruf kapital.`;
          error.classList.remove("hidden");
          return;
        }
        const button = $("#confirmBtn", modal);
        button.disabled = true;
        try {
          await onConfirm();
          closeModal();
        } catch (error) {
          const box = $("#confirmError", modal);
          box.textContent = error.message;
          box.classList.remove("hidden");
          button.disabled = false;
        }
      });
    }
  );
}

/* ---------------- Tema ---------------- */

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
  localStorage.setItem("linkly-theme", theme);
}

function currentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

async function toggleTheme() {
  const next = currentTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
  if (state.user) {
    state.settings.theme = next;
    try {
      await api("/api/settings", { method: "PATCH", body: { theme: next } });
    } catch (error) {
      toast(error.message, "error");
    }
  }
}

/* ---------------- Navigasi ---------------- */

function navigate(route) {
  if (location.hash !== `#/${route}`) {
    location.hash = `#/${route}`;
  } else {
    render();
  }
}

function setActiveNav(route) {
  const base = route.split("/")[0];
  $$(".nav button").forEach((button) => {
    button.classList.toggle("active", button.dataset.route === base);
  });
  const titles = {
    dashboard: "Dashboard",
    accounts: "Akun tertaut",
    apps: "Daftar aplikasi",
    history: "Riwayat aktivitas",
    android: "Aplikasi Android",
    settings: "Pengaturan",
  };
  $("#crumb").textContent = titles[base] || "Linkly";
}

async function render() {
  if (!state.user) return;
  const [route, query] = (location.hash.replace(/^#\/?/, "") || "dashboard").split("?");
  state.route = route || "dashboard";
  setActiveNav(state.route);
  $("#side").classList.remove("open");

  const parts = state.route.split("/");
  const view = $("#view");
  view.innerHTML = `<div class="empty">Memuat…</div>`;
  try {
    if (parts[0] === "dashboard") await viewDashboard();
    else if (parts[0] === "accounts") await viewAccounts();
    else if (parts[0] === "apps" && parts[1]) await viewAppDetail(parts[1]);
    else if (parts[0] === "apps") await viewApps();
    else if (parts[0] === "history") await viewHistory();
    else if (parts[0] === "android") await viewAndroid();
    else if (parts[0] === "settings") await viewSettings(new URLSearchParams(query || ""));
    else {
      view.innerHTML = `<div class="empty">Halaman tidak ditemukan. <button class="link" data-action="nav" data-route="dashboard">Kembali ke dashboard</button></div>`;
    }
  } catch (error) {
    if (error.status === 401) return showAuth();
    view.innerHTML = `<div class="card"><h2>Gagal memuat</h2><p class="muted">${escapeHtml(error.message)}</p>
      <button class="btn primary" data-action="reload">Coba lagi</button></div>`;
  }
}

function header(eyebrow, title, description, actions = "") {
  return `<div class="head">
    <div><p class="eyebrow">${escapeHtml(eyebrow)}</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div>
    <div class="head-actions">${actions}</div>
  </div>`;
}

/* ---------------- Dashboard ---------------- */

async function viewDashboard() {
  const data = await api("/api/dashboard");
  state.dashboard = data;
  state.settings.demoSeeded = data.demo;
  $("#demoPill").classList.toggle("hidden", !data.demo);

  const accounts = data.accounts
    .map((account) => `
      <div class="item">
        <div class="ico ${account.type}">${TYPE_ICON[account.type]}</div>
        <div class="meta"><b>${escapeHtml(account.label)}</b><small>${escapeHtml(account.value)}</small></div>
        <span class="count">${TYPE_LABEL[account.type]}</span>
      </div>`)
    .join("") || `<div class="empty">Belum ada akun. Tambahkan akun pertama Anda.</div>`;

  const review = data.review
    .map((link) => `
      <div class="item">
        <div class="ico">${escapeHtml(link.appName.slice(0, 2).toUpperCase())}</div>
        <div class="meta"><b>${escapeHtml(link.appName)}</b><small>${escapeHtml(link.accountValue)}</small></div>
        ${statusChip(link.status)}
      </div>`)
    .join("") || `<div class="empty">Tidak ada keterkaitan yang perlu ditinjau.</div>`;

  const activity = data.activity
    .map((item) => `
      <div class="item">
        <div class="ico rotate">↻</div>
        <div class="meta"><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.detail || "")}</small></div>
        <span class="count">${escapeHtml(fmtDateTime(item.createdAt))}</span>
      </div>`)
    .join("") || `<div class="empty">Belum ada aktivitas.</div>`;

  $("#view").innerHTML = `
    ${header("Ringkasan workspace", "Semua akun, satu kendali.",
      "Pantau akun dan aplikasi yang Anda catat dari satu tempat.",
      `<button class="btn primary" data-action="add-account">＋ Tambah akun</button>
       <button class="btn outline" data-action="add-link">＋ Catat keterkaitan</button>`)}

    ${data.demo ? `<div class="notice"><b>Mode data contoh.</b> Sebagian entri adalah contoh agar Anda bisa mencoba alur kerja.
      Hapus kapan saja di <button class="link" data-action="nav" data-route="settings">Pengaturan</button>.</div>` : ""}

    <div class="stats">
      <div class="stat"><span>Akun tersimpan</span><b>${data.numbers.accounts}</b><small>Google, email, nomor HP</small></div>
      <div class="stat"><span>Aplikasi tercatat</span><b>${data.numbers.apps}</b><small>Dari katalog Anda</small></div>
      <div class="stat"><span>Koneksi aktif</span><b>${data.numbers.activeConnections}</b><small>Status terhubung/perlu ditinjau</small></div>
      <div class="stat"><span>Perlu ditinjau</span><b>${data.numbers.needsReview}</b><small>Termasuk yang sudah lama</small></div>
    </div>

    <div class="columns">
      <div class="card">
        <h2>Akun yang dikelola <button class="link" data-action="nav" data-route="accounts">Lihat semua →</button></h2>
        ${accounts}
      </div>
      <div class="card">
        <h2>Perlu ditinjau <button class="link" data-action="nav" data-route="apps">Lihat aplikasi →</button></h2>
        ${review}
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <h2>Aktivitas terbaru <button class="link" data-action="nav" data-route="history">Lihat semua →</button></h2>
      ${activity}
      <p class="note-box" style="margin:14px 0 0">Linkly hanya mencatat tindakan yang Anda lakukan di dalam aplikasi ini. Status "dicabut" perlu dikonfirmasi penyedia atau oleh Anda sendiri.</p>
    </div>`;
}

/* ---------------- Akun ---------------- */

async function viewAccounts() {
  const data = await api("/api/accounts");
  state.accounts = data.accounts;
  $("#view").innerHTML = `
    ${header("Pusat akun", "Akun tertaut",
      "Kelola identitas yang Anda gunakan untuk masuk ke berbagai aplikasi.",
      `<button class="btn primary" data-action="add-account">＋ Tambah akun</button>
       <button class="btn outline" data-action="add-link">＋ Catat keterkaitan</button>`)}
    <div class="notice">Menghapus akun di sini hanya menghapus <b>catatan di Linkly</b>. Akun Google, email, dan nomor HP asli tidak berubah,
      dan tautan pada layanan lain tidak otomatis terputus.</div>
    <div class="toolbar">
      <input id="accountSearch" placeholder="Cari email, nomor HP, atau label…" autocomplete="off">
      <select id="accountFilter">
        <option value="">Semua jenis</option>
        <option value="google">Google</option>
        <option value="email">Email</option>
        <option value="phone">Nomor HP</option>
      </select>
    </div>
    <div class="cards" id="accountCards"></div>`;

  const paint = () => {
    const query = $("#accountSearch").value.toLowerCase();
    const type = $("#accountFilter").value;
    const list = state.accounts.filter(
      (account) =>
        (!type || account.type === type) &&
        (!query || `${account.label} ${account.value} ${account.note || ""}`.toLowerCase().includes(query))
    );
    $("#accountCards").innerHTML = list
      .map((account) => `
        <div class="accountcard">
          <div class="accounttop">
            <div class="ico ${account.type}">${TYPE_ICON[account.type]}</div>
            <div class="meta"><b>${escapeHtml(account.label)}</b><small>${escapeHtml(account.value)}</small></div>
            <span class="count">${TYPE_LABEL[account.type]}</span>
          </div>
          <div class="chips">
            ${account.apps.length
              ? account.apps.map((app) => `<span class="chip">${escapeHtml(app.appName)}</span>`).join("")
              : `<span class="chip">Belum ada aplikasi tercatat</span>`}
          </div>
          <div class="actions">
            <button class="link" data-action="account-detail" data-id="${account.id}">Lihat detail</button>
            <button class="link danger" data-action="account-delete" data-id="${account.id}">Hapus catatan</button>
          </div>
        </div>`)
      .join("") || `<div class="empty">Tidak ada akun yang cocok.</div>`;
  };
  $("#accountSearch").addEventListener("input", paint);
  $("#accountFilter").addEventListener("change", paint);
  paint();
}

async function showAccountDetail(id) {
  const data = await api(`/api/accounts/${id}`);
  const { account, links } = data;
  openModal(
    `<h2>${escapeHtml(account.label)}</h2>
     <p class="sub">${escapeHtml(account.value)}</p>
     <div class="kv"><span>Jenis akun</span><b>${TYPE_LABEL[account.type]}</b></div>
     <div class="kv"><span>Ditambahkan</span><b>${fmtDate(account.createdAt)}</b></div>
     ${account.note ? `<div class="kv"><span>Catatan</span><b>${escapeHtml(account.note)}</b></div>` : ""}
     <h2 style="margin-top:18px;font-size:13px">Aplikasi yang memakai akun ini</h2>
     ${links.length
       ? links.map((link) => `
          <div class="item">
            <div class="ico">${escapeHtml(link.appName.slice(0, 2).toUpperCase())}</div>
            <div class="meta"><b>${escapeHtml(link.appName)}</b><small>${escapeHtml(link.method)} · ${fmtDate(link.linkedAt)}</small></div>
            ${statusChip(link.status)}
          </div>`).join("")
       : `<div class="empty">Belum ada aplikasi yang dicatat memakai akun ini.</div>`}
     <p class="note-box" style="margin-top:12px">Daftar ini berasal dari catatan Anda, bukan hasil pemindaian layanan.</p>
     <div class="modalfoot">
       <button class="btn soft" data-action="close-modal">Tutup</button>
       <button class="btn primary" data-action="add-link">Catat keterkaitan</button>
     </div>`
  );
}

function addAccountModal() {
  openModal(
    `<h2>Tambah akun</h2>
     <p class="sub">Simpan identitas yang Anda pakai untuk masuk ke aplikasi. Jangan masukkan kata sandi atau kode OTP.</p>
     <p class="form-error hidden" id="modalError"></p>
     <label class="field"><span>Jenis akun</span>
       <select id="accType">
         <option value="google">Google</option>
         <option value="email">Email</option>
         <option value="phone">Nomor HP</option>
       </select>
     </label>
     <label class="field"><span>Label</span><input id="accLabel" maxlength="80" placeholder="Contoh: Email pribadi"></label>
     <label class="field"><span>Email / nomor HP</span><input id="accValue" maxlength="120" placeholder="nama@email.com atau +62 812-3456-7890"></label>
     <label class="field"><span>Catatan (opsional)</span><input id="accNote" maxlength="300" placeholder="Misalnya: dipakai untuk belanja"></label>
     <div class="modalfoot">
       <button class="btn soft" type="button" data-action="close-modal">Batal</button>
       <button class="btn primary" type="button" id="saveAcc">Simpan akun</button>
     </div>`,
    (modal) => {
      $("#saveAcc", modal).addEventListener("click", async () => {
        const errorBox = $("#modalError", modal);
        try {
          await api("/api/accounts", {
            method: "POST",
            body: {
              type: $("#accType", modal).value,
              label: $("#accLabel", modal).value,
              value: $("#accValue", modal).value,
              note: $("#accNote", modal).value || null,
            },
          });
          closeModal();
          toast("Akun ditambahkan.");
          render();
        } catch (error) {
          errorBox.textContent = error.message;
          errorBox.classList.remove("hidden");
        }
      });
    }
  );
}

function deleteAccountRecord(id) {
  const account = state.accounts.find((item) => item.id === id);
  confirmModal({
    title: "Hapus catatan akun?",
    message: `<b>${escapeHtml(account?.label || "Akun")}</b> akan dihapus dari inventaris Linkly beserta catatan keterkaitannya.
      Ini <b>tidak</b> menghapus akun Google/email/nomor HP Anda dan tidak memutus akses di layanan lain.`,
    confirmLabel: "Hapus catatan",
    onConfirm: async () => {
      const result = await api(`/api/accounts/${id}`, { method: "DELETE" });
      toast(`Catatan akun dihapus. ${result.removedLinks} keterkaitan ikut dihapus.`);
      render();
    },
  });
}

/* ---------------- Katalog aplikasi ---------------- */

async function viewApps() {
  const data = await api("/api/apps");
  state.apps = data.apps;
  $("#view").innerHTML = `
    ${header("Inventaris", "Daftar aplikasi",
      "Aplikasi yang Anda catat, lengkap dengan metode masuk dan panduan pengelolaannya.",
      `<button class="btn primary" data-action="add-link">＋ Catat keterkaitan</button>`)}
    <div class="notice">Katalog ini adalah pustaka aplikasi umum dari Linkly. Keterkaitan hanya muncul bila <b>Anda</b> mencatatnya —
      Linkly tidak memindai perangkat atau akun Anda.</div>
    <div class="toolbar">
      <input id="appSearch" placeholder="Cari aplikasi, kategori, atau akun…" autocomplete="off">
      <select id="appFilter">
        <option value="">Semua aplikasi</option>
        <option value="mine">Hanya yang saya catat</option>
      </select>
    </div>
    <div class="tablewrap">
      <table>
        <thead><tr><th>Aplikasi</th><th>Kategori</th><th>Metode login</th><th>Akun Anda</th><th>Status</th><th></th></tr></thead>
        <tbody id="appRows"></tbody>
      </table>
    </div>`;

  const paint = () => {
    const query = $("#appSearch").value.toLowerCase();
    const onlyMine = $("#appFilter").value === "mine";
    const list = state.apps.filter(
      (app) =>
        (!onlyMine || app.linkCount > 0) &&
        (!query || `${app.name} ${app.category} ${app.linkedAccounts.join(" ")}`.toLowerCase().includes(query))
    );
    $("#appRows").innerHTML = list
      .map((app) => `
        <tr>
          <td><div class="appname"><span class="appico">${escapeHtml(app.name.slice(0, 2).toUpperCase())}</span>${escapeHtml(app.name)}</div></td>
          <td>${escapeHtml(app.category)}</td>
          <td>${app.methods.map((method) => TYPE_LABEL[method]).join(", ")}</td>
          <td>${app.linkCount ? `${app.linkCount} keterkaitan` : `<span class="muted">Belum dicatat</span>`}</td>
          <td>${app.linkCount ? `<span class="status-chip ok">Tercatat</span>` : `<span class="status-chip muted">—</span>`}</td>
          <td><button class="link" data-action="app-detail" data-slug="${app.slug}">Detail</button></td>
        </tr>`)
      .join("") || `<tr><td colspan="6" class="empty">Tidak ada aplikasi yang cocok.</td></tr>`;
  };
  $("#appSearch").addEventListener("input", paint);
  $("#appFilter").addEventListener("change", paint);
  paint();
}

async function viewAppDetail(slug) {
  const data = await api(`/api/apps/${encodeURIComponent(slug)}`);
  const app = data.app;
  const links = data.links;
  $("#crumb").textContent = app.name;

  $("#view").innerHTML = `
    <div class="head">
      <div>
        <p class="eyebrow">Informasi layanan</p>
        <h1>${escapeHtml(app.name)}</h1>
        <p>${escapeHtml(app.category)} · ${escapeHtml(app.developer || "Pengembang tidak dicatat")}</p>
      </div>
      <div class="head-actions">
        <button class="btn outline" data-action="nav" data-route="apps">← Kembali</button>
        <button class="btn primary" data-action="add-link" data-app="${app.id}">＋ Catat keterkaitan</button>
      </div>
    </div>

    <div class="detail-grid">
      <div class="stack">
        <div class="card">
          <h2>Keterkaitan akun Anda</h2>
          ${links.length
            ? `<div class="tablewrap" style="border:0">
                <table style="min-width:520px">
                  <thead><tr><th>Akun</th><th>Metode</th><th>Status</th><th>Sejak</th><th></th></tr></thead>
                  <tbody>
                    ${links.map((link) => `<tr>
                      <td>${escapeHtml(link.accountValue)}</td>
                      <td>${TYPE_LABEL[link.method]}</td>
                      <td>${statusChip(link.status)}${link.needsReview ? ` <span class="status-chip warn">Tinjau</span>` : ""}</td>
                      <td>${fmtDate(link.linkedAt)}</td>
                      <td><button class="link" data-action="link-detail" data-id="${link.id}">Kelola</button></td>
                    </tr>`).join("")}
                  </tbody>
                </table>
              </div>`
            : `<div class="empty">Belum ada akun yang tercatat untuk aplikasi ini.</div>`}
        </div>

        <div class="card">
          <h2>Informasi aplikasi</h2>
          <div class="kv"><span>Kategori</span><b>${escapeHtml(app.category)}</b></div>
          <div class="kv"><span>Pengembang</span><b>${escapeHtml(app.developer || "—")}</b></div>
          <div class="kv"><span>Metode login yang umum</span><b>${app.methods.map((m) => TYPE_LABEL[m]).join(", ")}</b></div>
          <div class="kv"><span>Situs resmi</span><b>${app.website ? `<a href="${escapeHtml(app.website)}" target="_blank" rel="noopener noreferrer">${escapeHtml(app.website)}</a>` : "—"}</b></div>
          <div class="kv"><span>Izin yang umum diminta</span><b>${app.permissions.map(escapeHtml).join(" · ")}</b></div>
          <p class="note-box" style="margin-top:12px">Izin di atas adalah gambaran umum dari Linkly, bukan hasil pembacaan izin akun Anda.</p>
        </div>
      </div>

      <div class="stack">
        <div class="card">
          <h2>Memutus tautan</h2>
          <p class="small muted" style="margin-top:0">${escapeHtml(app.unlink.guide)}</p>
          ${app.unlink.url
            ? `<p class="small"><a href="${escapeHtml(app.unlink.url)}" target="_blank" rel="noopener noreferrer">Buka halaman resmi pengelolaan akses</a></p>`
            : `<p class="warning">Penyedia ini tidak memiliki URL pengelolaan yang terdokumentasi; ikuti langkah di atas dari dalam aplikasinya.</p>`}
          <p class="note-box">Linkly tidak dapat memanggil API internal layanan ini. Status hanya berubah setelah Anda mengonfirmasi langkah resmi sudah dijalankan.</p>
        </div>
        <div class="card">
          <h2>Menghapus akun aplikasi</h2>
          <p class="small muted" style="margin-top:0">${escapeHtml(app.deletion.guide)}</p>
          ${app.deletion.url
            ? `<p class="small"><a href="${escapeHtml(app.deletion.url)}" target="_blank" rel="noopener noreferrer">Buka prosedur resmi penghapusan akun</a></p>`
            : `<p class="warning">Penghapusan dilakukan melalui pengaturan/pusat bantuan aplikasi tersebut.</p>`}
        </div>
        <div class="card">
          <h2>Batasan</h2>
          <p class="small muted">Linkly tidak menghapus akun Google, email utama, atau nomor HP Anda. Linkly juga tidak menyimpan kata sandi atau OTP.</p>
        </div>
      </div>
    </div>`;
}

async function addLinkModal(preselectAppId = "") {
  try {
    if (!state.apps.length) state.apps = (await api("/api/apps")).apps;
    if (!state.accounts.length) state.accounts = (await api("/api/accounts")).accounts;
  } catch (error) {
    toast(error.message, "error");
    return;
  }
  const apps = state.apps;
  openModal(
    `<h2>Catat keterkaitan</h2>
     <p class="sub">Hubungkan akun yang Anda miliki dengan aplikasi tempat akun itu dipakai.</p>
     <p class="form-error hidden" id="modalError"></p>
     <label class="field"><span>Aplikasi</span><select id="linkApp">
       ${apps.map((app) => `<option value="${app.id}" ${app.id === preselectAppId ? "selected" : ""}>${escapeHtml(app.name)} — ${escapeHtml(app.category)}</option>`).join("")}
     </select></label>
     <label class="field"><span>Metode masuk</span><select id="linkMethod"></select></label>
     <label class="field"><span>Akun</span><select id="linkAccount"></select></label>
     <label class="field"><span>Tanggal keterkaitan (opsional)</span><input id="linkDate" type="date"></label>
     <label class="field"><span>Catatan (opsional)</span><input id="linkNote" maxlength="300" placeholder="Misalnya: akun lama, akan ditinjau"></label>
     <div class="warning">Linkly mencatat apa yang Anda masukkan. Status awal adalah "Terhubung" karena Anda menyatakannya demikian.</div>
     <div class="modalfoot">
       <button class="btn soft" type="button" data-action="close-modal">Batal</button>
       <button class="btn primary" type="button" id="saveLink">Simpan</button>
     </div>`,
    (modal) => {
      const appSelect = $("#linkApp", modal);
      const methodSelect = $("#linkMethod", modal);
      const accountSelect = $("#linkAccount", modal);

      const refreshMethods = () => {
        const app = apps.find((item) => item.id === appSelect.value);
        methodSelect.innerHTML = app.methods
          .map((method) => `<option value="${method}">${TYPE_LABEL[method]}</option>`)
          .join("");
        refreshAccounts();
      };
      const refreshAccounts = () => {
        const options = state.accounts.filter((account) => account.type === methodSelect.value);
        accountSelect.innerHTML = options
          .map((account) => `<option value="${account.id}">${escapeHtml(account.label)} · ${escapeHtml(account.value)}</option>`)
          .join("") || `<option value="">Belum ada akun jenis ini</option>`;
      };
      appSelect.addEventListener("change", refreshMethods);
      methodSelect.addEventListener("change", refreshAccounts);
      refreshMethods();

      $("#saveLink", modal).addEventListener("click", async () => {
        const errorBox = $("#modalError", modal);
        if (!accountSelect.value) {
          errorBox.textContent = "Tambahkan akun dengan jenis ini terlebih dahulu.";
          errorBox.classList.remove("hidden");
          return;
        }
        try {
          await api("/api/links", {
            method: "POST",
            body: {
              appId: appSelect.value,
              accountId: accountSelect.value,
              linkedAt: $("#linkDate", modal).value || null,
              note: $("#linkNote", modal).value || null,
            },
          });
          closeModal();
          toast("Keterkaitan dicatat.");
          render();
        } catch (error) {
          errorBox.textContent = error.message;
          errorBox.classList.remove("hidden");
        }
      });
    }
  );
}

/* ---------------- Detail keterkaitan ---------------- */

async function showLinkDetail(id) {
  const data = await api(`/api/links/${id}`);
  const link = data.link;
  const canUnlink = !["revocation_pending", "revoked_attested", "revoked_verified", "deletion_pending", "deleted_attested"].includes(link.status);

  openModal(
    `<h2>${escapeHtml(link.appName)}</h2>
     <p class="sub">${escapeHtml(link.accountValue)} · ${TYPE_LABEL[link.method]}</p>
     <div class="kv"><span>Status</span><b>${statusChip(link.status)}</b></div>
     <div class="kv"><span>Kategori</span><b>${escapeHtml(link.appCategory)}</b></div>
     <div class="kv"><span>Tanggal keterkaitan</span><b>${fmtDate(link.linkedAt)}</b></div>
     <div class="kv"><span>Izin yang Anda catat</span><b>${link.scopes.length ? link.scopes.map(escapeHtml).join(", ") : "Tidak dicatat"}</b></div>
     ${link.note ? `<div class="kv"><span>Catatan</span><b>${escapeHtml(link.note)}</b></div>` : ""}
     <div class="warning" style="margin-top:12px">Status ini adalah catatan Linkly, bukan bukti langsung dari penyedia layanan.</div>
     <div class="actions-list" style="margin-top:14px">
       ${canUnlink ? `<button class="btn danger" data-action="link-unlink" data-id="${link.id}">Mulai pemutusan tautan</button>` : ""}
       ${link.status === "revocation_pending" ? `<button class="btn primary" data-action="link-unlink-confirm" data-id="${link.id}">Saya sudah mencabut akses</button>` : ""}
       ${!["deletion_pending", "deleted_attested"].includes(link.status) ? `<button class="btn outline" data-action="link-delete-account" data-id="${link.id}">Penghapusan akun aplikasi</button>` : ""}
       ${link.status === "deletion_pending" ? `<button class="btn primary" data-action="link-delete-confirm" data-id="${link.id}">Tandai penghapusan selesai</button>` : ""}
       ${link.status === "connected" ? `<button class="btn soft" data-action="link-review" data-id="${link.id}">Tandai perlu ditinjau</button>` : ""}
       ${link.status === "review" ? `<button class="btn soft" data-action="link-mark-connected" data-id="${link.id}">Tandai terhubung</button>` : ""}
       <button class="btn ghost" data-action="link-remove" data-id="${link.id}">Hapus catatan dari Linkly</button>
     </div>
     <div class="modalfoot"><button class="btn soft" data-action="close-modal">Tutup</button></div>`
  );
}

async function startUnlink(id) {
  try {
    const data = await api(`/api/links/${id}/unlink`, { method: "POST", body: {} });
    const info = data.instructions;
    openModal(
      `<h2>${escapeHtml(info.title)}</h2>
       <p class="sub">Status sekarang: <b>${STATUS[data.link.status].label}</b>. Linkly belum memverifikasi apa pun.</p>
       <div class="instr">
         <p style="margin:0 0 6px">${escapeHtml(info.guide)}</p>
         ${info.url ? `<p style="margin:0"><a href="${escapeHtml(info.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(info.url)}</a></p>` : ""}
       </div>
       ${info.verification === "manual"
         ? `<p class="warning">Penyedia ini tidak menyediakan tautan resmi yang terdokumentasi. Ikuti langkah di aplikasinya, lalu konfirmasi di bawah.</p>`
         : `<p class="warning">Setelah menyelesaikan langkah resmi di atas, tandai di bawah. Tanda ini adalah konfirmasi Anda, bukan verifikasi otomatis Linkly.</p>`}
       <div class="modalfoot">
         <button class="btn soft" type="button" data-action="close-modal">Nanti saja</button>
         <button class="btn primary" type="button" data-action="link-unlink-confirm" data-id="${id}">Saya sudah menjalankannya</button>
       </div>`
    );
  } catch (error) {
    toast(error.message, "error");
  }
}

async function confirmUnlink(id) {
  confirmModal({
    title: "Tandai tautan sudah diputus?",
    message: "Linkly akan mencatat status <b>Dicabut · dikonfirmasi pengguna</b>. Linkly tidak dapat memverifikasi tindakan ini secara otomatis, jadi pastikan Anda benar-benar sudah mencabut aksesnya.",
    confirmLabel: "Ya, tandai selesai",
    onConfirm: async () => {
      await api(`/api/links/${id}/unlink/confirm`, { method: "POST", body: { confirmation: true } });
      toast("Status diperbarui atas konfirmasi Anda.");
      render();
    },
  });
}

async function startDeleteAccount(id) {
  try {
    const data = await api(`/api/links/${id}/delete-account`, { method: "POST", body: {} });
    const info = data.instructions;
    openModal(
      `<h2>${escapeHtml(info.title)}</h2>
       <p class="sub">Penghapusan dilakukan sepenuhnya oleh penyedia layanan.</p>
       <div class="instr">
         <p style="margin:0 0 6px">${escapeHtml(info.guide)}</p>
         ${info.url ? `<p style="margin:0"><a href="${escapeHtml(info.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(info.url)}</a></p>` : ""}
       </div>
       <p style="font-size:12px;font-weight:700;margin:0 0 6px">Konsekuensi yang perlu Anda ketahui</p>
       <ul class="small muted" style="margin:0;padding-left:18px">
         ${info.consequences.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
       </ul>
       <div class="modalfoot">
         <button class="btn soft" type="button" data-action="close-modal">Batal</button>
         <button class="btn primary" type="button" data-action="link-delete-confirm" data-id="${id}">Tandai penghapusan selesai</button>
       </div>`
    );
  } catch (error) {
    toast(error.message, "error");
  }
}

async function confirmDeleteAccount(id) {
  confirmModal({
    title: "Tandai akun aplikasi sudah dihapus?",
    message: "Status akan menjadi <b>Dihapus · dikonfirmasi pengguna</b>. Linkly tidak menghapus akun tersebut dan tidak dapat memverifikasinya.",
    confirmLabel: "Ya, tandai selesai",
    onConfirm: async () => {
      await api(`/api/links/${id}/delete-account/confirm`, { method: "POST", body: { confirmation: true } });
      toast("Status penghapusan dicatat.");
      render();
    },
  });
}

function removeLinkRecord(id) {
  confirmModal({
    title: "Hapus catatan keterkaitan?",
    message: "Catatan ini akan dihapus dari inventaris Linkly. Tidak ada perubahan pada aplikasi atau akun aslinya.",
    confirmLabel: "Hapus catatan",
    onConfirm: async () => {
      await api(`/api/links/${id}`, { method: "DELETE" });
      toast("Catatan keterkaitan dihapus.");
      render();
    },
  });
}

async function patchLink(id, body, message) {
  await api(`/api/links/${id}`, { method: "PATCH", body });
  closeModal();
  toast(message);
  render();
}

/* ---------------- Riwayat ---------------- */

async function viewHistory() {
  const data = await api("/api/activity?limit=100");
  const tone = (item) => (item.status === "pending" ? "warn" : item.status === "success" ? "ok" : "muted");
  $("#view").innerHTML = `
    ${header("Log kegiatan", "Riwayat aktivitas",
      "Semua tindakan yang Anda lakukan di Linkly, beserta statusnya.")}
    <div class="card">
      ${data.activity.length
        ? data.activity.map((item) => `
            <div class="item">
              <div class="ico rotate">${item.status === "pending" ? "…" : item.status === "error" ? "!" : "↻"}</div>
              <div class="meta"><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.detail || "")}</small></div>
              <div style="text-align:right;display:grid;gap:4px;justify-items:end">
                <span class="status-chip ${tone(item)}">${item.status === "pending" ? "Menunggu" : item.status === "error" ? "Gagal" : item.status === "success" ? "Selesai" : "Info"}</span>
                <span class="count">${escapeHtml(fmtDateTime(item.createdAt))}</span>
              </div>
            </div>`).join("")
        : `<div class="empty">Belum ada aktivitas.</div>`}
    </div>`;
}

/* ---------------- Aplikasi Android ---------------- */

function sizeLabel(bytes) {
  if (!bytes) return "—";
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

async function viewAndroid() {
  const data = await api("/api/android");
  const android = data.android;
  const apk = android.apk;

  const apkCard = apk.available
    ? `<div class="apk-hero">
         <div class="apk-icon">⬇</div>
         <div style="flex:1;min-width:160px">
           <b>linkly-${escapeHtml(android.version)}.apk</b>
           <p class="small muted" style="margin:2px 0 0">${escapeHtml(sizeLabel(apk.sizeBytes))} · diperbarui ${escapeHtml(fmtDate(apk.updatedAt))}</p>
         </div>
         <a class="btn primary" href="${escapeHtml(apk.downloadUrl)}" download>Unduh APK</a>
       </div>
       <div class="kv" style="margin-top:12px"><span>Paket</span><b>${escapeHtml(android.packageName)}</b></div>
       <div class="kv"><span>Versi aplikasi</span><b>${escapeHtml(android.version)}</b></div>
       <div class="kv"><span>Android minimum</span><b>Android ${android.minSdk} (8.0)</b></div>`
    : `<p class="small muted" style="margin-top:0">Belum ada berkas APK di server ini. Server mencari berkas pada lokasi berikut:</p>
       <ul class="small muted" style="margin:0;padding-left:18px">
         ${android.checkedPaths.map((item) => `<li><code>${escapeHtml(item)}</code></li>`).join("")}
       </ul>
       <p class="warning" style="margin-top:12px">Linkly tidak menyertakan APK yang belum pernah dibangun. Bangun sendiri dari folder <code>android/</code>; panduan lengkap ada di <code>docs/ANDROID.md</code>.</p>
       <pre class="code">cd android
gradle wrapper --gradle-version 8.7
./gradlew assembleDebug
cp app/build/outputs/apk/debug/app-debug.apk ../public/download/linkly.apk</pre>
       <p class="note-box" style="margin-top:10px">APK debug ditandatangani dengan kunci debug: hanya untuk pengujian, bukan untuk distribusi.</p>`;

  $("#view").innerHTML = `
    ${header("Aplikasi pendamping", "Linkly untuk Android",
      "Unduh APK, lihat versi yang terpasang di server, dan sambungkan aplikasi Android ke server ini.")}

    <div class="notice">Aplikasi Android memakai <b>API dan database yang sama</b> dengan versi web. Aplikasi ini tidak memindai aplikasi lain di perangkat Anda
      dan tidak pernah meminta kata sandi Google/email atau kode OTP.</div>

    <div class="detail-grid">
      <div class="stack">
        <div class="card">
          <h2>Berkas APK</h2>
          ${apkCard}
        </div>

        <div class="card">
          <h2>Memasang di perangkat</h2>
          <ol class="steps">
            <li><b>Unduh</b> berkas APK lewat tombol di atas — buka halaman ini dari perangkat Android Anda.</li>
            <li><b>Buka</b> berkas dari notifikasi atau folder Unduhan.</li>
            <li><b>Izinkan</b> pemasangan dari sumber ini bila Android memintanya. Hanya untuk berkas yang Anda unduh sendiri.</li>
            <li><b>Masuk</b> dengan akun Linkly yang sama seperti di versi web.</li>
          </ol>
          <p class="note-box" style="margin-top:10px">Android dapat menampilkan peringatan "aplikasi tidak dikenal". Itu normal untuk APK di luar Play Store.</p>
        </div>

        <div class="card">
          <h2>Isi aplikasi Android</h2>
          <ul class="steps">
            <li><b>Dashboard</b> — ringkasan akun, aplikasi, dan aktivitas.</li>
            <li><b>Akun &amp; aplikasi</b> — inventaris beserta detail keterkaitan.</li>
            <li><b>Riwayat</b> — log tindakan dan statusnya.</li>
            <li><b>Pengaturan</b> — tema, ekspor data, dan keluar.</li>
          </ul>
        </div>
      </div>

      <div class="stack">
        <div class="card">
          <h2>Alamat server</h2>
          <div class="kv"><span>Server ini</span><b>${escapeHtml(location.origin)}</b></div>
          <div class="kv"><span>Alamat default build</span><b>${escapeHtml(android.apiBaseUrl)}</b></div>
          <p class="note-box" style="margin-top:10px">Alamat default memakai <code>10.0.2.2</code> agar emulator Android bisa menjangkau komputer ini.
            Untuk perangkat fisik, bangun ulang dengan <code>-Plinkly.apiBaseUrl=http://ALAMAT-KOMPUTER:${escapeHtml(location.port || "5178")}/</code>.</p>
        </div>
        <div class="card">
          <h2>Batasan jujur</h2>
          <p class="small muted" style="margin-top:0">Versi Android belum diuji di perangkat pada lingkungan ini, dan APK belum pernah dikompilasi di sini.
            Aplikasi tidak memutus akses di layanan lain secara otomatis; status selalu menunggu konfirmasi Anda atau penyedia.</p>
        </div>
      </div>
    </div>`;
}

/* ---------------- Pengaturan ---------------- */

async function viewSettings(params) {
  const [settingsData, googleData] = await Promise.all([
    api("/api/settings"),
    api("/api/google/status"),
  ]);
  state.settings = settingsData.settings;
  state.google = googleData.google;

  const googleFlag = params.get("google");
  if (googleFlag) {
    const messages = {
      connected: ["Akun Google terhubung.", "ok"],
      denied: ["Izin Google dibatalkan.", "error"],
      failed: ["Koneksi Google gagal. Periksa konfigurasi server.", "error"],
      invalid_state: ["Sesi OAuth tidak valid atau kedaluwarsa.", "error"],
      missing_code: ["Google tidak mengirim kode otorisasi.", "error"],
    };
    const entry = messages[googleFlag];
    if (entry) toast(entry[0], entry[1]);
  }

  const google = state.google;
  const googleCard = !google.available
    ? `<p class="small muted">Integrasi Google belum aktif di server ini. Isi <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>,
        dan <code>ENCRYPTION_KEY</code> pada <code>.env</code>, lalu daftarkan redirect URI
        <code>${escapeHtml(location.origin)}/api/google/callback</code>. Lihat <code>docs/GOOGLE.md</code>.</p>`
    : google.connected
      ? `<div class="kv"><span>Terhubung sebagai</span><b>${escapeHtml(google.email)}</b></div>
         <div class="kv"><span>Izin</span><b>${google.scopes.map(escapeHtml).join(", ")}</b></div>
         <div class="kv"><span>Pencabutan otomatis</span><b>${google.canRevokeProgrammatically ? `Tersedia (token terenkripsi)` : `Tidak tersedia — ENCRYPTION_KEY belum diatur`}</b></div>
         <p class="note-box">Linkly hanya meminta <code>openid email profile</code>. Linkly tidak memindai aplikasi lain yang memakai Google Anda.</p>
         <div class="actions-list" style="margin-top:12px">
           <button class="btn danger" data-action="google-disconnect">Putuskan koneksi Google</button>
           <a class="link" href="${escapeHtml(google.permissionsUrl)}" target="_blank" rel="noopener noreferrer">Buka izin akun Google (aplikasi lain)</a>
         </div>`
      : `<p class="small muted">Hubungkan akun Google untuk mencatat identitas Google Anda. Linkly hanya meminta <code>openid email profile</code>.</p>
         ${google.misconfigured ? `<p class="warning">${escapeHtml(google.misconfigured)}</p>` : ""}
         <button class="btn primary" style="margin-top:10px" data-action="google-connect">Hubungkan Google</button>
         <p class="note-box" style="margin-top:10px">Tindakan ini membuka halaman persetujuan Google resmi. Anda dapat membatalkannya tanpa mengubah data.</p>`;

  $("#view").innerHTML = `
    ${header("Preferensi", "Pengaturan", "Tampilan, privasi, integrasi, dan pengelolaan data.")}

    ${state.settings.demoSeeded ? `<div class="notice"><b>Data contoh masih aktif.</b> Hapus agar workspace hanya berisi data Anda.</div>` : ""}

    <div class="detail-grid">
      <div class="stack">
        <div class="card">
          <h2>Tampilan</h2>
          <p class="small muted" style="margin-top:0">Tema disimpan pada akun Anda.</p>
          <div class="toolbar" style="margin:0 0 14px">
            <button class="btn ${currentTheme() === "light" ? "primary" : "outline"}" data-action="theme-light">Light mode</button>
            <button class="btn ${currentTheme() === "dark" ? "primary" : "outline"}" data-action="theme-dark">Dark mode</button>
          </div>
          <label class="field" style="max-width:260px">
            <span>Periode tinjauan (hari)</span>
            <input id="reviewDays" type="number" min="7" max="3650" value="${state.settings.reviewDays}">
          </label>
          <p class="hint">Keterkaitan yang lebih lama dari periode ini ditandai "perlu ditinjau".</p>
          <button class="btn soft sm" style="margin-top:8px" data-action="save-review-days">Simpan periode</button>
        </div>

        <div class="card">
          <h2>Akun Google</h2>
          ${googleCard}
        </div>

        <div class="card">
          <h2>Data Anda</h2>
          <div class="kv"><span>Akun Linkly</span><b>${escapeHtml(state.user.name)} · ${escapeHtml(state.user.email)}</b></div>
          <div class="actions-list" style="margin-top:12px">
            <a class="btn outline" href="/api/export" download="linkly-export.json">Ekspor data (JSON)</a>
            <button class="btn soft" data-action="demo-reset">Muat ulang data contoh</button>
            <button class="btn soft" data-action="demo-clear">Kosongkan semua catatan</button>
            <button class="btn danger" data-action="delete-account-record">Hapus akun Linkly &amp; seluruh data</button>
          </div>
          <p class="note-box">Menghapus akun Linkly menghapus inventaris, riwayat, dan sesi. Ini tidak memengaruhi akun Google/email/nomor HP Anda.</p>
        </div>
      </div>

      <div class="stack">
        <div class="card">
          <h2>Privasi &amp; keamanan</h2>
          <ul class="small muted" style="margin:0;padding-left:18px;display:grid;gap:7px">
            <li>Linkly tidak pernah meminta kata sandi, OTP, atau recovery code.</li>
            <li>Hanya email, label, dan catatan yang disimpan — tanpa token akses di browser.</li>
            <li>Sesi memakai cookie HttpOnly; token Android disimpan di penyimpanan terenkripsi.</li>
            <li>Tindakan berisiko memerlukan konfirmasi eksplisit.</li>
            <li>Linkly tidak mengklaim memutus tautan tanpa bukti dari penyedia.</li>
          </ul>
        </div>
        <div class="card">
          <h2>Batas kemampuan</h2>
          <p class="small muted">Linkly tidak dapat menemukan semua akun yang pernah Anda buat di semua layanan, dan tidak dapat menghapus akun Google, email utama, atau nomor HP Anda.
            Tindakan eksternal selalu mengikuti prosedur resmi penyedia.</p>
        </div>
        <div class="card">
          <h2>Sesi</h2>
          <p class="small muted">Keluar akan menghapus sesi di perangkat ini. Untuk semua perangkat, ganti password (belum tersedia di versi ini) atau hapus akun Linkly.</p>
          <button class="btn outline" data-action="logout">Keluar dari sesi ini</button>
        </div>
      </div>
    </div>`;

  const days = $("#reviewDays");
  if (days) {
    days.addEventListener("change", () => {
      const value = Number(days.value);
      if (!Number.isInteger(value) || value < 7 || value > 3650) {
        toast("Periode tinjauan harus 7–3650 hari.", "error");
      }
    });
  }
}

/* ---------------- Aksi global ---------------- */

document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  const id = target.dataset.id;

  try {
    switch (action) {
      case "nav":
        navigate(target.dataset.route);
        break;
      case "close-modal":
        closeModal();
        break;
      case "reload":
        render();
        break;
      case "add-account":
        closeModal();
        addAccountModal();
        break;
      case "add-link":
        closeModal();
        addLinkModal(target.dataset.app || "");
        break;
      case "account-detail":
        await showAccountDetail(id);
        break;
      case "account-delete":
        deleteAccountRecord(id);
        break;
      case "app-detail":
        navigate(`apps/${target.dataset.slug}`);
        break;
      case "link-detail":
        await showLinkDetail(id);
        break;
      case "link-unlink":
        await startUnlink(id);
        break;
      case "link-unlink-confirm":
        await confirmUnlink(id);
        break;
      case "link-delete-account":
        await startDeleteAccount(id);
        break;
      case "link-delete-confirm":
        await confirmDeleteAccount(id);
        break;
      case "link-remove":
        removeLinkRecord(id);
        break;
      case "link-review":
        await patchLink(id, { status: "review" }, "Ditandai perlu ditinjau.");
        break;
      case "link-mark-connected":
        await patchLink(id, { status: "connected" }, "Ditandai terhubung kembali.");
        break;
      case "theme-light":
      case "theme-dark": {
        const theme = action === "theme-dark" ? "dark" : "light";
        applyTheme(theme);
        await api("/api/settings", { method: "PATCH", body: { theme } });
        render();
        break;
      }
      case "save-review-days": {
        const value = Number($("#reviewDays").value);
        await api("/api/settings", { method: "PATCH", body: { reviewDays: value } });
        toast("Periode tinjauan disimpan.");
        render();
        break;
      }
      case "google-connect": {
        const { url } = await api("/api/google/start");
        window.location.href = url;
        break;
      }
      case "google-disconnect": {
        confirmModal({
          title: "Putuskan koneksi Google?",
          message: "Linkly akan memanggil endpoint pencabutan token Google (bila tersedia) lalu menghapus data koneksi. Akses aplikasi lain ke Google tidak terpengaruh.",
          confirmLabel: "Putuskan koneksi",
          onConfirm: async () => {
            const result = await api("/api/google/disconnect", { method: "POST", body: { confirmation: true } });
            toast(
              result.verification === "google_api"
                ? "Token dicabut dan dikonfirmasi Google."
                : "Koneksi dihapus dari Linkly (tanpa verifikasi Google)."
            );
            render();
          },
        });
        break;
      }
      case "demo-reset":
        confirmModal({
          title: "Muat ulang data contoh?",
          message: "Semua catatan akun dan keterkaitan Anda saat ini akan diganti dengan data contoh.",
          confirmLabel: "Muat ulang",
          onConfirm: async () => {
            await api("/api/demo/reset", { method: "POST", body: {} });
            toast("Data contoh dimuat.");
            render();
          },
        });
        break;
      case "demo-clear":
        confirmModal({
          title: "Kosongkan semua catatan?",
          message: "Semua akun, keterkaitan, dan riwayat di Linkly akan dihapus. Akun asli Anda tidak berubah.",
          confirmLabel: "Kosongkan",
          onConfirm: async () => {
            await api("/api/demo/clear", { method: "POST", body: {} });
            toast("Workspace dikosongkan.");
            render();
          },
        });
        break;
      case "delete-account-record":
        confirmModal({
          title: "Hapus akun Linkly?",
          message: "Seluruh data Linkly untuk akun ini dihapus permanen, termasuk akun, keterkaitan, dan riwayat. Tindakan ini tidak dapat dibatalkan.",
          confirmLabel: "Hapus permanen",
          requireTyping: "HAPUS",
          onConfirm: async () => {
            await api("/api/auth/account", { method: "DELETE", body: { confirmation: "HAPUS" } });
            state.user = null;
            showAuth();
            toast("Akun Linkly dan seluruh datanya telah dihapus.");
          },
        });
        break;
      case "logout":
        logout();
        break;
      default:
        break;
    }
  } catch (error) {
    toast(error.message, "error");
  }
});

/* ---------------- Autentikasi ---------------- */

function showAuth() {
  $("#auth").classList.remove("hidden");
  $("#shell").classList.add("hidden");
  setAuthMode("login");
  applyTheme(localStorage.getItem("linkly-theme") || "light");
}

function showShell() {
  $("#auth").classList.add("hidden");
  $("#shell").classList.remove("hidden");
  $("#avatar").textContent = (state.user.name || "U").trim().charAt(0).toUpperCase();
  $("#userName").textContent = state.user.name;
  $("#userEmail").textContent = state.user.email;
  $("#demoPill").classList.toggle("hidden", !state.settings.demoSeeded);
}

function setAuthMode(mode) {
  const login = mode === "login";
  $("#tabLogin").classList.toggle("active", login);
  $("#tabRegister").classList.toggle("active", !login);
  $("#tabLogin").setAttribute("aria-selected", String(login));
  $("#tabRegister").setAttribute("aria-selected", String(!login));
  $("#loginForm").classList.toggle("hidden", !login);
  $("#registerForm").classList.toggle("hidden", login);
}

async function login(event) {
  event.preventDefault();
  const errorBox = $("#loginError");
  errorBox.classList.add("hidden");
  try {
    await api("/api/auth/login", {
      method: "POST",
      body: { email: $("#loginEmail").value, password: $("#loginPassword").value },
    });
    await boot();
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove("hidden");
  }
}

async function register(event) {
  event.preventDefault();
  const errorBox = $("#registerError");
  errorBox.classList.add("hidden");
  try {
    await api("/api/auth/register", {
      method: "POST",
      body: {
        name: $("#registerName").value,
        email: $("#registerEmail").value,
        password: $("#registerPassword").value,
      },
    });
    await boot();
    toast("Workspace dibuat. Data contoh dimuat agar mudah dicoba.");
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove("hidden");
  }
}

async function logout() {
  try {
    await api("/api/auth/logout", { method: "POST", body: {} });
  } catch {
    /* sesi mungkin sudah berakhir */
  }
  state.user = null;
  showAuth();
  toast("Anda telah keluar.");
}

$("#tabLogin").addEventListener("click", () => setAuthMode("login"));
$("#tabRegister").addEventListener("click", () => setAuthMode("register"));
$("#loginForm").addEventListener("submit", login);
$("#registerForm").addEventListener("submit", register);
$("#authTheme").addEventListener("click", () => {
  applyTheme(currentTheme() === "dark" ? "light" : "dark");
});
$("#themeToggle").addEventListener("click", toggleTheme);
$("#logoutBtn").addEventListener("click", logout);
$("#menu").addEventListener("click", () => $("#side").classList.toggle("open"));
window.addEventListener("hashchange", () => {
  if (state.user) render();
});

/* Tombol mata pada kolom password */
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-pw-toggle]");
  if (!button) return;
  const input = document.getElementById(button.dataset.pwToggle);
  if (!input) return;
  const reveal = input.type === "password";
  input.type = reveal ? "text" : "password";
  button.setAttribute("aria-pressed", String(reveal));
  button.setAttribute("aria-label", reveal ? "Sembunyikan password" : "Tampilkan password");
  button.title = reveal ? "Sembunyikan password" : "Tampilkan password";
});

/* ---------------- Boot ---------------- */

async function boot() {
  document.documentElement.dataset.theme = localStorage.getItem("linkly-theme") || "light";
  try {
    const data = await api("/api/auth/me");
    state.user = data.user;
    state.settings = data.settings;
    state.google = data.google;
    applyTheme(data.settings.theme);
    showShell();
    if (!location.hash) location.hash = "#/dashboard";
    await render();
  } catch {
    state.user = null;
    showAuth();
  }
}

boot();
