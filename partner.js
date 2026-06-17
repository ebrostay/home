// Owner portal: sign in, see your properties / bookings / gross revenue,
// and store the bank details we transfer your rents to.
const languageButtons = document.querySelectorAll("[data-lang]");
let currentLanguage = localStorage.getItem("ebrostay-language") || "es";
let dashboard = null;
let partnerAuthMode = "signin";

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
    : `<li class="partner-empty">
        <a class="owner-flat-draft-card is-compact" href="owner-listing.html">
          <span class="owner-flat-draft-grid" aria-hidden="true">
            <span><b>+</b><small>${t("partner.slotLiving")}</small></span>
            <span><b>+</b><small>${t("partner.slotBedroom")}</small></span>
            <span><b>+</b><small>${t("partner.slotKitchen")}</small></span>
          </span>
          <strong>${t("partner.postFirstProperty")}</strong>
          <em>${t("partner.noProps")}</em>
        </a>
      </li>`;

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
  setPartnerAuthMode(partnerAuthMode);
}

function setPartnerAuthMode(mode) {
  partnerAuthMode = mode === "signup" ? "signup" : "signin";
  const tabs = document.querySelector("#partnerAuthTabs");
  const submit = document.querySelector("#partnerAuthSubmit");
  const message = document.querySelector("#partnerLoginMessage");
  tabs?.querySelectorAll("[data-partner-auth-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.partnerAuthMode === partnerAuthMode);
  });
  if (submit) {
    submit.textContent = t(partnerAuthMode === "signup" ? "partner.createAccount" : "auth.signin");
  }
  if (message) {
    message.textContent = t(partnerAuthMode === "signup" ? "partner.signupCopy" : "partner.signinCopy");
    message.className = "auth-message";
  }
}

languageButtons.forEach((button) => {
  button.addEventListener("click", () => applyLanguage(button.dataset.lang));
});

document.querySelector("#partnerAuthTabs")?.addEventListener("click", (event) => {
  const mode = event.target.closest("[data-partner-auth-mode]")?.dataset.partnerAuthMode;
  if (mode) setPartnerAuthMode(mode);
});

document.querySelector("#partnerLogin")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(event.target);
  const message = document.querySelector("#partnerLoginMessage");
  message.className = "auth-message";
  if (!window.EbrostayBackend?.isConfigured()) {
    message.textContent = t("partner.authUnavailable");
    message.classList.add("is-error");
    return;
  }
  const email = data.get("email")?.toString().trim() || "";
  const password = data.get("password")?.toString() || "";
  if (partnerAuthMode === "signup") {
    const result = await EbrostayBackend.signUp(email, password);
    if (result.error) {
      message.textContent = t("auth.signupError");
      message.classList.add("is-error");
    } else {
      message.textContent = result.needsConfirmation ? t("auth.successEmailTitle") : t("partner.signinCopy");
      message.classList.add("is-success");
      event.target.reset();
    }
    return;
  }
  const error = await EbrostayBackend.signIn(email, password);
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

// Stripe Connect: reflect status and drive onboarding
const CONNECT_LABELS = {
  active: "partner.connectActive",
  pending: "partner.connectPending",
  incomplete: "partner.connectIncomplete",
  none: "partner.connectNone"
};

async function refreshConnect() {
  const line = document.querySelector("#connectStatusLine");
  const button = document.querySelector("#connectButton");
  if (!line || !button) return;
  const result = await EbrostayBackend.ownerConnect("status");
  if (result.code === "connect_not_enabled" || result.code === "stripe_not_configured") {
    line.textContent = t("partner.connectUnavailable");
    button.hidden = true;
    return;
  }
  const status = result.status || "none";
  line.textContent = t(CONNECT_LABELS[status] || "partner.connectNone");
  button.hidden = status === "active";
  button.textContent = t(status === "none" ? "partner.connectStart" : "partner.connectContinue");
  button.dataset.ready = "yes";
}

document.querySelector("#connectButton")?.addEventListener("click", async () => {
  const button = document.querySelector("#connectButton");
  const note = document.querySelector("#connectNote");
  button.disabled = true;
  note.textContent = t("partner.connectRedirect");
  const result = await EbrostayBackend.ownerConnect("onboard");
  if (result.url) {
    window.location.href = result.url;
    return;
  }
  button.disabled = false;
  note.textContent = t(result.code === "connect_not_enabled" ? "partner.connectUnavailable" : "form.errorSend");
});

document.querySelector("#year").textContent = new Date().getFullYear();
applyLanguage(currentLanguage);
setPartnerAuthMode("signin");
showState("loading");

// returning from Stripe onboarding → re-check status
if (/connect=(done|refresh)/.test(window.location.search)) {
  history.replaceState(null, "", window.location.pathname);
}

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
      refreshConnect();
    }
  });
} else {
  showState("signedout");
}
