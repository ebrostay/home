// Owner portal: sign in, see your properties / bookings / gross revenue,
// and store the bank details we transfer your rents to.
const languageButtons = document.querySelectorAll("[data-lang]");
let currentLanguage = localStorage.getItem("ebrostay-language") || "es";
let dashboard = null;

const t = (key) => translations[currentLanguage][key] || translations.es[key] || key;
function interpolate(key, values) {
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), t(key));
}

function escapeValue(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function formatDate(value) {
  return new Intl.DateTimeFormat(currentLanguage === "es" ? "es-ES" : "en-GB", {
    day: "2-digit", month: "short", year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

function showState(state) {
  document.querySelector("#partnerLoading").hidden = state !== "loading";
  document.querySelector("#partnerSignedOut").hidden = state !== "signedout";
  document.querySelector("#partnerNotOwner").hidden = state !== "notowner";
  document.querySelector("#partnerDashboard").hidden = state !== "dashboard";
}

function renderDashboard() {
  if (!dashboard) return;
  const { properties, bookings, payout } = dashboard;
  const revenue = bookings.filter((b) => b.status === "paid").reduce((sum, b) => sum + Number(b.amount_eur || 0), 0);

  document.querySelector("#metricProps").textContent = properties.length;
  document.querySelector("#metricBookings").textContent = bookings.length;
  document.querySelector("#metricRevenue").textContent = `${revenue.toLocaleString("es-ES")} €`;
  document.querySelector("#metricPayout").textContent = payout?.iban ? "✓" : "—";

  document.querySelector("#partnerProps").innerHTML = properties.length
    ? properties.map((p) => `
        <li>
          <div class="admin-prop-card" style="cursor: default;">
            <span class="admin-prop-cover"${p.cover ? ` style="background-image: url('${p.cover}')"` : ""}></span>
            <span class="admin-prop-body">
              <strong>${escapeValue(p.name)}</strong>
              ${p.address ? `<p>${escapeValue(p.address)}, Zaragoza</p>` : ""}
            </span>
            <span class="admin-prop-side">
              <span class="admin-chip ${p.is_published ? "is-live" : "is-off"}">${t(p.is_published ? "admin.published" : "admin.unpublished")}</span>
              <span>${p.price_number} EUR/mes</span>
            </span>
          </div>
        </li>`).join("")
    : `<li class="partner-empty">${t("partner.noProps")}</li>`;

  const th = (key) => `<th>${t(key)}</th>`;
  const head = `<tr>${["admin.th.property", "admin.th.checkin", "admin.th.checkout", "admin.th.months", "admin.th.amount", "partner.thStatus"].map(th).join("")}</tr>`;
  const rows = bookings.map((b) => `
    <tr>
      <td>${escapeValue(b.property_name)}</td>
      <td>${formatDate(b.start_date)}</td>
      <td>${formatDate(b.end_date)}</td>
      <td>${b.months ?? ""}</td>
      <td>${b.amount_eur} EUR</td>
      <td><span class="booking-paid">${t(b.status === "paid" ? "bookings.paidLabel" : "partner.pending")}</span></td>
    </tr>`).join("");
  document.querySelector("#partnerBookings").innerHTML = head + (rows || `<tr><td colspan="6">${t("partner.noBookings")}</td></tr>`);

  // prefill payout form
  const form = document.querySelector("#payoutForm");
  if (form && payout) {
    for (const field of ["account_holder", "iban", "bank_name", "tax_id", "billing_address", "payout_notes"]) {
      if (form.elements[field]) form.elements[field].value = payout[field] || "";
    }
  }
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
  renderDashboard();
}

languageButtons.forEach((button) => {
  button.addEventListener("click", () => applyLanguage(button.dataset.lang));
});

document.querySelector("#partnerLogin")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(event.target);
  const message = document.querySelector("#partnerLoginMessage");
  message.className = "auth-message";
  const error = await EbrostayBackend.signIn(data.get("email")?.toString().trim() || "", data.get("password")?.toString() || "");
  if (error) {
    message.textContent = t("auth.error");
    message.classList.add("is-error");
  } else {
    event.target.reset();
  }
});

document.querySelector("#partnerLogout")?.addEventListener("click", async () => {
  await EbrostayBackend.signOut();
  window.location.reload();
});

document.querySelector("#payoutForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(event.target);
  const note = document.querySelector("#payoutNote");
  const { ok } = await EbrostayBackend.saveOwnerPayout({
    account_holder: data.get("account_holder")?.toString().trim(),
    iban: data.get("iban")?.toString().replace(/\s+/g, "").toUpperCase(),
    bank_name: data.get("bank_name")?.toString().trim(),
    tax_id: data.get("tax_id")?.toString().trim(),
    billing_address: data.get("billing_address")?.toString().trim(),
    payout_notes: data.get("payout_notes")?.toString().trim()
  });
  note.textContent = ok ? t("partner.payoutSaved") : t("form.errorSend");
  note.classList.toggle("is-success", ok);
  note.classList.toggle("is-error", !ok);
  if (ok) {
    dashboard = await EbrostayBackend.loadOwnerDashboard();
    renderDashboard();
  }
});

document.querySelector("#year").textContent = new Date().getFullYear();
applyLanguage(currentLanguage);
showState("loading");

if (window.EbrostayBackend?.isConfigured()) {
  let lastUser = undefined;
  EbrostayBackend.init({
    onAuthChanged: async (user, isAdmin) => {
      if (user === lastUser) return;
      lastUser = user;
      if (!user) {
        showState("signedout");
        return;
      }
      document.querySelector("#partnerEmail").textContent = user.email || "";
      if (!EbrostayBackend.getIsOwner() && !isAdmin) {
        showState("notowner");
        return;
      }
      dashboard = await EbrostayBackend.loadOwnerDashboard();
      renderDashboard();
      showState("dashboard");
    }
  });
} else {
  showState("signedout");
}
