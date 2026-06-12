const year = document.querySelector("#year");
const inquiryForm = document.querySelector("#inquiryForm");
const heroSearch = document.querySelector("#heroSearch");
const availabilityFilter = document.querySelector("#availabilityFilter");
const propertyGrid = document.querySelector("#propertyGrid");
const availabilityStatus = document.querySelector("#availabilityStatus");
const resetAvailability = document.querySelector("#resetAvailability");
const languageButtons = document.querySelectorAll("[data-lang]");
const quickButtons = document.querySelectorAll("[data-quick]");
const sortBy = document.querySelector("#sortBy");
const googleMap = document.querySelector("#googleMap");
const mapAddressButtons = document.querySelectorAll("[data-map-address]");
const authButton = document.querySelector("#authButton");
const authDialog = document.querySelector("#authDialog");
const authForm = document.querySelector("#authForm");
const authMessage = document.querySelector("#authMessage");
const authClose = document.querySelector("#authClose");
const userChip = document.querySelector("#userChip");
const userEmail = document.querySelector("#userEmail");
const logoutButton = document.querySelector("#logoutButton");
const adminLink = document.querySelector("#adminLink");
const formNote = document.querySelector(".form-note");

const mapSources = {
  pedro: "https://www.google.com/maps?q=Pedro%20II%20El%20Catolico%203%2C%20Zaragoza%20Spain&output=embed",
  movera: "https://www.google.com/maps?q=Movera%207%2C%20Zaragoza%20Spain&output=embed"
};

const listingsMapElement = document.querySelector("#listingsMap");
let leafletMap = null;
let markerLayer = null;
let markersById = new Map();
let mapNeedsFit = true;
let highlightTimer = null;

let currentLanguage = localStorage.getItem("ebrostay-language") || "es";
let activeFilter = null;
let statusOverride = null;
let quickFilters = new Set();
let favorites = new Set(JSON.parse(localStorage.getItem("ebrostay-favorites") || "[]"));

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

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

function getAmenities(formData) {
  return formData.getAll("amenities").map((value) => value.toString());
}

function getFilterFromForm(form, requireValidRange = false) {
  const formData = new FormData(form);
  const checkIn = dateValue(formData.get("checkIn"));
  const checkOut = dateValue(formData.get("checkOut"));

  if (requireValidRange && checkIn && checkOut && checkOut <= checkIn) {
    statusOverride = t("status.invalid");
    return null;
  }

  return {
    city: formData.get("city")?.toString().trim().toLowerCase() || "",
    checkIn,
    checkOut,
    guests: Number(formData.get("guestCount")) || 1,
    propertyType: formData.get("propertyType") || "all",
    maxBudget: Number(formData.get("maxBudget")) || null,
    amenities: getAmenities(formData),
    sortBy: formData.get("sortBy") || sortBy?.value || "best"
  };
}

function passesQuickFilters(property) {
  if (quickFilters.has("checked") && !property.checked) return false;
  if (quickFilters.has("bills") && !property.billsIncluded) return false;
  if (quickFilters.has("deposit") && !property.depositProtected) return false;
  return true;
}

function isAvailable(property, filter) {
  if (!passesQuickFilters(property)) return false;
  if (!filter) return true;
  if (filter.city && !property.city.includes(filter.city)) return false;
  if (filter.propertyType !== "all" && property.type !== filter.propertyType) return false;
  if (filter.maxBudget && property.priceNumber > filter.maxBudget) return false;
  if (property.guests < filter.guests) return false;
  if (filter.amenities.some((amenity) => !property.amenities.includes(amenity))) return false;

  if (filter.checkIn && filter.checkOut) {
    return !property.unavailable.some(([start, end]) => rangesOverlap(filter.checkIn, filter.checkOut, dateValue(start), dateValue(end)));
  }

  return true;
}

function sortProperties(list, selectedSort) {
  return [...list].sort((a, b) => {
    if (selectedSort === "price") return a.priceNumber - b.priceNumber;
    if (selectedSort === "new") return Number(b.isNew) - Number(a.isNew) || a.priceNumber - b.priceNumber;
    return b.rating - a.rating || a.priceNumber - b.priceNumber;
  });
}

function badgeList(property) {
  return [
    property.checked && "badge.checked",
    property.depositProtected && "badge.deposit",
    property.billsIncluded && "badge.bills"
  ].filter(Boolean);
}

function requestProperty(propertyId) {
  const property = properties.find((item) => item.id === propertyId);
  if (!property) return;
  document.querySelector("[name='property']").value = `${t(property.nameKey)} - ${t(property.areaKey)}`;
  document.querySelector("[name='message']").value = `${t("email.defaultMessage")}\n\n${t(property.nameKey)}: ${t(property.copyKey)}`;
  document.querySelector("#contact")?.scrollIntoView({ behavior: "smooth" });
}

function initListingsMap() {
  if (!listingsMapElement) return;

  if (typeof L === "undefined") {
    listingsMapElement.hidden = true;
    if (googleMap) {
      googleMap.hidden = false;
      googleMap.src = mapSources.pedro;
    }
    return;
  }

  leafletMap = L.map(listingsMapElement, { scrollWheelZoom: false });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(leafletMap);
  markerLayer = L.layerGroup().addTo(leafletMap);
  leafletMap.setView([41.6516, -0.865], 12);
}

function highlightCard(propertyId) {
  const card = propertyGrid?.querySelector(`[data-property-id="${propertyId}"]`);
  if (!card) return;
  propertyGrid.querySelectorAll(".is-map-highlight").forEach((element) => element.classList.remove("is-map-highlight"));
  card.classList.add("is-map-highlight");
  card.scrollIntoView({ behavior: "smooth", block: "nearest" });
  clearTimeout(highlightTimer);
  highlightTimer = setTimeout(() => card.classList.remove("is-map-highlight"), 3200);
}

function setPinEmphasis(propertyId, emphasized) {
  const marker = markersById.get(propertyId);
  marker?.getElement()?.querySelector(".map-price-pin")?.classList.toggle("is-active", emphasized);
}

function updateMapMarkers(list) {
  if (!leafletMap || !markerLayer) return;

  markerLayer.clearLayers();
  markersById = new Map();

  const stackByAddress = {};

  list.forEach((property) => {
    const stackIndex = stackByAddress[property.addressKey] || 0;
    stackByAddress[property.addressKey] = stackIndex + 1;
    const pinLabel = property.price.replace("EUR", "€").trim();
    const icon = L.divIcon({
      className: "map-price-pin-wrap",
      html: `<span class="map-price-pin" style="--pin-stack: ${stackIndex}">${pinLabel}</span>`,
      iconSize: null
    });
    const marker = L.marker([property.lat, property.lng], { icon, title: t(property.nameKey) });
    marker.bindPopup(
      `<strong>${t(property.nameKey)}</strong><br>${t(property.areaKey)}<br>${interpolate("listing.price", { price: property.price })}`
    );
    marker.on("click", () => highlightCard(property.id));
    marker.addTo(markerLayer);
    markersById.set(property.id, marker);
  });

  if (list.length && mapNeedsFit) {
    leafletMap.fitBounds(L.latLngBounds(list.map((property) => [property.lat, property.lng])), {
      padding: [42, 42],
      maxZoom: 15
    });
    mapNeedsFit = false;
  }
}

function focusProperty(propertyId) {
  const property = properties.find((item) => item.id === propertyId);
  if (!property) return;

  if (leafletMap) {
    leafletMap.setView([property.lat, property.lng], 16);
    markersById.get(propertyId)?.openPopup();
  } else if (googleMap && mapSources[property.addressKey]) {
    googleMap.src = mapSources[property.addressKey];
  }

  syncAddressButtons(property.addressKey);
  document.querySelector(".map-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function syncAddressButtons(addressKey) {
  mapAddressButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mapAddress === addressKey);
  });
}

function focusMap(addressKey) {
  const location = addressLocations[addressKey];

  if (leafletMap && location) {
    leafletMap.setView([location.lat, location.lng], 16);
  } else if (googleMap && mapSources[addressKey]) {
    googleMap.src = mapSources[addressKey];
  }

  syncAddressButtons(addressKey);
}

function renderProperties() {
  if (!propertyGrid || !availabilityStatus) return;

  const selectedSort = sortBy?.value || activeFilter?.sortBy || "best";
  const filtered = sortProperties(properties.filter((property) => isAvailable(property, activeFilter)), selectedSort);
  const count = filtered.length;

  if (statusOverride) availabilityStatus.textContent = statusOverride;
  else if (!activeFilter && quickFilters.size === 0) availabilityStatus.textContent = interpolate("status.all", { count: properties.length });
  else if (count === 0) availabilityStatus.textContent = t("status.none");
  else if (count === 1) availabilityStatus.textContent = t("status.one");
  else availabilityStatus.textContent = interpolate("status.matches", { count });

  propertyGrid.innerHTML = filtered.map((property) => {
    const isFavorite = favorites.has(property.id);
    const detailUrl = `property.html?id=${property.id}`;
    const badges = badgeList(property).map((key) => `<span>${t(key)}</span>`).join("");
    const amenities = property.amenities.map((key) => `<span>${t(`amenity.${key}`)}</span>`).join("");
    const mediaStyle = property.photos?.length
      ? ` style="background-image: linear-gradient(135deg, rgba(24, 33, 29, 0.18), rgba(24, 33, 29, 0.02)), url('${property.photos[0]}')"`
      : "";

    return `
      <article class="property-card" data-property-id="${property.id}">
        <a class="property-media property-${property.addressKey}" href="${detailUrl}" aria-label="${t(property.nameKey)}"${mediaStyle}>
          <span class="availability-pill">${t("listing.available")}</span>
          <button class="favorite-button${isFavorite ? " is-active" : ""}" type="button" data-favorite="${property.id}" aria-label="${isFavorite ? t("listing.saved") : t("listing.favorite")}">${isFavorite ? t("listing.saved") : t("listing.favorite")}</button>
        </a>
        <div class="property-body">
          <div class="property-title-row">
            <div>
              <p class="section-kicker">${t(`type.${property.type}`)} - ${t(property.areaKey)}</p>
              <h3><a class="property-title-link" href="${detailUrl}">${t(property.nameKey)}</a></h3>
            </div>
            <div class="property-price">
              <strong>${interpolate("listing.price", { price: property.price })}</strong>
              ${property.priceNoteKey ? `<span class="price-note">${t(property.priceNoteKey)}</span>` : ""}
            </div>
          </div>
          <p>${t(property.copyKey)}</p>
          <div class="property-badges">${badges}</div>
          <div class="property-meta">
            ${propertySpecs(property, t, interpolate).map((spec) => `<span>${spec}</span>`).join("")}
            <span>${interpolate("listing.capacity", { guests: property.guests })}</span>
            <span>${interpolate("listing.rating", { rating: property.rating })}</span>
            <span>${interpolate("listing.from", { date: formatDate(dateValue(property.availableFrom)) })}</span>
          </div>
          <div class="amenity-list">${amenities}</div>
          <div class="property-actions">
            <a class="details-button" href="${detailUrl}">${t("listing.view")}</a>
            <button class="details-button" type="button" data-map-focus="${property.id}">${t("listing.map")}</button>
            <button class="button primary request-button" type="button" data-request="${property.id}">${t("listing.request")}</button>
          </div>
        </div>
      </article>
    `;
  }).join("");

  updateMapMarkers(filtered);
}

function applyLanguage(language) {
  currentLanguage = translations[language] ? language : "es";
  localStorage.setItem("ebrostay-language", currentLanguage);
  document.documentElement.lang = currentLanguage;
  document.title = t("meta.title");

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

  document.querySelectorAll("[data-whatsapp]").forEach((link) => {
    link.href = whatsappLink(t("whatsapp.general"));
  });

  renderProperties();
}

if (year) year.textContent = new Date().getFullYear();

languageButtons.forEach((button) => {
  button.addEventListener("click", () => applyLanguage(button.dataset.lang));
});

quickButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const value = button.dataset.quick;
    quickFilters.has(value) ? quickFilters.delete(value) : quickFilters.add(value);
    button.classList.toggle("is-active", quickFilters.has(value));
    mapNeedsFit = true;
    renderProperties();
  });
});

mapAddressButtons.forEach((button) => {
  button.addEventListener("click", () => focusMap(button.dataset.mapAddress));
});

if (heroSearch && availabilityFilter) {
  heroSearch.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(heroSearch);
    availabilityFilter.elements.city.value = data.get("city") || "Zaragoza";
    availabilityFilter.elements.checkIn.value = data.get("checkIn") || "";
    availabilityFilter.elements.guestCount.value = data.get("guestCount") || "2";
    statusOverride = null;
    activeFilter = getFilterFromForm(availabilityFilter);
    mapNeedsFit = true;
    document.querySelector("#search")?.scrollIntoView({ behavior: "smooth" });
    renderProperties();
  });
}

if (availabilityFilter) {
  availabilityFilter.addEventListener("submit", (event) => {
    event.preventDefault();
    statusOverride = null;
    activeFilter = getFilterFromForm(availabilityFilter, true);
    mapNeedsFit = true;
    renderProperties();
    // on mobile the panel is a toggle; collapse it so results are visible
    document.querySelector(".filter-panel")?.classList.remove("is-open");
    filterToggle?.classList.remove("is-active");
  });
}

const filterToggle = document.querySelector("#filterToggle");
if (filterToggle) {
  filterToggle.addEventListener("click", () => {
    const open = document.querySelector(".filter-panel")?.classList.toggle("is-open");
    filterToggle.classList.toggle("is-active", Boolean(open));
  });
}

if (sortBy) {
  sortBy.addEventListener("change", renderProperties);
}

if (resetAvailability) {
  resetAvailability.addEventListener("click", () => {
    activeFilter = null;
    statusOverride = null;
    quickFilters.clear();
    quickButtons.forEach((button) => button.classList.remove("is-active"));
    availabilityFilter?.reset();
    if (availabilityFilter) {
      availabilityFilter.elements.city.value = "Zaragoza";
      availabilityFilter.elements.guestCount.value = "2";
    }
    mapNeedsFit = true;
    renderProperties();
  });
}

if (propertyGrid) {
  propertyGrid.addEventListener("click", (event) => {
    const favoriteId = event.target.closest("[data-favorite]")?.dataset.favorite;
    const requestId = event.target.closest("[data-request]")?.dataset.request;
    const mapFocusId = event.target.closest("[data-map-focus]")?.dataset.mapFocus;

    if (favoriteId) {
      event.preventDefault();
      const turnedOn = !favorites.has(favoriteId);
      turnedOn ? favorites.add(favoriteId) : favorites.delete(favoriteId);
      localStorage.setItem("ebrostay-favorites", JSON.stringify([...favorites]));
      if (window.EbrostayBackend?.getUser()) EbrostayBackend.saveFavorite(favoriteId, turnedOn);
      renderProperties();
    }

    if (mapFocusId) focusProperty(mapFocusId);

    if (requestId) requestProperty(requestId);
  });

  propertyGrid.addEventListener("mouseover", (event) => {
    const card = event.target.closest("[data-property-id]");
    if (card) setPinEmphasis(card.dataset.propertyId, true);
  });

  propertyGrid.addEventListener("mouseout", (event) => {
    const card = event.target.closest("[data-property-id]");
    if (card && !card.contains(event.relatedTarget)) setPinEmphasis(card.dataset.propertyId, false);
  });
}

if (inquiryForm) {
  inquiryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(inquiryForm);
    const name = formData.get("name")?.toString().trim() || "Guest";
    const email = formData.get("email")?.toString().trim() || "";
    const property = formData.get("property")?.toString().trim() || t("email.propertyFallback");
    const message = formData.get("message")?.toString().trim() || t("email.defaultMessage");

    if (window.EbrostayBackend?.isConfigured()) {
      const { ok } = await EbrostayBackend.sendInquiry({
        name,
        email,
        property,
        message,
        language: currentLanguage
      });
      if (formNote) {
        formNote.textContent = ok ? t("form.sent") : t("form.errorSend");
        formNote.classList.toggle("is-success", ok);
        formNote.classList.toggle("is-error", !ok);
      }
      if (ok) inquiryForm.reset();
      return;
    }

    const subject = encodeURIComponent(`${t("email.subject")} ${name}`);
    const body = encodeURIComponent(`Name / Nombre: ${name}\nEmail: ${email}\nProperty / Propiedad: ${property}\n\n${message}`);
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  });
}

function updateAuthUI(user) {
  const configured = Boolean(window.EbrostayBackend?.isConfigured());
  if (authButton) authButton.hidden = !configured || Boolean(user);
  if (userChip) userChip.hidden = !configured || !user;
  if (user && userEmail) userEmail.textContent = user.email || "";
  if (adminLink) adminLink.hidden = !EbrostayBackend?.getIsAdmin();
}

async function syncFavorites() {
  const remote = await EbrostayBackend.loadFavorites();
  if (remote === null) return;
  const merged = new Set(remote);
  favorites.forEach((id) => {
    if (!merged.has(id)) {
      merged.add(id);
      EbrostayBackend.saveFavorite(id, true);
    }
  });
  favorites = merged;
  localStorage.setItem("ebrostay-favorites", JSON.stringify([...favorites]));
  renderProperties();
}

if (authButton && authDialog) {
  authButton.addEventListener("click", () => {
    if (authMessage) {
      authMessage.textContent = "";
      authMessage.className = "auth-message";
    }
    authDialog.showModal();
  });
}

if (authClose) {
  authClose.addEventListener("click", () => authDialog?.close());
}

if (authForm) {
  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const action = event.submitter?.dataset.authAction || "signin";
    const formData = new FormData(authForm);
    const email = formData.get("email")?.toString().trim() || "";
    const password = formData.get("password")?.toString() || "";
    authMessage.className = "auth-message";

    if (action === "signup") {
      const { needsConfirmation, error } = await EbrostayBackend.signUp(email, password);
      if (error) {
        authMessage.textContent = t("auth.signupError");
        authMessage.classList.add("is-error");
      } else if (needsConfirmation) {
        authMessage.textContent = t("auth.checkEmail");
        authMessage.classList.add("is-success");
      } else {
        authDialog?.close();
        authForm.reset();
      }
      return;
    }

    const error = await EbrostayBackend.signIn(email, password);
    if (error) {
      authMessage.textContent = t("auth.error");
      authMessage.classList.add("is-error");
    } else {
      authDialog?.close();
      authForm.reset();
    }
  });
}

if (logoutButton) {
  logoutButton.addEventListener("click", () => EbrostayBackend.signOut());
}

initListingsMap();
applyLanguage(currentLanguage);

if (window.EbrostayBackend) {
  EbrostayBackend.init({
    onPropertiesLoaded: () => {
      mapNeedsFit = true;
      renderProperties();
    },
    onAuthChanged: (user) => {
      updateAuthUI(user);
      if (user) {
        syncFavorites();
      } else {
        favorites = new Set(JSON.parse(localStorage.getItem("ebrostay-favorites") || "[]"));
        renderProperties();
      }
    }
  });
}
