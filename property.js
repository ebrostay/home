const params = new URLSearchParams(window.location.search);
const propertyId = params.get("id");
let property = null;

const languageButtons = document.querySelectorAll("[data-lang]");
let currentLanguage = localStorage.getItem("ebrostay-language") || "es";
let detailMap = null;
let detailGalleryIndex = 0;

const t = (key) => translations[currentLanguage][key] || translations.es[key] || key;

function interpolate(key, values) {
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), t(key));
}

// Prices are always shown with two decimals, e.g. 950.00 EUR.
const formatEur = (amount) => interpolate("cond.eur", { amount: Number(amount).toFixed(2) });
const formatEurMonth = (amount) => interpolate("cond.eurMonth", { amount: Number(amount).toFixed(2) });
const monthlyPriceLabel = () => interpolate("listing.price", { price: formatEur(property.priceNumber) });

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

  document.querySelector("#detailPrice").textContent = monthlyPriceLabel();
  const priceNote = document.querySelector("#detailPriceNote");
  if (property.priceNoteKey) {
    priceNote.hidden = false;
    priceNote.textContent = t(property.priceNoteKey);
  }
  document.querySelector("#detailAvailable").textContent = interpolate("listing.from", {
    date: formatDate(dateValue(property.availableFrom))
  });

  const addressElement = document.querySelector("#detailAddress");
  const addressValue = document.querySelector("#detailAddressValue");
  if (addressElement && addressValue) {
    addressElement.hidden = !property.address;
    addressValue.textContent = property.address ? `${property.address}, Zaragoza` : "";
  }

  updateRequestLinks();

  updateSeoTags();
}

// Per-property title, description, canonical, og tags, and structured data
// so rendered crawls index each listing with its real content.
function updateSeoTags() {
  const url = `https://ebrostay.com/property.html?id=${property.id}`;
  const description = `${t(property.copyKey)} ${property.address ? `${property.address}, ` : ""}Zaragoza. ${monthlyPriceLabel()}.`;

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


function renderFloorplan() {
  const section = document.querySelector("#floorplanSection");
  const grid = document.querySelector("#floorplanImages");
  if (!section || !grid) return;
  const plans = property.floorplans || [];
  section.hidden = plans.length === 0;
  grid.innerHTML = plans.map((url) => `
    <button class="floorplan-link" type="button" aria-pressed="false" aria-label="${t("detail.floorplanZoom")}">
      <img class="floorplan-img" src="${url}" alt="${t("detail.floorplan")}" loading="lazy">
    </button>
  `).join("");
}

// Clicking a floor plan zooms it in place — expanding to the full content
// width (up to the booking card) and back — instead of opening a new tab.
document.querySelector("#floorplanImages")?.addEventListener("click", (event) => {
  const plan = event.target.closest(".floorplan-link");
  if (!plan) return;
  const zoomed = plan.classList.toggle("is-zoomed");
  plan.setAttribute("aria-pressed", String(zoomed));
});

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
  if (property.depositAmount != null) rows.push([t("cond.deposit"), formatEur(property.depositAmount)]);
  if (property.upfrontRentEur != null) rows.push([t("cond.upfront"), formatEur(property.upfrontRentEur)]);
  if (property.utilitiesCapEur != null) rows.push([t("cond.utilities"), formatEurMonth(property.utilitiesCapEur)]);
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
    `<li${strong ? ' class="is-total"' : ""}><span>${t(labelKey)}</span><span>${formatEur(amount)}</span></li>`;
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

// True if [startDate, endDate] overlaps any unavailable (booked/held) range.
function rangeHasConflict(startDate, endDate) {
  return property.unavailable.some(([from, to]) => startDate <= to && from <= endDate);
}

// The first blocked day on/after a start date — caps how far a stay can run.
function nextBlockAfter(startDate) {
  return property.unavailable
    .map(([from]) => from)
    .filter((from) => from >= startDate)
    .sort()[0] || null;
}

const MAX_STAY_MONTHS = 11;
const COMMISSION_PCT = 0.15;
const money = formatEur;

// Price a stay from the chosen dates, mirroring the server-side computation.
// Returns a status so the UI can explain why an estimate isn't shown.
function computeEstimate(startDate, endDate) {
  if (!startDate || !endDate || endDate <= startDate) return { status: "empty" };
  // The chosen range must not cross any booked/held dates.
  if (rangeHasConflict(startDate, endDate)) return { status: "conflict" };
  const months = billedMonths(startDate, endDate);
  // Stays longer than 11 months need two separate contracts.
  if (months > MAX_STAY_MONTHS) return { status: "toolong" };

  const price = property.priceNumber;
  const rent = months * price;
  const commissionRaw = COMMISSION_PCT * rent;
  const commission = Math.min(commissionRaw, price);
  const capped = commissionRaw > price + 0.001;
  const discount = capped ? commissionRaw - commission : 0;
  const deposit = property.depositAmount || 0;
  const total = rent + commission + deposit;
  return { status: "ok", months, rent, commissionRaw, commission, capped, discount, deposit, total };
}

function updateBookingSummary() {
  const summary = document.querySelector("#bookingSummary");
  const startDate = document.querySelector("#bookingStart")?.value;
  const endDate = document.querySelector("#bookingEnd")?.value;
  const split = document.querySelector("#bookingSplit");
  const vatTip = document.querySelector("#bookingVatTip");
  if (!summary) return;
  if (split) split.hidden = true;

  const est = computeEstimate(startDate, endDate);
  if (est.status !== "ok") {
    summary.innerHTML = "";
    if (vatTip) vatTip.textContent = "";
    if (split && est.status === "conflict") { split.hidden = false; split.textContent = t("book.rangeUnavailable"); }
    if (split && est.status === "toolong") { split.hidden = false; split.textContent = t("book.splitNote"); }
    updateRequestLinks();
    return;
  }

  summary.innerHTML = `
    <li class="is-range"><span>${t("book.stay")}</span><span>${formatDate(dateValue(startDate))} &ndash; ${formatDate(dateValue(endDate))}</span></li>
    <li><span>${t("book.rent")} (${monthsText(est.months)})</span><span>${money(est.rent)}</span></li>
    <li><span>${t("book.commission")}</span><span>${money(est.commissionRaw)}</span></li>
    ${est.capped ? `<li class="booking-discount"><span>${t("book.commissionDiscount")}</span><span>&minus;${money(est.discount)}</span></li>` : ""}
    ${est.deposit ? `<li><span>${t("cond.deposit")}</span><span>${money(est.deposit)}</span></li>` : ""}
    <li class="is-total"><span>${t("book.estimateTotal")}</span><span>${money(est.total)}</span></li>
  `;

  if (vatTip) {
    const exempt = Boolean(document.querySelector("#bookingTenants")?.value.trim());
    const icon = exempt ? "badge-check" : "lightbulb";
    vatTip.className = `booking-note booking-tip${exempt ? " booking-vat-ok" : ""}`;
    vatTip.innerHTML = `<i data-lucide="${icon}" aria-hidden="true"></i><span>${exempt ? t("book.vatExempt") : t("book.vatCompany")}</span>`;
    window.lucide?.createIcons();
  }
  updateRequestLinks();
}

// Build a branded, plain-text recap of the request that we drop into the
// prefilled email body / WhatsApp message. `channel` "whatsapp" gets *bold*
// markdown on the header and total so the recap reads cleanly in the app.
function buildRequestSummary(channel) {
  const bold = (text) => (channel === "whatsapp" ? `*${text}*` : text);
  const startDate = document.querySelector("#bookingStart")?.value;
  const endDate = document.querySelector("#bookingEnd")?.value;
  const tenants = document.querySelector("#bookingTenants")?.value.trim();
  const est = computeEstimate(startDate, endDate);

  const lines = [
    bold(t("request.summaryHeader")),
    "",
    `${t("request.propertyLabel")}: ${t(property.nameKey)}`,
    `${t("request.areaLabel")}: ${t(property.areaKey)}`,
    `${t("request.priceLabel")}: ${monthlyPriceLabel()}`
  ];

  if (est.status === "ok") {
    lines.push(
      "",
      `${t("book.start")}: ${formatDate(dateValue(startDate))}`,
      `${t("book.end")}: ${formatDate(dateValue(endDate))}`,
      `${t("book.months")}: ${monthsText(est.months)}`,
      "",
      `${t("request.estimateLabel")}:`,
      `- ${t("book.rent")} (${monthsText(est.months)}): ${money(est.rent)}`,
      `- ${t("book.commission")}: ${money(est.commissionRaw)}`
    );
    if (est.deposit) lines.push(`- ${t("cond.deposit")}: ${money(est.deposit)}`);
    lines.push(`- ${t("book.estimateTotal")}: ${bold(money(est.total))}`);
  }

  if (tenants) {
    const names = tenants.split("\n").map((name) => name.trim()).filter(Boolean);
    if (names.length) {
      lines.push("", `${t("request.tenantsLabel")}:`, ...names.map((name) => `- ${name}`));
    }
  }

  lines.push("", t("request.summaryFooter"));
  return lines.join("\n");
}

// Keep the two request buttons pointing at a prefilled, branded message that
// reflects whatever the visitor has selected so far.
function updateRequestLinks() {
  const emailButton = document.querySelector("#bookingEmailButton");
  const whatsappButton = document.querySelector("#bookingWhatsappButton");
  if (!property || (!emailButton && !whatsappButton)) return;

  if (emailButton) {
    const subject = `${t("request.emailSubject")} – ${t(property.nameKey)}`;
    const body = buildRequestSummary("email");
    emailButton.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }
  if (whatsappButton) {
    whatsappButton.href = whatsappLink(buildRequestSummary("whatsapp"));
  }
}

function initBookingWidget() {
  const widget = document.querySelector("#bookingWidget");
  if (!widget) return;
  // The request buttons live outside the widget and always work; the date
  // pickers are an enhancement that needs flatpickr loaded.
  if (typeof flatpickr === "undefined") {
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
  // end can't run past the 11-month cap, nor across the next booked period
  const maxEndFor = (startDate) => {
    const byStay = bookingEndDate(startDate, Math.min(MAX_STAY_MONTHS, property.maxStayMonths || MAX_STAY_MONTHS));
    const block = nextBlockAfter(startDate);
    if (!block) return byStay;
    const dayBefore = new Date(`${block}T00:00:00Z`);
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
    const beforeBlock = dayBefore.toISOString().slice(0, 10);
    return beforeBlock < byStay ? beforeBlock : byStay;
  };

  bookingPicker?.destroy();
  bookingEndPicker?.destroy();
  bookingEndPicker = flatpickr(document.querySelector("#bookingEnd"), {
    ...baseConfig,
    minDate: minEndFor(minStart),
    maxDate: maxEndFor(minStart),
    onChange: updateBookingSummary
  });
  bookingPicker = flatpickr(document.querySelector("#bookingStart"), {
    ...baseConfig,
    minDate: minStart,
    onChange: (dates, dateString) => {
      if (dateString) {
        bookingEndPicker.set("minDate", minEndFor(dateString));
        bookingEndPicker.set("maxDate", maxEndFor(dateString));
        if (!bookingEndPicker.input.value || bookingEndPicker.input.value < minEndFor(dateString)) {
          bookingEndPicker.setDate(minEndFor(dateString), false);
        }
      }
      updateBookingSummary();
    }
  });
  document.querySelector("#bookingTenants")?.addEventListener("input", updateBookingSummary);
  const minStayNote = document.querySelector("#bookingMinStay");
  if (minStayNote) {
    const minStay = property.minStayMonths || 0;
    minStayNote.hidden = minStay <= 1;
    if (minStay > 1) minStayNote.textContent = interpolate("book.minStay", { count: minStay });
  }

  preselectSearchDates(minStart, minEndFor);
  updateBookingSummary();
}

// Carry the dates from the visitor's last search into the booking widget,
// as long as they are still bookable for this property.
function preselectSearchDates(minStart, minEndFor) {
  if (document.querySelector("#bookingStart")?.value) return;
  // shared links carry the dates in the URL; they win over the last search
  let stored = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(params.get("from") || "")) {
    stored = { checkIn: params.get("from"), checkOut: params.get("to") || "" };
  } else {
    try {
      stored = JSON.parse(localStorage.getItem("ebrostay-search-dates") || "null");
    } catch {
      return;
    }
  }
  if (!stored?.checkIn || stored.checkIn < minStart) return;
  const start = stored.checkIn;
  const end = stored.checkOut && stored.checkOut > start ? stored.checkOut : minEndFor(start);
  const conflict = property.unavailable.some(([from, to]) => start <= to && from <= end);
  if (conflict) return;
  bookingPicker?.setDate(start, true);
  bookingEndPicker?.setDate(end, false);
}

// Send a booking request straight to Ebrostay by email or WhatsApp, with the
// chosen dates and estimate prefilled — track it the same way for analytics.
document.querySelector("#bookingEmailButton")?.addEventListener("click", () => {
  window.umami?.track("booking-request", { property: property?.id, channel: "email" });
});
document.querySelector("#bookingWhatsappButton")?.addEventListener("click", () => {
  window.umami?.track("booking-request", { property: property?.id, channel: "whatsapp" });
});


// Share this listing with the chosen dates and search settings
function pageToast(message) {
  const toast = document.createElement("p");
  toast.className = "admin-status is-toast";
  toast.setAttribute("role", "status");
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

document.querySelector("#shareButton")?.addEventListener("click", async () => {
  const url = new URL("property.html", window.location.href);
  url.searchParams.set("id", property.id);
  let search = null;
  try { search = JSON.parse(localStorage.getItem("ebrostay-search-dates") || "null"); } catch { /* ignore */ }
  const from = document.querySelector("#bookingStart")?.value || search?.checkIn;
  const to = document.querySelector("#bookingEnd")?.value || search?.checkOut;
  if (from) url.searchParams.set("from", from);
  if (to) url.searchParams.set("to", to);
  if (search?.guests) url.searchParams.set("guests", search.guests);
  const link = url.toString();
  window.umami?.track("share", { property: property.id });

  if (navigator.share) {
    try {
      await navigator.share({ title: `${t(property.nameKey)} | Ebrostay`, text: t("share.text"), url: link });
      return;
    } catch { return; /* user dismissed the share sheet */ }
  }
  try {
    await navigator.clipboard.writeText(link);
    pageToast(t("share.copied"));
  } catch {
    window.prompt("URL", link);
  }
});

function setBannerPhoto(url) {
  const media = document.querySelector("#detailMedia");
  if (media) {
    media.style.backgroundImage =
      `linear-gradient(135deg, rgba(24, 33, 29, 0.18), rgba(24, 33, 29, 0.02)), url('${url}')`;
  }
}

function detailPhotos() {
  if (property.photos?.length) return [...new Set(property.photos.filter(Boolean))];
  const fallbackSets = {
    pedro1: ["assets/ebrostay-zaragoza-hero.webp", "assets/ebrostay-hero.webp", "assets/ebrostay-og.jpg"],
    pedro2: ["assets/ebrostay-zaragoza-hero.webp", "assets/ebrostay-og.jpg", "assets/ebrostay-hero.webp"],
    movera0: ["assets/movera-second-hero.jpg", "assets/movera-second-bedroom-1.jpg", "assets/movera-second-bathroom.jpg"],
    movera1: ["assets/movera-first-hero.jpg", "assets/movera-first-bedroom-1.jpg", "assets/movera-first-bathroom.jpg"]
  };
  return fallbackSets[property.id] || ["assets/ebrostay-hero.webp", "assets/ebrostay-zaragoza-hero.webp", "assets/ebrostay-og.jpg"];
}

function updateGalleryActiveState() {
  const photos = detailPhotos();
  const image = document.querySelector("#detailLightboxImage");
  const caption = document.querySelector("#detailLightboxCaption");
  if (photos.length === 0) return;
  detailGalleryIndex = (detailGalleryIndex + photos.length) % photos.length;
  setBannerPhoto(photos[detailGalleryIndex]);
  if (image) {
    image.src = photos[detailGalleryIndex];
    image.alt = `${t(property.nameKey)} - ${detailGalleryIndex + 1}`;
  }
  if (caption) caption.textContent = `${detailGalleryIndex + 1} / ${photos.length}`;
  document.querySelectorAll("[data-photo-index], [data-lightbox-photo-index]").forEach((button) => {
    const index = Number(button.dataset.photoIndex ?? button.dataset.lightboxPhotoIndex);
    button.classList.toggle("is-active", index === detailGalleryIndex);
  });
}

function openGallery(index = 0) {
  const photos = detailPhotos();
  const lightbox = document.querySelector("#detailLightbox");
  if (!lightbox || photos.length === 0) return;
  detailGalleryIndex = index;
  updateGalleryActiveState();
  if (typeof lightbox.showModal === "function") lightbox.showModal();
  else lightbox.setAttribute("open", "");
}

function closeGallery() {
  const lightbox = document.querySelector("#detailLightbox");
  if (!lightbox) return;
  if (typeof lightbox.close === "function") lightbox.close();
  else lightbox.removeAttribute("open");
}

function stepGallery(delta) {
  detailGalleryIndex += delta;
  updateGalleryActiveState();
}

function renderGallery() {
  const gallery = document.querySelector("#detailGallery");
  const lightboxThumbs = document.querySelector("#detailLightboxThumbs");
  const mediaOpen = document.querySelector("#detailMediaOpen");
  const photos = detailPhotos();
  if (!gallery || photos.length === 0) return;

  setBannerPhoto(photos[0]);
  detailGalleryIndex = 0;
  gallery.hidden = photos.length < 2;
  gallery.innerHTML = photos.map((url, index) => `
    <button class="gallery-thumb${index === 0 ? " is-active" : ""}" type="button"
      data-photo-index="${index}" style="background-image: url('${url}')"
      aria-label="Foto ${index + 1}"></button>
  `).join("");
  if (lightboxThumbs) {
    lightboxThumbs.innerHTML = photos.map((url, index) => `
      <button class="gallery-thumb${index === 0 ? " is-active" : ""}" type="button"
        data-lightbox-photo-index="${index}" style="background-image: url('${url}')"
        aria-label="Foto ${index + 1}"></button>
    `).join("");
  }

  gallery.addEventListener("click", (event) => {
    const thumb = event.target.closest("[data-photo-index]");
    if (!thumb) return;
    detailGalleryIndex = Number(thumb.dataset.photoIndex);
    updateGalleryActiveState();
  });

  mediaOpen?.addEventListener("click", (event) => {
    event.stopPropagation();
    openGallery(detailGalleryIndex);
  });
  document.querySelector("#detailMedia")?.addEventListener("click", (event) => {
    if (event.target.closest("#detailMediaOpen")) return;
    if (event.target.closest(".availability-pill")) return;
    openGallery(detailGalleryIndex);
  });
  document.querySelector("#detailLightbox")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget || event.target.closest("[data-gallery-close]")) closeGallery();
    const step = event.target.closest("[data-gallery-step]");
    if (step) stepGallery(Number(step.dataset.galleryStep));
    const lightboxThumb = event.target.closest("[data-lightbox-photo-index]");
    if (lightboxThumb) {
      detailGalleryIndex = Number(lightboxThumb.dataset.lightboxPhotoIndex);
      updateGalleryActiveState();
    }
  });
  document.addEventListener("keydown", (event) => {
    const lightbox = document.querySelector("#detailLightbox");
    if (!lightbox?.open) return;
    if (event.key === "ArrowLeft") stepGallery(-1);
    if (event.key === "ArrowRight") stepGallery(1);
  });
  updateGalleryActiveState();
}

function initDetailMap() {
  const mapElement = document.querySelector("#detailMap");
  if (!mapElement || typeof L === "undefined") return;

  detailMap = L.map(mapElement, { scrollWheelZoom: false }).setView([property.lat, property.lng], 15);
  detailMap.attributionControl.setPrefix(false);
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

  document.querySelectorAll("[data-i18n-attr]").forEach((element) => {
    element.dataset.i18nAttr.split(";").forEach((pair) => {
      const [attribute, key] = pair.split(":");
      if (attribute && key) element.setAttribute(attribute, t(key));
    });
  });

  languageButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.lang === currentLanguage);
    button.setAttribute("aria-pressed", String(button.dataset.lang === currentLanguage));
  });

  renderDetail();
  renderFloorplan();
  renderAvailabilityCalendar();
  initBookingWidget();
  updateDetailMarker();
}

async function boot() {
  if (window.EbrostayBackend?.isConfigured()) {
    await EbrostayBackend.init({});
  }

  if (typeof hydrateOwnerPublishedProperties === "function") {
    hydrateOwnerPublishedProperties();
  }

  property = properties.find((item) => item.id === propertyId);
  if (!property) {
    window.location.replace("index.html#search");
    return;
  }

  const year = document.querySelector("#year");
  if (year) year.textContent = new Date().getFullYear();

  document.querySelector("#detailMedia")?.classList.add(`property-${property.addressKey}`);
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
