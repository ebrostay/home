// Mi cuenta page: bookings with payment status and invoice links,
// session sign-out and account deactivation.
const accountLoading = document.querySelector("#accountLoading");
const signedOutPanel = document.querySelector("#signedOutPanel");
const accountPanel = document.querySelector("#accountPanel");
const accountEmail = document.querySelector("#accountEmail");
const bookingsList = document.querySelector("#bookingsList");
const logoutButton = document.querySelector("#logoutButton");
const deleteAccountButton = document.querySelector("#deleteAccountButton");
const languageButtons = document.querySelectorAll("[data-lang]");

let currentLanguage = localStorage.getItem("ebrostay-language") || "es";
let lastBookings = null;

const t = (key) => translations[currentLanguage][key] || translations.es[key] || key;

function interpolate(key, values) {
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), t(key));
}

function formatBookingDate(value) {
  return new Intl.DateTimeFormat(currentLanguage === "es" ? "es-ES" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

function monthsLabel(months) {
  if (!months) return "";
  return months === 1 ? t("cond.month") : interpolate("cond.months", { count: months });
}

function renderBookings() {
  if (!lastBookings) return;

  const cover = (url) => `<span class="booking-card-cover"${url ? ` style="background-image: url('${url}')"` : ""}></span>`;
  const addressLine = (address) => address ? `<span>${address}, Zaragoza</span>` : "";

  const paidItems = lastBookings.paid.map((booking) => `
    <li class="booking-card">
      <a class="booking-card-link" href="booking.html?id=${booking.id}">
        ${cover(booking.cover)}
        <span class="booking-card-body">
          <span class="booking-row-head">
            <strong>${booking.property_name}</strong>
            <span class="booking-paid">${t("bookings.paidLabel")}</span>
          </span>
          ${addressLine(booking.address)}
          <span>${formatBookingDate(booking.start_date)} &ndash; ${formatBookingDate(booking.end_date)}${booking.months ? ` &middot; ${monthsLabel(booking.months)}` : ""}</span>
          <span>${interpolate("cond.eur", { amount: booking.amount_eur })}</span>
          <span class="booking-card-cta">${t("bookings.viewDetails")} &rarr;</span>
        </span>
      </a>
    </li>
  `);
  const assignedItems = lastBookings.assigned.map((booking) => `
    <li class="booking-card">
      <span class="booking-card-link">
        ${cover(booking.cover)}
        <span class="booking-card-body">
          <span class="booking-row-head">
            <strong>${booking.propertyName}</strong>
            <span class="booking-paid">${t("bookings.assignedLabel")}</span>
          </span>
          ${addressLine(booking.address)}
          <span>${formatBookingDate(booking.startDate)} &ndash; ${formatBookingDate(booking.endDate)}</span>
        </span>
      </span>
    </li>
  `);
  const items = [...paidItems, ...assignedItems];
  bookingsList.innerHTML = items.length
    ? items.join("")
    : `<li class="bookings-empty">${t("bookings.empty")}</li>`;
}

function applyLanguage(language) {
  currentLanguage = translations[language] ? language : "es";
  localStorage.setItem("ebrostay-language", currentLanguage);
  document.documentElement.lang = currentLanguage;
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-attr]").forEach((element) => {
    element.dataset.i18nAttr.split(";").forEach((pair) => {
      const [attribute, key] = pair.split(":");
      if (attribute && key) element.setAttribute(attribute, t(key));
    });
  });
  languageButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.lang === currentLanguage);
  });
  if (deleteAccountButton?.dataset.armed !== "yes") {
    deleteAccountButton.textContent = t("account.deactivate");
  }
  renderBookings();
}

function showPanel(user) {
  accountLoading.hidden = true;
  signedOutPanel.hidden = Boolean(user);
  accountPanel.hidden = !user;
}

async function loadAccount(user) {
  showPanel(user);
  if (!user) return;
  accountEmail.textContent = user.email || "";
  bookingsList.innerHTML = `<li class="bookings-empty">${t("account.loading")}</li>`;

  const bookings = await EbrostayBackend.loadMyBookings();
  if (bookings === null) {
    bookingsList.innerHTML = `<li class="bookings-empty">${t("bookings.error")}</li>`;
    return;
  }
  lastBookings = bookings;
  renderBookings();
}

languageButtons.forEach((button) => {
  button.addEventListener("click", () => applyLanguage(button.dataset.lang));
});

logoutButton?.addEventListener("click", async () => {
  await EbrostayBackend.signOut();
  window.location.href = "index.html";
});

deleteAccountButton?.addEventListener("click", async () => {
  if (deleteAccountButton.dataset.armed !== "yes") {
    deleteAccountButton.dataset.armed = "yes";
    deleteAccountButton.textContent = t("account.deactivateConfirm");
    return;
  }
  const error = await EbrostayBackend.deactivateAccount();
  if (error) {
    deleteAccountButton.dataset.armed = "";
    deleteAccountButton.textContent = t("account.deactivateError");
    return;
  }
  window.location.href = "index.html";
});

document.querySelector("#year").textContent = new Date().getFullYear();
applyLanguage(currentLanguage);

// Stripe success_url lands here after a paid checkout
if (new URLSearchParams(window.location.search).get("booking") === "success") {
  window.addEventListener("load", () => {
    window.umami?.track("booking-paid");
  });
  const toast = document.createElement("p");
  toast.className = "admin-status is-toast";
  toast.setAttribute("role", "status");
  toast.textContent = t("book.confirmed");
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 7000);
  history.replaceState(null, "", window.location.pathname);
}

if (window.EbrostayBackend?.isConfigured()) {
  let firstAuth = true;
  EbrostayBackend.init({
    onAuthChanged: (user) => {
      // ignore repeated auth events unless the user actually changed
      if (!firstAuth && Boolean(user) === !accountPanel.hidden) return;
      firstAuth = false;
      loadAccount(user);
    }
  });
} else {
  showPanel(null);
}
