// Admin dashboard: property list (each property edits on its own page),
// confirmed bookings, manually assigned stays, and user management.
const languageButtons = document.querySelectorAll("[data-lang]");
const adminStatus = document.querySelector("#adminStatus");
const adminLogin = document.querySelector("#adminLogin");
const adminLoginMessage = document.querySelector("#adminLoginMessage");
const adminToolbar = document.querySelector("#adminToolbar");
const adminUserEmail = document.querySelector("#adminUserEmail");
const adminLogout = document.querySelector("#adminLogout");
const adminPanel = document.querySelector("#adminPanel");
const adminMainTabs = document.querySelector("#adminMainTabs");
const adminPropList = document.querySelector("#adminPropList");
const adminBookingsTable = document.querySelector("#adminBookingsTable");
const adminAssignedTable = document.querySelector("#adminAssignedTable");
const adminUserList = document.querySelector("#adminUserList");

let currentLanguage = localStorage.getItem("ebrostay-language") || "es";
let propertyRows = [];
let bookingRows = [];
let assignedRows = [];
let userRows = [];

const t = (key) => translations[currentLanguage][key] || translations.es[key] || key;

function formatDate(value) {
  return new Intl.DateTimeFormat(currentLanguage === "es" ? "es-ES" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

function formatTimestamp(value) {
  return new Intl.DateTimeFormat(currentLanguage === "es" ? "es-ES" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

const PAGE_STATUS_KEYS = new Set(["admin.notConfigured", "admin.notAdmin"]);
let statusTimer;

function showStatus(key) {
  clearTimeout(statusTimer);
  adminStatus.hidden = false;
  adminStatus.dataset.statusKey = key;
  adminStatus.textContent = t(key);
  adminStatus.classList.toggle("is-toast", !PAGE_STATUS_KEYS.has(key));
  const isError = key === "admin.error";
  adminStatus.classList.toggle("is-error", isError);
  if (key === "admin.saved") statusTimer = setTimeout(hideStatus, 2600);
  if (isError) statusTimer = setTimeout(hideStatus, 5000);
}

function hideStatus() {
  adminStatus.hidden = true;
  adminStatus.classList.remove("is-toast", "is-error");
  delete adminStatus.dataset.statusKey;
}

function escapeValue(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function coverUrl(row) {
  const photos = (row.property_photos || [])
    .filter((photo) => !photo.is_floorplan)
    .sort((a, b) => a.sort_order - b.sort_order || (a.storage_path < b.storage_path ? -1 : 1));
  return photos.length ? EbrostayBackend.photoUrl(photos[0].storage_path) : "";
}

function renderPropList() {
  adminPropList.innerHTML = propertyRows.map((row) => {
    const cover = coverUrl(row);
    const copy = currentLanguage === "es" ? (row.copy_es || row.copy_en) : (row.copy_en || row.copy_es);
    const location = [row.address, currentLanguage === "es" ? row.area_es : row.area_en].filter(Boolean).join(" · ");
    return `
      <li>
        <a class="admin-prop-card" href="admin-property.html?id=${row.id}">
          <span class="admin-prop-cover"${cover ? ` style="background-image: url('${cover}')"` : ""}></span>
          <span class="admin-prop-body">
            <strong>${escapeValue(row.name)}</strong>
            ${location ? `<p>${escapeValue(location)}</p>` : ""}
            ${copy ? `<p>${escapeValue(copy.length > 130 ? `${copy.slice(0, 130)}…` : copy)}</p>` : ""}
          </span>
          <span class="admin-prop-side">
            <span class="admin-chip ${row.is_published ? "is-live" : "is-off"}">${t(row.is_published ? "admin.published" : "admin.unpublished")}</span>
            <span>${row.price_number} EUR/mes</span>
            <span class="details-button">${t("admin.editProperty")}</span>
          </span>
        </a>
      </li>
    `;
  }).join("") || `<li class="admin-empty">${t("admin.noBlocks")}</li>`;
}

function renderBookingsTable() {
  const th = (key) => `<th>${t(key)}</th>`;
  const head = `<tr>${["admin.th.confirmed", "admin.th.property", "admin.th.checkin", "admin.th.checkout", "admin.th.months", "admin.th.amount", "admin.th.name", "admin.th.email", "admin.th.invoice"].map(th).join("")}</tr>`;
  const rows = bookingRows.map((row) => `
    <tr>
      <td>${formatTimestamp(row.created_at)}</td>
      <td>${escapeValue(row.property_name)}</td>
      <td>${formatDate(row.start_date)}</td>
      <td>${formatDate(row.end_date)}</td>
      <td>${row.months ?? ""}</td>
      <td>${row.amount_eur} EUR</td>
      <td>${escapeValue(row.customer_name || "—")}</td>
      <td>${escapeValue(row.customer_email || "")}</td>
      <td>${row.invoice_url ? `<a href="${row.invoice_url}" target="_blank" rel="noopener">${t("bookings.invoice")}</a>` : ""}</td>
    </tr>
  `).join("");
  adminBookingsTable.innerHTML = head + (rows || `<tr><td colspan="9">${t("admin.noBookings")}</td></tr>`);

  const assignedHead = `<tr>${["admin.th.property", "admin.th.checkin", "admin.th.checkout", "admin.th.email"].map(th).join("")}</tr>`;
  const assignedBody = assignedRows.map((row) => `
    <tr>
      <td>${escapeValue(row.properties?.name || row.property_id)}</td>
      <td>${formatDate(row.start_date)}</td>
      <td>${formatDate(row.end_date)}</td>
      <td>${escapeValue(row.profiles?.email || "")}</td>
    </tr>
  `).join("");
  adminAssignedTable.innerHTML = assignedHead + (assignedBody || `<tr><td colspan="4">${t("admin.noBookings")}</td></tr>`);
}

function renderUsers() {
  adminUserList.innerHTML = userRows.map((row) => {
    const bookingsCount = row.bookings?.[0]?.count || 0;
    return `
      <li>
        <div>
          <strong>${escapeValue(row.email || row.id)}</strong>
          <span class="admin-user-meta">
            ${row.is_admin ? `<span class="admin-chip is-live">${t("admin.adminChip")}</span>` : ""}
            ${row.deactivated_at ? `<span class="admin-chip is-off">${t("admin.deactivatedChip")}</span>` : ""}
            ${t("admin.bookingsCount").replace("{count}", bookingsCount)}
          </span>
        </div>
        ${row.is_admin ? "" : `<button class="details-button danger" type="button" data-delete-user="${row.id}">${t("admin.deleteUser")}</button>`}
      </li>
    `;
  }).join("");
}

function slugify(name) {
  return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "vivienda";
}

async function addProperty() {
  const name = window.prompt(t("admin.addPropertyName"))?.trim();
  if (!name) return;
  const id = `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;
  const sb = EbrostayBackend.getClient();
  const { error } = await sb.from("properties").insert({
    id,
    name,
    type: "apartment",
    city: "zaragoza",
    address_key: "pedro",
    guests: 2,
    price_label: "0 EUR",
    price_number: 0,
    lat: 41.6516,
    lng: -0.8809,
    is_published: false,
    amenities: []
  });
  if (error) {
    showStatus("admin.error");
    return;
  }
  window.location.href = `admin-property.html?id=${id}`;
}

function renderAll() {
  renderPropList();
  renderBookingsTable();
  renderUsers();
}

async function loadAdminData() {
  const sb = EbrostayBackend.getClient();
  const [propsResult, bookingsResult, assignedResult, usersResult] = await Promise.all([
    sb.from("properties").select("id, name, address, area_es, area_en, copy_es, copy_en, price_number, is_published, property_photos(storage_path, sort_order, is_floorplan)").order("id"),
    sb.from("bookings").select("*").order("created_at", { ascending: false }),
    sb.from("availability_blocks").select("property_id, start_date, end_date, properties(name), profiles(email)").not("user_id", "is", null).order("start_date"),
    sb.from("profiles").select("id, email, is_admin, deactivated_at, created_at, bookings(count)").order("created_at")
  ]);
  if (propsResult.error) {
    showStatus("admin.error");
    return;
  }
  propertyRows = propsResult.data || [];
  bookingRows = bookingsResult.data || [];
  assignedRows = assignedResult.data || [];
  userRows = usersResult.data || [];
  renderAll();
}

function applyLanguage(language) {
  currentLanguage = translations[language] ? language : "es";
  localStorage.setItem("ebrostay-language", currentLanguage);
  document.documentElement.lang = currentLanguage;
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  languageButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.lang === currentLanguage);
  });
  if (adminStatus.dataset.statusKey) adminStatus.textContent = t(adminStatus.dataset.statusKey);
  if (propertyRows.length || bookingRows.length || userRows.length) renderAll();
}

async function routeUI(user, isAdmin) {
  if (!EbrostayBackend.isConfigured()) {
    showStatus("admin.notConfigured");
    adminLogin.hidden = true;
    adminToolbar.hidden = true;
    adminPanel.hidden = true;
    return;
  }

  if (!user) {
    hideStatus();
    adminLogin.hidden = false;
    adminToolbar.hidden = true;
    adminPanel.hidden = true;
    return;
  }

  adminLogin.hidden = true;
  adminToolbar.hidden = false;
  adminUserEmail.textContent = user.email || "";

  if (!isAdmin) {
    showStatus("admin.notAdmin");
    adminPanel.hidden = true;
    return;
  }

  hideStatus();
  adminPanel.hidden = false;
  await loadAdminData();
}

if (adminMainTabs) {
  adminMainTabs.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-main-tab]")?.dataset.mainTab;
    if (!tab) return;
    adminMainTabs.querySelectorAll("[data-main-tab]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.mainTab === tab);
    });
    document.querySelectorAll("[data-main-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.mainPanel !== tab;
    });
  });
}

if (adminLogin) {
  adminLogin.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(adminLogin);
    adminLoginMessage.className = "auth-message";
    const error = await EbrostayBackend.signIn(
      formData.get("email")?.toString().trim() || "",
      formData.get("password")?.toString() || ""
    );
    if (error) {
      adminLoginMessage.textContent = t("auth.error");
      adminLoginMessage.classList.add("is-error");
    } else {
      adminLogin.reset();
    }
  });
}

if (adminLogout) {
  adminLogout.addEventListener("click", () => EbrostayBackend.signOut());
}

document.querySelector("#adminAddProperty")?.addEventListener("click", addProperty);

if (adminUserList) {
  adminUserList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-user]");
    if (!button) return;
    if (button.dataset.armed !== "yes") {
      button.dataset.armed = "yes";
      button.textContent = t("admin.deleteUserConfirm");
      return;
    }
    const sb = EbrostayBackend.getClient();
    const { error } = await sb.rpc("admin_delete_user", { target_user: button.dataset.deleteUser });
    if (error) showStatus("admin.error");
    else {
      showStatus("admin.saved");
      await loadAdminData();
    }
  });
}

languageButtons.forEach((button) => {
  button.addEventListener("click", () => applyLanguage(button.dataset.lang));
});

const year = document.querySelector("#year");
if (year) year.textContent = new Date().getFullYear();

applyLanguage(currentLanguage);

if (window.EbrostayBackend) {
  EbrostayBackend.init({
    onAuthChanged: (user, isAdmin) => routeUI(user, isAdmin)
  });
  if (!EbrostayBackend.isConfigured()) routeUI(null, false);
}
