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
const postcodeFiltersElement = document.querySelector("#postcodeFilters");
const neighborhoodFiltersElement = document.querySelector("#neighborhoodFilters");
const locationFilterClear = document.querySelector("[data-location-clear]");
const authButton = document.querySelector("#authButton");
const authDialog = document.querySelector("#authDialog");
const authForm = document.querySelector("#authForm");
const authMessage = document.querySelector("#authMessage");
const authClose = document.querySelector("#authClose");
const userChip = document.querySelector("#userChip");
const userEmail = document.querySelector("#userEmail");
const logoutButton = document.querySelector("#logoutButton");
const adminLink = document.querySelector("#adminLink");
const authProviders = document.querySelector("#authProviders");
const authTabs = document.querySelector("#authTabs");
const authTitle = document.querySelector("#authTitle");
const authCopy = document.querySelector("#authCopy");
const authEmailField = document.querySelector("#authEmailField");
const authPasswordField = document.querySelector("#authPasswordField");
const authSubmit = document.querySelector("#authSubmit");
const authForgot = document.querySelector("#authForgot");
const authSuccess = document.querySelector("#authSuccess");
const authSuccessTitle = document.querySelector("#authSuccessTitle");
const authSuccessCopy = document.querySelector("#authSuccessCopy");
const authSuccessClose = document.querySelector("#authSuccessClose");
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
let propertyPhotoIndexes = {};
let selectedAreaLayer = null;
let mapBoundsFilter = null;
let drawnMapPolygon = null;
let drawnMapShape = null;
let draftDrawShape = null;
let draftDrawPoints = [];
let isDrawingMapArea = false;
let suppressMapMove = false;
let suppressMapMoveUntil = 0;
let mapViewportFilteringEnabled = false;

let currentLanguage = localStorage.getItem("ebrostay-language") || "es";
const datePickers = {};

function flatpickrLocale() {
  return currentLanguage === "es" && typeof flatpickr !== "undefined" ? flatpickr.l10ns.es : "default";
}

function defaultStayRange() {
  const checkIn = new Date();
  checkIn.setHours(0, 0, 0, 0);
  const checkOut = new Date(checkIn);
  checkOut.setMonth(checkOut.getMonth() + 1);
  return { checkIn, checkOut };
}

function setupDatePickers() {
  if (typeof flatpickr === "undefined") return;
  const { checkIn: defaultCheckIn, checkOut: defaultCheckOut } = defaultStayRange();
  const base = {
    dateFormat: "Y-m-d",
    altInput: true,
    altFormat: "j M Y",
    minDate: "today",
    locale: flatpickrLocale(),
    disableMobile: true
  };
  const heroCheckIn = heroSearch?.querySelector('[name="checkIn"]');
  const heroCheckOut = heroSearch?.querySelector('[name="checkOut"]');
  if (heroCheckOut) datePickers.heroOut = flatpickr(heroCheckOut, { ...base, minDate: defaultCheckIn, defaultDate: defaultCheckOut });
  if (heroCheckIn) {
    datePickers.hero = flatpickr(heroCheckIn, {
      ...base,
      defaultDate: defaultCheckIn,
      onChange: (dates) => {
        if (dates[0]) datePickers.heroOut?.set("minDate", dates[0]);
      }
    });
  }
  const checkInElement = document.querySelector("#checkIn");
  const checkOutElement = document.querySelector("#checkOut");
  if (checkInElement && checkOutElement) {
    datePickers.checkOut = flatpickr(checkOutElement, { ...base, minDate: defaultCheckIn, defaultDate: defaultCheckOut });
    datePickers.checkIn = flatpickr(checkInElement, {
      ...base,
      defaultDate: defaultCheckIn,
      onChange: (dates) => {
        if (dates[0]) datePickers.checkOut.set("minDate", dates[0]);
      }
    });
  }
}
let activeFilter = null;
let statusOverride = null;
let quickFilters = new Set();
let favorites = new Set(JSON.parse(localStorage.getItem("ebrostay-favorites") || "[]"));
let activePostcodes = new Set();
let activeNeighborhoods = new Set();

const zaragozaPostcodes = [
  "50001", "50002", "50003", "50004", "50005", "50006", "50007", "50008", "50009", "50010",
  "50011", "50012", "50013", "50014", "50015", "50016", "50017", "50018", "50019", "50021",
  "50022", "50059", "50190", "50191", "50192", "50194"
];

const zaragozaNeighborhoods = [
  "Actur-Rey Fernando", "Arrabal", "Casablanca", "Casco Historico", "Centro", "Delicias",
  "El Rabal", "La Almozara", "Las Fuentes", "Miralbueno", "Movera", "Oliver-Valdefierro",
  "Parque Goya", "Romareda", "San Jose", "Santa Isabel", "Torrero-La Paz", "Universidad"
];

const AREA_SELECTION_LIMIT = 3;

const zaragozaPostcodeAreas = {
  "50001": [41.652, -0.876, 0.010, 0.012],
  "50002": [41.650, -0.862, 0.012, 0.014],
  "50003": [41.656, -0.884, 0.010, 0.012],
  "50004": [41.650, -0.889, 0.011, 0.013],
  "50005": [41.646, -0.894, 0.011, 0.013],
  "50006": [41.639, -0.896, 0.012, 0.014],
  "50007": [41.629, -0.877, 0.014, 0.016],
  "50008": [41.642, -0.870, 0.012, 0.014],
  "50009": [41.648, -0.904, 0.014, 0.018],
  "50010": [41.650, -0.916, 0.012, 0.014],
  "50011": [41.637, -0.925, 0.014, 0.016],
  "50012": [41.640, -0.934, 0.014, 0.016],
  "50013": [41.644, -0.848, 0.014, 0.016],
  "50014": [41.666, -0.862, 0.014, 0.016],
  "50015": [41.673, -0.881, 0.016, 0.018],
  "50016": [41.682, -0.844, 0.018, 0.020],
  "50017": [41.651, -0.913, 0.014, 0.016],
  "50018": [41.678, -0.895, 0.016, 0.020],
  "50019": [41.627, -0.908, 0.016, 0.018],
  "50021": [41.663, -0.909, 0.014, 0.016],
  "50022": [41.632, -0.861, 0.014, 0.016],
  "50059": [41.654, -0.881, 0.020, 0.024],
  "50190": [41.700, -0.905, 0.020, 0.024],
  "50191": [41.705, -0.842, 0.020, 0.024],
  "50192": [41.616, -0.825, 0.020, 0.024],
  "50194": [41.650, -0.822, 0.018, 0.024]
};

const zaragozaNeighborhoodAreas = {
  "Actur-Rey Fernando": [41.675, -0.895, 0.015, 0.020],
  "Arrabal": [41.664, -0.875, 0.012, 0.016],
  "Casablanca": [41.625, -0.898, 0.015, 0.018],
  "Casco Historico": [41.655, -0.879, 0.010, 0.012],
  "Centro": [41.650, -0.884, 0.011, 0.014],
  "Delicias": [41.649, -0.911, 0.014, 0.017],
  "El Rabal": [41.665, -0.864, 0.014, 0.017],
  "La Almozara": [41.661, -0.896, 0.012, 0.015],
  "Las Fuentes": [41.645, -0.862, 0.012, 0.015],
  "Miralbueno": [41.653, -0.939, 0.016, 0.019],
  "Movera": [41.650, -0.822, 0.016, 0.022],
  "Oliver-Valdefierro": [41.641, -0.925, 0.016, 0.018],
  "Parque Goya": [41.698, -0.898, 0.014, 0.018],
  "Romareda": [41.638, -0.903, 0.012, 0.015],
  "San Jose": [41.637, -0.864, 0.014, 0.017],
  "Santa Isabel": [41.675, -0.833, 0.014, 0.018],
  "Torrero-La Paz": [41.625, -0.872, 0.016, 0.019],
  "Universidad": [41.650, -0.904, 0.014, 0.018]
};

if (typeof hydrateOwnerPublishedProperties === "function") {
  hydrateOwnerPublishedProperties();
}

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
    addressQuery: formData.get("addressQuery")?.toString().trim().toLowerCase() || "",
    minBedrooms: Number(formData.get("minBedrooms")) || 0,
    minBathrooms: Number(formData.get("minBathrooms")) || 0,
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

function hasLocationFilters() {
  return activePostcodes.size > 0 || activeNeighborhoods.size > 0;
}

function passesLocationFilters(property) {
  const postcode = (property.postcode || "").toString();
  const neighborhood = (property.neighborhood || "").toString();
  if (activePostcodes.size && !activePostcodes.has(postcode)) return false;
  if (activeNeighborhoods.size && !activeNeighborhoods.has(neighborhood)) return false;
  return true;
}

function propertySearchText(property) {
  return [
    property.address,
    property.addressKey,
    property.city,
    property.postcode,
    property.neighborhood,
    t(property.areaKey),
    t(property.nameKey),
    t(property.copyKey),
    t(property.detailsKey)
  ].filter(Boolean).join(" ").toLowerCase();
}

function currentCityAllowsZaragozaAreas() {
  const city = availabilityFilter?.elements.city?.value?.toString().trim().toLowerCase() || "zaragoza";
  return !city || "zaragoza".includes(city) || city.includes("zaragoza");
}

function clearAreaSelectionsForCity() {
  if (currentCityAllowsZaragozaAreas()) return false;
  if (!activePostcodes.size && !activeNeighborhoods.size) return false;
  activePostcodes.clear();
  activeNeighborhoods.clear();
  clearMapArea({ skipRender: true });
  clearSelectedAreaLayer();
  return true;
}

function clearSelectedAreaLayer() {
  selectedAreaLayer?.clearLayers();
  document.querySelectorAll(".map-area-label").forEach((element) => element.remove());
}

function syncStickySearchOffsets() {
  const headerHeight = Math.round(document.querySelector(".site-header")?.getBoundingClientRect().height || 56);
  const filterHeight = Math.round(document.querySelector(".filter-panel")?.getBoundingClientRect().height || 0);
  const filterTop = Math.max(56, headerHeight);
  const mapTop = filterTop + filterHeight + 14;
  document.documentElement.style.setProperty("--filter-sticky-top", `${filterTop}px`);
  document.documentElement.style.setProperty("--map-sticky-top", `${mapTop}px`);
  window.setTimeout(() => leafletMap?.invalidateSize(), 0);
}

function keepSearchHeadingClear() {
  const header = document.querySelector(".site-header");
  const heading = document.querySelector("#search .marketplace-toolbar h2");
  if (!header || !heading) return;
  const headingTop = heading.getBoundingClientRect().top;
  const headerBottom = header.getBoundingClientRect().bottom;
  if (headingTop >= 0 && headingTop < headerBottom + 16) {
    const targetTop = window.scrollY + headingTop - header.getBoundingClientRect().height - 18;
    window.scrollTo({ top: Math.max(0, targetTop), behavior: "auto" });
  }
}

function refreshListingsMapLayout(options = {}) {
  syncStickySearchOffsets();
  window.setTimeout(() => {
    leafletMap?.invalidateSize();
    if (options.refit) {
      mapNeedsFit = true;
      renderProperties();
    }
  }, 80);
}

window.EbrostayRefreshListingsMap = refreshListingsMapLayout;
window.addEventListener("ebrostay:refresh-listings-map", (event) => {
  refreshListingsMapLayout(event.detail || {});
});

function orderedFilterValues(seedValues, propertyField) {
  if (!currentCityAllowsZaragozaAreas()) return [];
  const values = new Set(seedValues);
  properties.forEach((property) => {
    const value = (property[propertyField] || "").toString().trim();
    if (value) values.add(value);
  });
  return [...values].sort((a, b) => a.localeCompare(b, currentLanguage === "es" ? "es" : "en", { numeric: true }));
}

function renderFilterButtons(container, values, activeSet, kind) {
  if (!container) return;
  const totalSelected = activePostcodes.size + activeNeighborhoods.size;
  container.innerHTML = values.map((value) => `
    <button class="${activeSet.has(value) ? "is-active" : ""}" type="button" data-location-kind="${kind}" data-location-value="${value}" aria-pressed="${activeSet.has(value)}" ${!activeSet.has(value) && totalSelected >= AREA_SELECTION_LIMIT ? "disabled" : ""}>${value}</button>
  `).join("");
}

function renderMapLocationFilters() {
  clearAreaSelectionsForCity();
  renderFilterButtons(postcodeFiltersElement, orderedFilterValues(zaragozaPostcodes, "postcode"), activePostcodes, "postcode");
  renderFilterButtons(neighborhoodFiltersElement, orderedFilterValues(zaragozaNeighborhoods, "neighborhood"), activeNeighborhoods, "neighborhood");
  const postcodeCount = document.querySelector("[data-postcode-count]");
  const neighborhoodCount = document.querySelector("[data-neighborhood-count]");
  if (postcodeCount) postcodeCount.textContent = activePostcodes.size ? `(${activePostcodes.size})` : "";
  if (neighborhoodCount) neighborhoodCount.textContent = activeNeighborhoods.size ? `(${activeNeighborhoods.size})` : "";
  syncStickySearchOffsets();
}

function isAvailable(property, filter) {
  if (!passesQuickFilters(property)) return false;
  if (!filter) return true;
  if (filter.city && !property.city.includes(filter.city)) return false;
  if (filter.propertyType !== "all" && property.type !== filter.propertyType) return false;
  if (filter.maxBudget && property.priceNumber > filter.maxBudget) return false;
  if (filter.addressQuery && !propertySearchText(property).includes(filter.addressQuery)) return false;
  if (filter.minBedrooms && Number(property.bedrooms || 0) < filter.minBedrooms) return false;
  if (filter.minBathrooms && Number(property.bathrooms || 0) < filter.minBathrooms) return false;
  if (property.guests < filter.guests) return false;
  if (filter.amenities.some((amenity) => !property.amenities.includes(amenity))) return false;

  if (filter.checkIn && filter.checkOut) {
    return !property.unavailable.some(([start, end]) => rangesOverlap(filter.checkIn, filter.checkOut, dateValue(start), dateValue(end)));
  }

  return true;
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;
    const intersects = ((yi > point.lat) !== (yj > point.lat)) &&
      (point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function propertyInMapArea(property) {
  if (!property.lat || !property.lng) return true;
  if (drawnMapPolygon?.length >= 3) {
    return pointInPolygon({ lat: property.lat, lng: property.lng }, drawnMapPolygon);
  }
  if (!mapBoundsFilter || typeof mapBoundsFilter.contains !== "function") return true;
  return mapBoundsFilter.contains([property.lat, property.lng]);
}

function areaBox(value, kind) {
  const source = kind === "postcode" ? zaragozaPostcodeAreas : zaragozaNeighborhoodAreas;
  const [lat, lng, latRadius, lngRadius] = source[value] || [41.6516, -0.8809, 0.012, 0.014];
  return {
    label: value,
    points: [
      [lat - latRadius, lng - lngRadius],
      [lat - latRadius, lng + lngRadius],
      [lat + latRadius, lng + lngRadius],
      [lat + latRadius, lng - lngRadius]
    ]
  };
}

function selectedAreaBoxes() {
  return [
    ...[...activePostcodes].map((value) => areaBox(value, "postcode")),
    ...[...activeNeighborhoods].map((value) => areaBox(value, "neighborhood"))
  ];
}

function selectedAreaBounds() {
  if (!leafletMap || typeof L === "undefined") return null;
  const areas = selectedAreaBoxes();
  if (!areas.length) return null;
  return L.latLngBounds(areas.flatMap((area) => area.points));
}

function drawSelectedAreas() {
  if (!leafletMap || !selectedAreaLayer || typeof L === "undefined") return null;
  clearSelectedAreaLayer();
  const areas = selectedAreaBoxes();
  areas.forEach((area) => {
    const polygon = L.polygon(area.points, {
      color: "#1f8a57",
      weight: 2,
      fillColor: "#1f8a57",
      fillOpacity: 0.13
    }).addTo(selectedAreaLayer);
    polygon.bindTooltip(area.label, {
      permanent: true,
      direction: "center",
      className: "map-area-label"
    });
  });
  return areas.length ? selectedAreaBounds() : null;
}

function propertyCardPhotos(property) {
  if (property.photos?.length) return [...new Set(property.photos.filter(Boolean))];
  const fallbackSets = {
    pedro1: ["assets/ebrostay-zaragoza-hero.webp", "assets/ebrostay-hero.webp", "assets/ebrostay-og.jpg"],
    pedro2: ["assets/ebrostay-zaragoza-hero.webp", "assets/ebrostay-og.jpg", "assets/ebrostay-hero.webp"],
    movera0: ["assets/movera-second-hero.jpg", "assets/movera-second-bedroom-1.jpg", "assets/movera-second-bathroom.jpg"],
    movera1: ["assets/movera-first-hero.jpg", "assets/movera-first-bedroom-1.jpg", "assets/movera-first-bathroom.jpg"]
  };
  return fallbackSets[property.id] || ["assets/ebrostay-hero.webp", "assets/ebrostay-zaragoza-hero.webp", "assets/ebrostay-og.jpg"];
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

  leafletMap = L.map(listingsMapElement, { scrollWheelZoom: false, zoomControl: true });
  leafletMap.zoomControl.setPosition("topright");
  leafletMap.attributionControl.setPrefix(false);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(leafletMap);
  selectedAreaLayer = L.layerGroup().addTo(leafletMap);
  markerLayer = L.layerGroup().addTo(leafletMap);
  leafletMap.setView([41.6516, -0.865], 12);
  ensureMapTools();
  leafletMap.on("dragstart zoomstart", markMapViewportIntent);
  leafletMap.on("dragend zoomend", handleMapViewportGestureEnd);
  leafletMap.on("moveend", handleMapMove);
}

function ensureMapTools() {
  const mapCard = document.querySelector(".map-card");
  if (!mapCard || mapCard.querySelector(".map-tools")) return;
  const tools = document.createElement("div");
  tools.className = "map-tools";
  tools.innerHTML = `
    <button class="details-button" type="button" data-map-draw>${t("map.draw")}</button>
    <button class="details-button map-clear-button" type="button" data-map-clear hidden aria-label="${t("map.clear")}" title="${t("map.clear")}">&times;</button>
    <button class="details-button" type="button" data-map-finish hidden>${t("map.finish")}</button>
    <span class="map-area-status" data-map-area-status>${t("map.areaCity")}</span>
  `;
  const wrap = mapCard.querySelector(".google-map-wrap");
  if (wrap) wrap.appendChild(tools);
  else mapCard.appendChild(tools);
  tools.querySelector("[data-map-draw]")?.addEventListener("click", (event) => preservePageScroll(() => {
    event.preventDefault();
    event.currentTarget.blur();
    if (isDrawingMapArea) cancelMapDraw();
    else startMapDraw();
  }));
  tools.querySelector("[data-map-finish]")?.addEventListener("click", (event) => preservePageScroll(() => {
    event.preventDefault();
    event.currentTarget.blur();
    finishMapDraw();
  }));
  tools.querySelector("[data-map-clear]")?.addEventListener("click", (event) => preservePageScroll(() => {
    event.preventDefault();
    event.currentTarget.blur();
    clearMapArea();
  }));
}

function syncMapTools() {
  ensureMapTools();
  const draw = document.querySelector("[data-map-draw]");
  const finish = document.querySelector("[data-map-finish]");
  const clear = document.querySelector("[data-map-clear]");
  if (draw) draw.textContent = isDrawingMapArea ? t("map.cancelDraw") : t("map.draw");
  if (finish) {
    finish.textContent = t("map.finish");
    finish.hidden = !isDrawingMapArea || draftDrawPoints.length < 3;
  }
  if (clear) {
    clear.innerHTML = "&times;";
    clear.setAttribute("aria-label", t("map.clear"));
    clear.setAttribute("title", t("map.clear"));
    clear.hidden = !(drawnMapPolygon || mapBoundsFilter || isDrawingMapArea);
  }
  const status = document.querySelector("[data-map-area-status]");
  if (status) {
    if (isDrawingMapArea) status.textContent = t("map.drawHint");
    else if (drawnMapPolygon) status.textContent = t("map.areaDrawn");
    else if (mapBoundsFilter) status.textContent = t("map.areaViewport");
    else status.textContent = t("map.areaCity");
  }
}

function suppressUpcomingMapMove() {
  suppressMapMove = true;
  suppressMapMoveUntil = Date.now() + 900;
  window.setTimeout(() => {
    if (Date.now() >= suppressMapMoveUntil) suppressMapMove = false;
  }, 950);
}

function isMapMoveSuppressed() {
  if (!suppressMapMove) return false;
  if (Date.now() < suppressMapMoveUntil) return true;
  suppressMapMove = false;
  return false;
}

function markMapViewportIntent(event) {
  if (isMapMoveSuppressed() || isDrawingMapArea || drawnMapPolygon) return;
  mapViewportFilteringEnabled = true;
}

function handleMapViewportGestureEnd() {
  if (!leafletMap || isMapMoveSuppressed() || isDrawingMapArea || drawnMapPolygon) return;
  mapViewportFilteringEnabled = true;
  handleMapMove();
}

function handleMapMove() {
  if (!leafletMap || isDrawingMapArea || drawnMapPolygon) return;
  if (isMapMoveSuppressed()) return;
  if (!mapViewportFilteringEnabled) return;
  mapBoundsFilter = leafletMap.getBounds();
  mapNeedsFit = false;
  renderProperties({ keepMapView: true });
}

function stopLeafletEvent(event) {
  if (event?.originalEvent && typeof L !== "undefined") {
    L.DomEvent.stop(event.originalEvent);
  }
}

function preservePageScroll(action) {
  const left = window.scrollX;
  const top = window.scrollY;
  const restore = () => window.scrollTo(left, top);
  action();
  window.requestAnimationFrame(restore);
  window.setTimeout(restore, 0);
  window.setTimeout(restore, 120);
}

function startMapDraw() {
  if (!leafletMap || typeof L === "undefined") return;
  clearDraftDrawShape();
  if (drawnMapShape) leafletMap.removeLayer(drawnMapShape);
  drawnMapShape = null;
  drawnMapPolygon = null;
  mapBoundsFilter = null;
  mapViewportFilteringEnabled = false;
  draftDrawPoints = [];
  isDrawingMapArea = true;
  listingsMapElement?.classList.add("is-drawing-area");
  leafletMap.dragging.disable();
  leafletMap.doubleClickZoom.disable();
  leafletMap.on("click", addMapDrawPoint);
  leafletMap.on("mousemove", previewMapDraw);
  leafletMap.on("dblclick", finishMapDraw);
  syncMapTools();
}

function addMapDrawPoint(event) {
  if (!leafletMap || !isDrawingMapArea) return;
  stopLeafletEvent(event);
  if (draftDrawPoints.length >= 3 && isNearFirstDrawPoint(event.latlng)) {
    finishMapDraw(event);
    return;
  }
  draftDrawPoints.push(event.latlng);
  updateDraftDrawShape(event.latlng);
  syncMapTools();
}

function isNearFirstDrawPoint(latlng) {
  if (!leafletMap || draftDrawPoints.length < 3) return false;
  const first = leafletMap.latLngToContainerPoint(draftDrawPoints[0]);
  const current = leafletMap.latLngToContainerPoint(latlng);
  return first.distanceTo(current) < 14;
}

function previewMapDraw(event) {
  if (!leafletMap || !isDrawingMapArea || draftDrawPoints.length === 0) return;
  updateDraftDrawShape(event.latlng);
}

function updateDraftDrawShape(cursorLatLng) {
  if (!leafletMap || typeof L === "undefined") return;
  const previewPoints = cursorLatLng ? [...draftDrawPoints, cursorLatLng] : draftDrawPoints;
  if (previewPoints.length < 2) return;
  if (!draftDrawShape) {
    draftDrawShape = L.polyline(previewPoints, {
      color: "#1f8a57",
      weight: 2,
      dashArray: "6 6"
    }).addTo(leafletMap);
  } else {
    draftDrawShape.setLatLngs(previewPoints);
  }
}

function finishMapDraw(event) {
  if (!leafletMap || !isDrawingMapArea) return;
  stopLeafletEvent(event);
  if (draftDrawPoints.length < 3) {
    syncMapTools();
    return;
  }
  endMapDrawingMode();
  clearDraftDrawShape();
  drawnMapPolygon = draftDrawPoints.slice();
  drawnMapShape = L.polygon(drawnMapPolygon, {
    color: "#1f8a57",
    weight: 2,
    fillColor: "#1f8a57",
    fillOpacity: 0.16
  }).addTo(leafletMap);
  draftDrawPoints = [];
  mapBoundsFilter = null;
  mapNeedsFit = false;
  syncMapTools();
  renderProperties({ keepMapView: true });
}

function endMapDrawingMode() {
  if (!leafletMap) return;
  isDrawingMapArea = false;
  listingsMapElement?.classList.remove("is-drawing-area");
  leafletMap.off("click", addMapDrawPoint);
  leafletMap.off("mousemove", previewMapDraw);
  leafletMap.off("dblclick", finishMapDraw);
  leafletMap.dragging.enable();
  leafletMap.doubleClickZoom.enable();
}

function clearDraftDrawShape() {
  if (draftDrawShape && leafletMap) leafletMap.removeLayer(draftDrawShape);
  draftDrawShape = null;
}

function cancelMapDraw() {
  clearDraftDrawShape();
  draftDrawPoints = [];
  endMapDrawingMode();
  syncMapTools();
}

function clearMapArea(options = {}) {
  if (drawnMapShape && leafletMap) leafletMap.removeLayer(drawnMapShape);
  clearDraftDrawShape();
  draftDrawPoints = [];
  drawnMapShape = null;
  drawnMapPolygon = null;
  mapBoundsFilter = null;
  mapViewportFilteringEnabled = false;
  if (isDrawingMapArea) endMapDrawingMode();
  mapNeedsFit = true;
  syncMapTools();
  if (!options.skipRender) renderProperties();
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

function updateMapMarkers(list, options = {}) {
  if (!leafletMap || !markerLayer) return;

  const areaBounds = drawSelectedAreas();
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

  if (areaBounds && mapNeedsFit && !options.keepMapView) {
    suppressUpcomingMapMove();
    leafletMap.fitBounds(areaBounds, {
      padding: [38, 38],
      maxZoom: activePostcodes.size + activeNeighborhoods.size === 1 ? 14 : 13
    });
    mapNeedsFit = false;
  } else if (list.length && mapNeedsFit && !options.keepMapView) {
    suppressUpcomingMapMove();
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
    suppressUpcomingMapMove();
    leafletMap.setView([property.lat, property.lng], 16);
    markersById.get(propertyId)?.openPopup();
  } else if (googleMap && mapSources[property.addressKey]) {
    googleMap.src = mapSources[property.addressKey];
  }

  syncAddressButtons(property.addressKey);
}

function syncAddressButtons(addressKey) {
  mapAddressButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mapAddress === addressKey);
  });
}

function focusMap(addressKey) {
  const location = addressLocations[addressKey];

  if (leafletMap && location) {
    suppressUpcomingMapMove();
    leafletMap.setView([location.lat, location.lng], 16);
  } else if (googleMap && mapSources[addressKey]) {
    googleMap.src = mapSources[addressKey];
  }

  syncAddressButtons(addressKey);
}

function renderProperties(options = {}) {
  if (!propertyGrid || !availabilityStatus) return;

  const selectedSort = sortBy?.value || activeFilter?.sortBy || "best";
  const baseFiltered = properties
    .filter((property) => isAvailable(property, activeFilter))
    .filter(passesLocationFilters);
  const filtered = sortProperties(baseFiltered.filter(propertyInMapArea), selectedSort);
  const count = filtered.length;
  const usingMapArea = Boolean(drawnMapPolygon || mapBoundsFilter);
  const usingLocationFilters = hasLocationFilters();

  syncMapTools();

  if (statusOverride) availabilityStatus.textContent = statusOverride;
  else if (usingMapArea && count === 0) availabilityStatus.textContent = t("status.mapNone");
  else if (usingMapArea) availabilityStatus.textContent = interpolate("status.mapMatches", { count });
  else if (usingLocationFilters && count === 0) availabilityStatus.textContent = t("status.none");
  else if (usingLocationFilters) availabilityStatus.textContent = interpolate("status.locationMatches", { count });
  else if (!activeFilter && quickFilters.size === 0) availabilityStatus.textContent = interpolate("status.all", { count: properties.length });
  else if (count === 0) availabilityStatus.textContent = t("status.none");
  else if (count === 1) availabilityStatus.textContent = t("status.one");
  else availabilityStatus.textContent = interpolate("status.matches", { count });

  propertyGrid.innerHTML = filtered.map((property) => {
    const isFavorite = favorites.has(property.id);
    const detailUrl = `property.html?id=${property.id}`;
    const badges = badgeList(property).map((key) => `<span>${t(key)}</span>`).join("");
    const amenities = property.amenities.map((key) => `<span>${t(`amenity.${key}`)}</span>`).join("");
    const photos = propertyCardPhotos(property);
    const photoIndex = Math.min(propertyPhotoIndexes[property.id] || 0, Math.max(photos.length - 1, 0));
    propertyPhotoIndexes[property.id] = photoIndex;
    const activePhoto = photos[photoIndex] || photos[0];
    const photoControls = photos.length > 1 ? `
      <button class="property-photo-arrow is-prev" type="button" data-card-slide="-1" data-property-id="${property.id}" aria-label="${t("listing.prevPhoto")}">&lsaquo;</button>
      <button class="property-photo-arrow is-next" type="button" data-card-slide="1" data-property-id="${property.id}" aria-label="${t("listing.nextPhoto")}">&rsaquo;</button>
      <span class="property-photo-count" data-photo-count>${photoIndex + 1}/${photos.length}</span>
    ` : "";

    return `
      <article class="property-card" data-property-id="${property.id}">
        <div class="property-media property-${property.addressKey}" data-card-media="${property.id}" aria-label="${t(property.nameKey)}">
          <img class="property-card-photo" src="${activePhoto}" alt="${t(property.nameKey)}" loading="lazy" data-card-photo>
          <a class="property-card-hit" href="${detailUrl}" aria-label="${t(property.nameKey)}"></a>
          <span class="availability-pill">${t("listing.available")}</span>
          <button class="favorite-button${isFavorite ? " is-active" : ""}" type="button" data-favorite="${property.id}" aria-label="${isFavorite ? t("listing.saved") : t("listing.favorite")}">${isFavorite ? t("listing.saved") : t("listing.favorite")}</button>
          ${photoControls}
        </div>
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
            ${property.rating ? `<span>${interpolate("listing.rating", { rating: property.rating })}</span>` : ""}
            <span>${interpolate("listing.from", { date: formatDate(dateValue(property.availableFrom)) })}</span>
          </div>
          <div class="amenity-list">${amenities}</div>
          <div class="property-actions">
            <a class="button primary request-button" href="${detailUrl}#book">${t("listing.book")}</a>
          </div>
        </div>
      </article>
    `;
  }).join("");

  updateMapMarkers(filtered, usingMapArea ? { ...options, keepMapView: true } : options);
}

function updatePropertyCardPhoto(propertyId, delta) {
  const property = properties.find((item) => item.id === propertyId);
  if (!property) return;
  const photos = propertyCardPhotos(property);
  if (photos.length < 2) return;
  const current = propertyPhotoIndexes[propertyId] || 0;
  const next = (current + delta + photos.length) % photos.length;
  propertyPhotoIndexes[propertyId] = next;
  const card = propertyGrid?.querySelector(`[data-property-id="${propertyId}"]`);
  const image = card?.querySelector("[data-card-photo]");
  const count = card?.querySelector("[data-photo-count]");
  if (image) image.src = photos[next];
  if (count) count.textContent = `${next + 1}/${photos.length}`;
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

  Object.values(datePickers).forEach((picker) => picker.set("locale", flatpickrLocale()));

  setAuthMode(authMode);

  document.querySelectorAll("[data-whatsapp]").forEach((link) => {
    link.href = whatsappLink(t("whatsapp.general"));
  });

  renderMapLocationFilters();
  syncMapTools();
  renderProperties();
  window.setTimeout(keepSearchHeadingClear, 0);
}

if (year) year.textContent = new Date().getFullYear();

window.addEventListener("resize", syncStickySearchOffsets);
window.addEventListener("load", syncStickySearchOffsets);
window.setTimeout(syncStickySearchOffsets, 300);

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

function handleLocationFilterClick(event) {
  const button = event.target.closest("[data-location-kind]");
  if (!button) return;
  const value = button.dataset.locationValue;
  const targetSet = button.dataset.locationKind === "postcode" ? activePostcodes : activeNeighborhoods;
  const isSelected = targetSet.has(value);
  if (!isSelected && activePostcodes.size + activeNeighborhoods.size >= AREA_SELECTION_LIMIT) {
    statusOverride = t("mapFilters.limit");
    renderProperties({ keepMapView: true });
    return;
  }
  isSelected ? targetSet.delete(value) : targetSet.add(value);
  statusOverride = null;
  clearMapArea({ skipRender: true });
  mapNeedsFit = true;
  renderMapLocationFilters();
  renderProperties();
}

postcodeFiltersElement?.addEventListener("click", handleLocationFilterClick);
neighborhoodFiltersElement?.addEventListener("click", handleLocationFilterClick);

locationFilterClear?.addEventListener("click", () => {
  activePostcodes.clear();
  activeNeighborhoods.clear();
  clearMapArea({ skipRender: true });
  mapNeedsFit = true;
  renderMapLocationFilters();
  renderProperties();
});

// Remember searched dates so the booking widget can preselect them
function rememberSearchDates(checkIn, checkOut, guests) {
  if (!checkIn) return;
  localStorage.setItem("ebrostay-search-dates", JSON.stringify({ checkIn, checkOut: checkOut || "", guests: guests || "" }));
}

// Umami funnel events; no personal data, only ids and dates
function trackEvent(name, data) {
  window.umami?.track(name, data);
}

if (heroSearch && availabilityFilter) {
  heroSearch.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(heroSearch);
    availabilityFilter.elements.city.value = data.get("city") || "Zaragoza";
    const heroDate = data.get("checkIn")?.toString() || "";
    const heroOutDate = data.get("checkOut")?.toString() || "";
    rememberSearchDates(heroDate, heroOutDate, data.get("guestCount")?.toString());
    trackEvent("search", { source: "hero", checkIn: heroDate, checkOut: heroOutDate });
    if (datePickers.checkIn) {
      heroDate ? datePickers.checkIn.setDate(heroDate, true) : datePickers.checkIn.clear();
    } else {
      availabilityFilter.elements.checkIn.value = heroDate;
    }
    if (datePickers.checkOut) {
      heroOutDate ? datePickers.checkOut.setDate(heroOutDate, true) : datePickers.checkOut.clear();
    } else {
      availabilityFilter.elements.checkOut.value = heroOutDate;
    }
    availabilityFilter.elements.guestCount.value = data.get("guestCount") || "2";
    statusOverride = null;
    activeFilter = getFilterFromForm(availabilityFilter);
    mapNeedsFit = true;
    document.querySelector("#search")?.scrollIntoView({ behavior: "smooth" });
    renderProperties();
  });
}

if (availabilityFilter) {
  let filterInputTimer = null;
  const syncFiltersFromForm = () => {
    statusOverride = null;
    activeFilter = getFilterFromForm(availabilityFilter);
    clearAreaSelectionsForCity();
    mapNeedsFit = true;
    renderMapLocationFilters();
    renderProperties();
  };

  availabilityFilter.addEventListener("change", () => {
    syncFiltersFromForm();
  });

  availabilityFilter.addEventListener("input", (event) => {
    if (!event.target.matches("#cityFilter, #guestCount, #maxBudget, #addressQuery")) return;
    clearTimeout(filterInputTimer);
    filterInputTimer = window.setTimeout(syncFiltersFromForm, 180);
  });

  availabilityFilter.addEventListener("submit", (event) => {
    event.preventDefault();
    statusOverride = null;
    activeFilter = getFilterFromForm(availabilityFilter, true);
    const filterData = new FormData(availabilityFilter);
    rememberSearchDates(filterData.get("checkIn")?.toString() || "", filterData.get("checkOut")?.toString() || "", filterData.get("guestCount")?.toString());
    trackEvent("search", { source: "filters", checkIn: filterData.get("checkIn")?.toString() || "", checkOut: filterData.get("checkOut")?.toString() || "" });
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
    activePostcodes.clear();
    activeNeighborhoods.clear();
    quickButtons.forEach((button) => button.classList.remove("is-active"));
    availabilityFilter?.reset();
    if (availabilityFilter) {
      availabilityFilter.elements.city.value = "Zaragoza";
      availabilityFilter.elements.guestCount.value = "2";
    }
    datePickers.checkIn?.clear();
    datePickers.checkOut?.clear();
    datePickers.checkOut?.set("minDate", "today");
    clearMapArea({ skipRender: true });
    mapNeedsFit = true;
    renderMapLocationFilters();
    renderProperties();
  });
}

if (propertyGrid) {
  propertyGrid.addEventListener("click", (event) => {
    const slide = event.target.closest("[data-card-slide]");
    const favoriteId = event.target.closest("[data-favorite]")?.dataset.favorite;
    const requestId = event.target.closest("[data-request]")?.dataset.request;
    const mapFocusId = event.target.closest("[data-map-focus]")?.dataset.mapFocus;

    if (slide) {
      event.preventDefault();
      event.stopPropagation();
      updatePropertyCardPhoto(slide.dataset.propertyId, Number(slide.dataset.cardSlide));
      return;
    }

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
      if (ok) {
        trackEvent("inquiry-sent");
        inquiryForm.reset();
      }
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

// Auth dialog modes: signin / signup (tabs), reset (forgot password),
// recover (arrived from a password-reset email link)
const AUTH_MODES = {
  signin: { title: "auth.title", copy: "auth.copy", submit: "auth.signin", email: true, password: true, tabs: true, forgot: true, sso: true, passwordAutocomplete: "current-password" },
  signup: { title: "auth.signupTitle", copy: "auth.signupCopy", submit: "auth.signup", email: true, password: true, tabs: true, forgot: false, sso: true, passwordAutocomplete: "new-password" },
  reset: { title: "auth.resetTitle", copy: "auth.resetCopy", submit: "auth.resetSend", email: true, password: false, tabs: true, forgot: false, sso: false, passwordAutocomplete: "current-password" },
  recover: { title: "auth.recoverTitle", copy: "auth.recoverCopy", submit: "auth.recoverSave", email: false, password: true, tabs: false, forgot: false, sso: false, passwordAutocomplete: "new-password" }
};
let authMode = "signin";

function setAuthMode(mode) {
  authMode = AUTH_MODES[mode] ? mode : "signin";
  const config = AUTH_MODES[authMode];
  if (!authForm) return;

  authTitle.textContent = t(config.title);
  authCopy.textContent = t(config.copy);
  authSubmit.textContent = t(config.submit);
  authEmailField.hidden = !config.email;
  authEmailField.querySelector("input").required = config.email;
  authPasswordField.hidden = !config.password;
  const passwordInput = authPasswordField.querySelector("input");
  passwordInput.required = config.password;
  passwordInput.setAttribute("autocomplete", config.passwordAutocomplete);
  authTabs.hidden = !config.tabs;
  authForgot.hidden = !config.forgot;
  if (authProviders) authProviders.style.display = config.sso ? "" : "none";
  authTabs.querySelectorAll("[data-auth-mode]").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.authMode === authMode);
  });
  if (authMessage) {
    authMessage.textContent = "";
    authMessage.className = "auth-message";
  }
}

function showAuthForm() {
  authSuccess.hidden = true;
  authForm.hidden = false;
}

function showAuthSuccess(titleKey, copyKey, email) {
  authSuccessTitle.textContent = t(titleKey);
  authSuccessCopy.textContent = email ? interpolate(copyKey, { email }) : t(copyKey);
  authForm.hidden = true;
  authSuccess.hidden = false;
}

function showAuthError(key) {
  authMessage.textContent = t(key);
  authMessage.classList.add("is-error");
}

if (authButton && authDialog) {
  authButton.addEventListener("click", () => {
    showAuthForm();
    setAuthMode("signin");
    authForm.reset();
    authDialog.showModal();
  });
}

if (authTabs) {
  authTabs.addEventListener("click", (event) => {
    const mode = event.target.closest("[data-auth-mode]")?.dataset.authMode;
    if (mode) setAuthMode(mode);
  });
}

if (authForgot) {
  authForgot.addEventListener("click", () => setAuthMode("reset"));
}

if (authClose) {
  authClose.addEventListener("click", () => authDialog?.close());
}

if (authSuccessClose) {
  authSuccessClose.addEventListener("click", () => {
    authDialog?.close();
    showAuthForm();
  });
}

if (authForm) {
  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(authForm);
    const email = formData.get("email")?.toString().trim() || "";
    const password = formData.get("password")?.toString() || "";
    authMessage.className = "auth-message";

    if (authMode === "signup") {
      const { needsConfirmation, error } = await EbrostayBackend.signUp(email, password);
      if (error) showAuthError("auth.signupError");
      else if (needsConfirmation) {
        showAuthSuccess("auth.successEmailTitle", "auth.successConfirmCopy", email);
        authForm.reset();
      } else {
        authDialog?.close();
        authForm.reset();
      }
      return;
    }

    if (authMode === "reset") {
      const error = await EbrostayBackend.resetPassword(email);
      if (error) showAuthError("auth.resetError");
      else {
        showAuthSuccess("auth.successEmailTitle", "auth.successResetCopy", email);
        authForm.reset();
      }
      return;
    }

    if (authMode === "recover") {
      const error = await EbrostayBackend.updatePassword(password);
      if (error) showAuthError("auth.recoverError");
      else {
        showAuthSuccess("auth.successRecoverTitle", "auth.successRecoverCopy");
        authForm.reset();
      }
      return;
    }

    const error = await EbrostayBackend.signIn(email, password);
    if (error) showAuthError("auth.error");
    else {
      authDialog?.close();
      authForm.reset();
    }
  });
}

if (logoutButton) {
  logoutButton.addEventListener("click", () => EbrostayBackend.signOut());
}

initListingsMap();
setupDatePickers();
applyLanguage(currentLanguage);

if (window.location.hash === "#login" && authDialog) {
  showAuthForm();
  setAuthMode("signin");
  authDialog.showModal();
  history.replaceState(null, "", window.location.pathname);
}

if (window.EbrostayBackend) {
  EbrostayBackend.init({
    onPropertiesLoaded: () => {
      mapNeedsFit = true;
      if (typeof hydrateOwnerPublishedProperties === "function") hydrateOwnerPublishedProperties();
      renderMapLocationFilters();
      renderProperties();
    },
    onPasswordRecovery: () => {
      showAuthForm();
      setAuthMode("recover");
      if (!authDialog.open) authDialog.showModal();
    },
    onAuthChanged: (user) => {
      updateAuthUI(user);
      window.EbrostayOwnerComposer?.refreshAuth?.(user);
      // a booking attempt while signed out stores where to return after login
      if (user) {
        try {
          const back = JSON.parse(localStorage.getItem("ebrostay-return-to") || "null");
          localStorage.removeItem("ebrostay-return-to");
          if (back?.url && Date.now() - back.ts < 30 * 60 * 1000) {
            window.location.href = back.url;
            return;
          }
        } catch { /* corrupted entry */ }
      }
      if (user) {
        syncFavorites();
      } else {
        favorites = new Set(JSON.parse(localStorage.getItem("ebrostay-favorites") || "[]"));
        renderProperties();
      }
    }
  });

  // Google / Outlook SSO buttons appear once the provider is enabled
  // in the Supabase dashboard (Authentication -> Providers)
  EbrostayBackend.getEnabledProviders().then((providers) => {
    if (!authProviders) return;
    let any = false;
    authProviders.querySelectorAll("[data-provider]").forEach((button) => {
      const enabled = Boolean(providers[button.dataset.provider]);
      button.hidden = !enabled;
      any = any || enabled;
    });
    authProviders.hidden = !any;
  });

  authProviders?.addEventListener("click", async (event) => {
    const provider = event.target.closest("[data-provider]")?.dataset.provider;
    if (!provider) return;
    const error = await EbrostayBackend.signInWithProvider(provider);
    if (error) {
      authMessage.textContent = t("auth.error");
      authMessage.classList.add("is-error");
    }
  });
}
