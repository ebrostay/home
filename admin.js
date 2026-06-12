const languageButtons = document.querySelectorAll("[data-lang]");
const adminStatus = document.querySelector("#adminStatus");
const adminLogin = document.querySelector("#adminLogin");
const adminLoginMessage = document.querySelector("#adminLoginMessage");
const adminToolbar = document.querySelector("#adminToolbar");
const adminUserEmail = document.querySelector("#adminUserEmail");
const adminLogout = document.querySelector("#adminLogout");
const adminProperties = document.querySelector("#adminProperties");

let currentLanguage = localStorage.getItem("ebrostay-language") || "es";
let adminRows = [];

const t = (key) => translations[currentLanguage][key] || translations.es[key] || key;

function formatDate(value) {
  return new Intl.DateTimeFormat(currentLanguage === "es" ? "es-ES" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

function showStatus(key) {
  adminStatus.hidden = false;
  adminStatus.dataset.statusKey = key;
  adminStatus.textContent = t(key);
}

function hideStatus() {
  adminStatus.hidden = true;
  delete adminStatus.dataset.statusKey;
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
  if (adminRows.length) renderAdmin();
}

async function loadAdminData() {
  const sb = EbrostayBackend.getClient();
  const { data, error } = await sb
    .from("properties")
    .select("id, name, available_from, is_published, availability_blocks(id, start_date, end_date)")
    .order("id");
  if (error) {
    showStatus("admin.error");
    return;
  }
  adminRows = data || [];
  renderAdmin();
}

function renderAdmin() {
  adminProperties.innerHTML = adminRows.map((row) => {
    const blocks = (row.availability_blocks || [])
      .slice()
      .sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
    const blockItems = blocks.length
      ? blocks.map((block) => `
          <li>
            <span>${formatDate(block.start_date)} &ndash; ${formatDate(block.end_date)}</span>
            <button class="details-button" type="button" data-delete-block="${block.id}">${t("admin.delete")}</button>
          </li>
        `).join("")
      : `<li class="admin-empty">${t("admin.noBlocks")}</li>`;

    return `
      <section class="admin-card" data-property="${row.id}">
        <h2>${row.name}</h2>
        <form class="admin-available" data-available-form="${row.id}">
          <label>
            <span>${t("admin.availableFrom")}</span>
            <input name="availableFrom" type="date" value="${row.available_from || ""}">
          </label>
          <button class="button ghost" type="submit">${t("admin.save")}</button>
        </form>
        <h3>${t("admin.blocks")}</h3>
        <ul class="admin-blocks">${blockItems}</ul>
        <form class="admin-add-block" data-block-form="${row.id}">
          <label>
            <span>${t("admin.from")}</span>
            <input name="startDate" type="date" required>
          </label>
          <label>
            <span>${t("admin.to")}</span>
            <input name="endDate" type="date" required>
          </label>
          <button class="button primary" type="submit">${t("admin.add")}</button>
        </form>
      </section>
    `;
  }).join("");
}

async function routeUI(user, isAdmin) {
  if (!EbrostayBackend.isConfigured()) {
    showStatus("admin.notConfigured");
    adminLogin.hidden = true;
    adminToolbar.hidden = true;
    adminProperties.innerHTML = "";
    return;
  }

  if (!user) {
    hideStatus();
    adminLogin.hidden = false;
    adminToolbar.hidden = true;
    adminProperties.innerHTML = "";
    adminRows = [];
    return;
  }

  adminLogin.hidden = true;
  adminToolbar.hidden = false;
  adminUserEmail.textContent = user.email || "";

  if (!isAdmin) {
    showStatus("admin.notAdmin");
    adminProperties.innerHTML = "";
    adminRows = [];
    return;
  }

  hideStatus();
  await loadAdminData();
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

if (adminProperties) {
  adminProperties.addEventListener("click", async (event) => {
    const blockId = event.target.closest("[data-delete-block]")?.dataset.deleteBlock;
    if (!blockId) return;
    const { error } = await EbrostayBackend.getClient()
      .from("availability_blocks")
      .delete()
      .eq("id", blockId);
    if (error) showStatus("admin.error");
    else await loadAdminData();
  });

  adminProperties.addEventListener("submit", async (event) => {
    event.preventDefault();
    const sb = EbrostayBackend.getClient();
    const blockPropertyId = event.target.dataset.blockForm;
    const availablePropertyId = event.target.dataset.availableForm;
    const formData = new FormData(event.target);

    if (blockPropertyId) {
      const startDate = formData.get("startDate");
      const endDate = formData.get("endDate");
      if (!startDate || !endDate || endDate < startDate) {
        showStatus("admin.error");
        return;
      }
      const { error } = await sb.from("availability_blocks").insert({
        property_id: blockPropertyId,
        start_date: startDate,
        end_date: endDate
      });
      if (error) showStatus("admin.error");
      else {
        showStatus("admin.saved");
        await loadAdminData();
      }
    }

    if (availablePropertyId) {
      const { error } = await sb
        .from("properties")
        .update({ available_from: formData.get("availableFrom") || null })
        .eq("id", availablePropertyId);
      if (error) showStatus("admin.error");
      else showStatus("admin.saved");
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
