const params = new URLSearchParams(window.location.search);
const propertyId = params.get("id");
let property = null;

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
    ...propertySpecs(property, t, interpolate),
    interpolate("listing.capacity", { guests: property.guests }),
    ...(property.rating ? [interpolate("listing.rating", { rating: property.rating })] : []),
    interpolate("listing.from", { date: formatDate(dateValue(property.availableFrom)) })
  ].map((text) => `<span>${text}</span>`).join("");

  renderConditions();

  document.querySelector("#detailAmenities").innerHTML = property.amenities
    .map((key) => `<span>${t(`amenity.${key}`)}</span>`)
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

  const addressElement = document.querySelector("#detailAddress");
  if (addressElement) {
    addressElement.hidden = !property.address;
    addressElement.textContent = property.address ? `${property.address}, Zaragoza` : "";
  }

  const subject = encodeURIComponent(`${t("email.subject")} - ${t(property.nameKey)}`);
  const body = encodeURIComponent(`${t("email.defaultMessage")}\n\n${t(property.nameKey)}: ${t(property.copyKey)}`);
  document.querySelector("#detailEmailButton").href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  document.querySelector("#detailWhatsappButton").href = whatsappLink(
    interpolate("whatsapp.message", { property: t(property.nameKey) })
  );

  updateSeoTags();
}

// Per-property title, description, canonical, og tags, and structured data
// so rendered crawls index each listing with its real content.
function updateSeoTags() {
  const url = `https://ebrostay.com/property.html?id=${property.id}`;
  const description = `${t(property.copyKey)} ${property.address ? `${property.address}, ` : ""}Zaragoza. ${interpolate("listing.price", { price: property.price })}.`;

  document.querySelector('meta[name="description"]')?.setAttribute("content", description);
  document.querySelector('meta[property="og:title"]')?.setAttribute("content", `${t(property.nameKey)} | Ebrostay`);
  document.querySelector('meta[property="og:description"]')?.setAttribute("content", description);
  if (property.photos?.length) {
    document.querySelector('meta[property="og:image"]')?.setAttribute("content", property.photos[0]);
  }
  document.querySelector("#canonicalLink")?.setAttribute("href", url);

  const SCHEMA_TYPES = { apartment: "Apartment", room: "Room", home: "House" };
  document.querySelector("#propertyJsonLd")?.remove();
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.id = "propertyJsonLd";
  script.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": SCHEMA_TYPES[property.type] || "Accommodation",
    name: t(property.nameKey),
    description: t(property.copyKey),
    url,
    image: (property.photos || []).slice(0, 6),
    address: {
      "@type": "PostalAddress",
      ...(property.address ? { streetAddress: property.address } : {}),
      addressLocality: "Zaragoza",
      addressRegion: "Aragón",
      addressCountry: "ES"
    },
    geo: { "@type": "GeoCoordinates", latitude: property.lat, longitude: property.lng },
    ...(property.bedrooms != null ? { numberOfBedrooms: property.bedrooms } : {}),
    ...(property.bathrooms != null ? { numberOfBathroomsTotal: property.bathrooms } : {}),
    ...(property.sizeM2 != null ? { floorSize: { "@type": "QuantitativeValue", value: property.sizeM2, unitCode: "MTK" } } : {}),
    occupancy: { "@type": "QuantitativeValue", maxValue: property.guests },
    offers: {
      "@type": "Offer",
      price: property.priceNumber,
      priceCurrency: "EUR",
      availability: "https://schema.org/InStock",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: property.priceNumber,
        priceCurrency: "EUR",
        unitText: "MONTH"
      }
    },
    provider: { "@type": "RealEstateAgent", name: "Ebrostay", url: "https://ebrostay.com/", email: "info@ebrostay.com" }
  });
  document.head.appendChild(script);
}

let availabilityCalendar = null;

function isBookedDay(date) {
  return property.unavailable.some(([start, end]) => {
    return date >= dateValue(start) && date <= dateValue(end);
  });
}

function renderAvailabilityCalendar() {
  const element = document.querySelector("#detailCalendar");
  if (!element || typeof flatpickr === "undefined") return;
  availabilityCalendar?.destroy();

  const disabledRanges = property.unavailable.map(([from, to]) => ({ from, to }));
  const today = new Date().toISOString().slice(0, 10);
  const firstBookable = property.availableFrom && property.availableFrom > today ? property.availableFrom : today;

  availabilityCalendar = flatpickr(element, {
    inline: true,
    minDate: firstBookable,
    showMonths: window.matchMedia("(min-width: 720px)").matches ? 2 : 1,
    locale: currentLanguage === "es" ? flatpickr.l10ns.es : "default",
    disable: disabledRanges,
    onChange: (dates, dateString, instance) => {
      if (dates.length) instance.clear();
    },
    onDayCreate: (selectedDates, dateString, instance, dayElement) => {
      if (isBookedDay(dayElement.dateObj)) dayElement.classList.add("is-booked");
    }
  });
}

function renderConditions() {
  const section = document.querySelector("#detailConditionsSection");
  const list = document.querySelector("#detailConditions");
  if (!section || !list) return;

  const stay = (months) => (months === 1 ? t("cond.month") : interpolate("cond.months", { count: months }));
  const yesNo = (value) => t(value ? "common.yes" : "common.no");
  const rows = [];
  if (property.minStayMonths != null) rows.push([t("cond.minStay"), stay(property.minStayMonths)]);
  if (property.maxStayMonths != null) rows.push([t("cond.maxStay"), stay(property.maxStayMonths)]);
  if (property.depositAmount != null) rows.push([t("cond.deposit"), interpolate("cond.eur", { amount: property.depositAmount })]);
  if (property.upfrontRentEur != null) rows.push([t("cond.upfront"), interpolate("cond.eur", { amount: property.upfrontRentEur })]);
  if (property.utilitiesCapEur != null) rows.push([t("cond.utilities"), interpolate("cond.eurMonth", { amount: property.utilitiesCapEur })]);
  if (property.energyRating) rows.push([t("cond.energy"), property.energyRating]);
  if (property.bedsKey) rows.push([t("cond.beds"), t(property.bedsKey)]);
  if (property.petsAllowed != null) rows.push([t("cond.pets"), yesNo(property.petsAllowed)]);
  if (property.smokingAllowed != null) rows.push([t("cond.smoking"), yesNo(property.smokingAllowed)]);
  if (property.couplesAllowed != null) rows.push([t("cond.couples"), yesNo(property.couplesAllowed)]);
  if (property.selfCheckin) rows.push([t("cond.selfCheckin"), t("common.yes")]);

  section.hidden = rows.length === 0;
  list.innerHTML = rows
    .map(([label, value]) => `<li><span>${label}</span><strong>${value}</strong></li>`)
    .join("");

  renderMoveInCost();

  const videoButton = document.querySelector("#detailVideoButton");
  if (videoButton) {
    videoButton.hidden = !property.videoUrl;
    if (property.videoUrl) videoButton.href = property.videoUrl;
  }
}

function renderMoveInCost() {
  const box = document.querySelector("#detailMoveIn");
  const list = document.querySelector("#detailMoveInRows");
  if (!box || !list) return;

  const rows = [];
  if (property.upfrontRentEur != null) rows.push(["movein.upfront", property.upfrontRentEur]);
  if (property.depositAmount != null) rows.push(["movein.deposit", property.depositAmount]);
  box.hidden = rows.length === 0;
  if (!rows.length) return;

  const total = rows.reduce((sum, [, amount]) => sum + amount, 0);
  const line = (labelKey, amount, strong = false) =>
    `<li${strong ? ' class="is-total"' : ""}><span>${t(labelKey)}</span><span>${interpolate("cond.eur", { amount })}</span></li>`;
  list.innerHTML = rows.map(([key, amount]) => line(key, amount)).join("") +
    (rows.length > 1 ? line("movein.total", total, true) : "");
}

let bookingPicker = null;
let bookingEndPicker = null;

function bookingEndDate(startDate, months) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + months);
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

// Billed months for a stay: whole months from the start date, rounded up,
// minimum one. Mirrors the server-side computation in the checkout function.
function billedMonths(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth());
  if (months < 1) months = 1;
  while (bookingEndDate(startDate, months) < endDate) months += 1;
  return months;
}

function monthsText(months) {
  return months === 1 ? t("cond.month") : interpolate("cond.months", { count: months });
}

function updateBookingSummary() {
  const summary = document.querySelector("#bookingSummary");
  const startDate = document.querySelector("#bookingStart")?.value;
  const endDate = document.querySelector("#bookingEnd")?.value;
  if (!summary) return;
  if (!startDate || !endDate || endDate <= startDate) {
    summary.innerHTML = "";
    return;
  }
  const months = billedMonths(startDate, endDate);
  const rent = months * property.priceNumber;
  const deposit = property.depositAmount || 0;
  summary.innerHTML = `
    <li><span>${t("book.stay")}</span><span>${formatDate(dateValue(startDate))} &ndash; ${formatDate(dateValue(endDate))}</span></li>
    <li><span>${t("book.rent")} (${monthsText(months)})</span><span>${interpolate("cond.eur", { amount: rent })}</span></li>
    ${deposit ? `<li><span>${t("cond.deposit")}</span><span>${interpolate("cond.eur", { amount: deposit })}</span></li>` : ""}
    <li class="is-total"><span>${t("book.payNow")}</span><span>${interpolate("cond.eur", { amount: rent + deposit })}</span></li>
  `;
}

function bookingMessage(key, isError = true) {
  const element = document.querySelector("#bookingMessage");
  if (!element) return;
  element.textContent = key ? t(key) : "";
  element.className = `auth-message${key && isError ? " is-error" : ""}`;
}

function initBookingWidget() {
  const widget = document.querySelector("#bookingWidget");
  if (!widget) return;
  if (!window.EbrostayBackend?.isConfigured() || typeof flatpickr === "undefined") {
    widget.hidden = true;
    return;
  }
  widget.hidden = false;

  const today = new Date().toISOString().slice(0, 10);
  const availableFrom = property.availableFrom || today;
  const minStart = availableFrom > today ? availableFrom : today;
  const disabledRanges = property.unavailable.map(([from, to]) => ({ from, to }));
  const baseConfig = {
    dateFormat: "Y-m-d",
    altInput: true,
    altFormat: "j M Y",
    disable: disabledRanges,
    locale: currentLanguage === "es" ? flatpickr.l10ns.es : "default"
  };
  const minEndFor = (startDate) =>
    bookingEndDate(startDate, Math.max(1, property.minStayMonths || 1));

  bookingPicker?.destroy();
  bookingEndPicker?.destroy();
  bookingEndPicker = flatpickr(document.querySelector("#bookingEnd"), {
    ...baseConfig,
    minDate: minEndFor(minStart),
    onChange: updateBookingSummary
  });
  bookingPicker = flatpickr(document.querySelector("#bookingStart"), {
    ...baseConfig,
    minDate: minStart,
    onChange: (dates, dateString) => {
      if (dateString) {
        bookingEndPicker.set("minDate", minEndFor(dateString));
        if (!bookingEndPicker.input.value || bookingEndPicker.input.value < minEndFor(dateString)) {
          bookingEndPicker.setDate(minEndFor(dateString), false);
        }
      }
      updateBookingSummary();
    }
  });
  const minStayNote = document.querySelector("#bookingMinStay");
  if (minStayNote) {
    const minStay = property.minStayMonths || 0;
    minStayNote.hidden = minStay <= 1;
    if (minStay > 1) minStayNote.textContent = interpolate("book.minStay", { count: minStay });
  }

  preselectSearchDates(minStart, minEndFor);
  updateBookingSummary();

  if (new URLSearchParams(window.location.search).get("booking") === "cancelled") {
    bookingMessage("book.cancelled");
  }
}

// Carry the dates from the visitor's last search into the booking widget,
// as long as they are still bookable for this property.
function preselectSearchDates(minStart, minEndFor) {
  if (document.querySelector("#bookingStart")?.value) return;
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem("ebrostay-search-dates") || "null");
  } catch {
    return;
  }
  if (!stored?.checkIn || stored.checkIn < minStart) return;
  const start = stored.checkIn;
  const end = stored.checkOut && stored.checkOut > start ? stored.checkOut : minEndFor(start);
  const conflict = property.unavailable.some(([from, to]) => start <= to && from <= end);
  if (conflict) return;
  bookingPicker?.setDate(start, true);
  bookingEndPicker?.setDate(end, false);
}

const BOOKING_ERROR_KEYS = {
  dates_unavailable: "book.unavailable",
  stripe_not_configured: "book.notConfigured",
  unauthorized: "book.loginFirst"
};

document.querySelector("#bookingButton")?.addEventListener("click", async () => {
  const startDate = document.querySelector("#bookingStart")?.value;
  const endDate = document.querySelector("#bookingEnd")?.value;
  if (!startDate) {
    bookingPicker?.open();
    return;
  }
  if (!endDate || endDate <= startDate) {
    bookingEndPicker?.open();
    return;
  }
  if (!EbrostayBackend.getUser()) {
    localStorage.setItem("ebrostay-return-to", JSON.stringify({
      url: window.location.pathname + window.location.search + "#book",
      ts: Date.now()
    }));
    const message = document.querySelector("#bookingMessage");
    if (message) {
      message.className = "auth-message";
      message.innerHTML = `<a href="index.html#login">${t("book.loginCta")}</a>`;
    }
    return;
  }
  const button = document.querySelector("#bookingButton");
  button.disabled = true;
  window.umami?.track("booking-start", { property: property.id, checkIn: startDate, checkOut: endDate });
  bookingMessage("book.redirecting", false);
  const { url, code } = await EbrostayBackend.createBookingCheckout(property.id, startDate, endDate);
  if (url) {
    window.location.href = url;
    return;
  }
  button.disabled = false;
  bookingMessage(BOOKING_ERROR_KEYS[code] || "book.error");
});

function setBannerPhoto(url) {
  const media = document.querySelector("#detailMedia");
  if (media) {
    media.style.backgroundImage =
      `linear-gradient(135deg, rgba(24, 33, 29, 0.18), rgba(24, 33, 29, 0.02)), url('${url}')`;
  }
}

function renderGallery() {
  const gallery = document.querySelector("#detailGallery");
  const photos = property.photos || [];
  if (!gallery || photos.length === 0) return;

  setBannerPhoto(photos[0]);
  gallery.hidden = photos.length < 2;
  gallery.innerHTML = photos.map((url, index) => `
    <button class="gallery-thumb${index === 0 ? " is-active" : ""}" type="button"
      data-photo-index="${index}" style="background-image: url('${url}')"
      aria-label="Foto ${index + 1}"></button>
  `).join("");

  gallery.addEventListener("click", (event) => {
    const thumb = event.target.closest("[data-photo-index]");
    if (!thumb) return;
    setBannerPhoto(photos[Number(thumb.dataset.photoIndex)]);
    gallery.querySelectorAll(".gallery-thumb").forEach((button) => {
      button.classList.toggle("is-active", button === thumb);
    });
  });
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
  renderAvailabilityCalendar();
  initBookingWidget();
  updateDetailMarker();
}

async function boot() {
  if (window.EbrostayBackend?.isConfigured()) {
    await EbrostayBackend.init({});
  }

  property = properties.find((item) => item.id === propertyId);
  if (!property) {
    window.location.replace("index.html#search");
    return;
  }

  const year = document.querySelector("#year");
  if (year) year.textContent = new Date().getFullYear();

  document.querySelector("#detailMedia")?.classList.add("property-media", `property-${property.addressKey}`);
  renderGallery();

  languageButtons.forEach((button) => {
    button.addEventListener("click", () => applyLanguage(button.dataset.lang));
  });

  initDetailMap();
  applyLanguage(currentLanguage);

  // the umami script is deferred, so wait for it before sending the event
  window.addEventListener("load", () => {
    window.umami?.track("view-property", { property: property.id });
  });

  // "Reservar" buttons on the listing cards land here with #book
  if (window.location.hash === "#book") {
    const widget = document.querySelector("#bookingWidget");
    const target = widget && !widget.hidden ? widget : document.querySelector(".detail-request-card");
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

boot();
