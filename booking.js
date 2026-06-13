// Tenant booking detail: cover photo, stay facts, invoice links, and the
// private stay information (wifi, keys, emergency contact) for this property.
const bookingLoading = document.querySelector("#bookingLoading");
const bookingNotFound = document.querySelector("#bookingNotFound");
const bookingDetail = document.querySelector("#bookingDetail");
const languageButtons = document.querySelectorAll("[data-lang]");

let currentLanguage = localStorage.getItem("ebrostay-language") || "es";
let booking = null;

const t = (key) => translations[currentLanguage][key] || translations.es[key] || key;

function interpolate(key, values) {
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), t(key));
}

function formatBookingDate(value) {
  return new Intl.DateTimeFormat(currentLanguage === "es" ? "es-ES" : "en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

function monthsLabel(months) {
  return months === 1 ? t("cond.month") : interpolate("cond.months", { count: months });
}

function renderBooking() {
  if (!booking) return;

  document.querySelector("#bookingTitle").textContent = booking.property_name;
  const address = booking.properties?.address;
  const addressElement = document.querySelector("#bookingAddress");
  addressElement.hidden = !address;
  addressElement.textContent = address ? `${address}, Zaragoza` : "";

  const coverElement = document.querySelector("#bookingCover");
  if (booking.cover) coverElement.style.backgroundImage = `url('${booking.cover}')`;

  const fact = (labelKey, value) => value
    ? `<li><span>${t(labelKey)}</span><span>${value}</span></li>`
    : "";
  document.querySelector("#bookingFacts").innerHTML = [
    fact("book.start", formatBookingDate(booking.start_date)),
    fact("book.end", formatBookingDate(booking.end_date)),
    fact("book.months", booking.months ? monthsLabel(booking.months) : ""),
    fact("booking.paidAmount", `<span class="booking-paid">${interpolate("cond.eur", { amount: booking.amount_eur })}</span>`),
    fact("booking.reference", booking.id.slice(0, 8).toUpperCase())
  ].join("");

  document.querySelector("#bookingLinks").innerHTML = [
    booking.invoice_url && `<a href="${booking.invoice_url}" target="_blank" rel="noopener">${t("bookings.invoice")}</a>`,
    booking.invoice_pdf && `<a href="${booking.invoice_pdf}" target="_blank" rel="noopener">${t("bookings.pdf")}</a>`,
    booking.receipt_url && `<a href="${booking.receipt_url}" target="_blank" rel="noopener">${t("bookings.receipt")}</a>`
  ].filter(Boolean).join(" ");

  const propertyLink = document.querySelector("#bookingPropertyLink");
  propertyLink.hidden = !booking.property_id;
  if (booking.property_id) propertyLink.href = `property.html?id=${booking.property_id}`;

  const info = booking.guestInfo;
  const infoFacts = info ? [
    fact("guest.wifiName", info.wifi_name),
    fact("guest.wifiPassword", info.wifi_password && `<code>${info.wifi_password}</code>`),
    fact("guest.keyPickup", info.key_pickup),
    fact("guest.checkinTime", info.checkin_time),
    fact("guest.checkoutTime", info.checkout_time),
    fact("guest.emergencyPhone", info.emergency_phone && `<a href="tel:${info.emergency_phone.replace(/\s+/g, "")}">${info.emergency_phone}</a>`),
    fact("guest.notes", info.notes)
  ].filter(Boolean).join("") : "";
  document.querySelector("#guestInfoFacts").innerHTML = infoFacts;
  document.querySelector("#guestInfoPending").hidden = Boolean(infoFacts);
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
  renderBooking();
}

function showState(state) {
  bookingLoading.hidden = state !== "loading";
  bookingNotFound.hidden = state !== "notfound";
  bookingDetail.hidden = state !== "detail";
}

languageButtons.forEach((button) => {
  button.addEventListener("click", () => applyLanguage(button.dataset.lang));
});
document.querySelector("#year").textContent = new Date().getFullYear();
applyLanguage(currentLanguage);
showState("loading");

const bookingId = new URLSearchParams(window.location.search).get("id");

if (window.EbrostayBackend?.isConfigured() && bookingId) {
  let loaded = false;
  EbrostayBackend.init({
    onAuthChanged: async (user) => {
      if (loaded) return;
      if (!user) {
        showState("notfound");
        return;
      }
      loaded = true;
      booking = await EbrostayBackend.loadBookingDetail(bookingId);
      if (!booking) {
        showState("notfound");
        return;
      }
      renderBooking();
      showState("detail");
    }
  });
} else {
  showState("notfound");
}
