const params = new URLSearchParams(window.location.search);
const property = properties.find((item) => item.id === params.get("id"));

if (!property) {
  window.location.replace("index.html#search");
}

const languageButtons = document.querySelectorAll("[data-lang]");
let currentLanguage = localStorage.getItem("ebrostay-language") || "es";
let detailMap = null;

const t = (key) => translations[currentLanguage][key] || translations.es[key] || key;

function interpolate(key, values) {
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), t(key));
}

function dateValue(value) {
  return value ? new Date(`${value}T00:00:00`) : null;
}

function formatDate(date) {
  return new Intl.DateTimeFormat(currentLanguage === "es" ? "es-ES" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

function badgeList() {
  return [
    property.checked && "badge.checked",
    property.depositProtected && "badge.deposit",
    property.billsIncluded && "badge.bills"
  ].filter(Boolean);
}

function renderDetail() {
  document.title = `${t(property.nameKey)} | Ebrostay`;

  document.querySelector("#detailKicker").textContent = `${t(`type.${property.type}`)} - ${t(property.areaKey)}`;
  document.querySelector("#detailName").textContent = t(property.nameKey);
  document.querySelector("#detailCopy").textContent = t(property.copyKey);
  document.querySelector("#detailDetails").textContent = t(property.detailsKey);

  document.querySelector("#detailBadges").innerHTML = badgeList()
    .map((key) => `<span>${t(key)}</span>`)
    .join("");

  document.querySelector("#detailMeta").innerHTML = [
    interpolate("listing.capacity", { guests: property.guests }),
    interpolate("listing.rating", { rating: property.rating }),
    interpolate("listing.from", { date: formatDate(dateValue(property.availableFrom)) })
  ].map((text) => `<span>${text}</span>`).join("");

  document.querySelector("#detailAmenities").innerHTML = property.amenities
    .map((key) => `<span>${t(`amenity.${key}`)}</span>`)
    .join("");

  document.querySelector("#detailBlocked").innerHTML = property.unavailable
    .map(([start, end]) => `<li>${formatDate(dateValue(start))} &ndash; ${formatDate(dateValue(end))}</li>`)
    .join("");

  document.querySelector("#detailPrice").textContent = interpolate("listing.price", { price: property.price });
  const priceNote = document.querySelector("#detailPriceNote");
  if (property.priceNoteKey) {
    priceNote.hidden = false;
    priceNote.textContent = t(property.priceNoteKey);
  }
  document.querySelector("#detailAvailable").textContent = interpolate("listing.from", {
    date: formatDate(dateValue(property.availableFrom))
  });

  const subject = encodeURIComponent(`${t("email.subject")} - ${t(property.nameKey)}`);
  const body = encodeURIComponent(`${t("email.defaultMessage")}\n\n${t(property.nameKey)}: ${t(property.copyKey)}`);
  document.querySelector("#detailEmailButton").href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  document.querySelector("#detailWhatsappButton").href = whatsappLink(
    interpolate("whatsapp.message", { property: t(property.nameKey) })
  );
}

function initDetailMap() {
  const mapElement = document.querySelector("#detailMap");
  if (!mapElement || typeof L === "undefined") return;

  detailMap = L.map(mapElement, { scrollWheelZoom: false }).setView([property.lat, property.lng], 15);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(detailMap);
  updateDetailMarker();
}

function updateDetailMarker() {
  if (!detailMap) return;
  detailMap.eachLayer((layer) => {
    if (layer instanceof L.Marker) detailMap.removeLayer(layer);
  });
  const pinLabel = property.price.replace("EUR", "€").trim();
  const icon = L.divIcon({
    className: "map-price-pin-wrap",
    html: `<span class="map-price-pin">${pinLabel}</span>`,
    iconSize: null
  });
  L.marker([property.lat, property.lng], { icon, title: t(property.nameKey) }).addTo(detailMap);
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
    button.setAttribute("aria-pressed", String(button.dataset.lang === currentLanguage));
  });

  renderDetail();
  updateDetailMarker();
}

if (property) {
  const year = document.querySelector("#year");
  if (year) year.textContent = new Date().getFullYear();

  document.querySelector("#detailMedia")?.classList.add("property-media", `property-${property.addressKey}`);

  languageButtons.forEach((button) => {
    button.addEventListener("click", () => applyLanguage(button.dataset.lang));
  });

  initDetailMap();
  applyLanguage(currentLanguage);
}
