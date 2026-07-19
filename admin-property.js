// Single-property editor: texts, photos, address (auto-geocoded),
// availability, and tenant-only stay information.
const languageButtons = document.querySelectorAll("[data-lang]");
const adminStatus = document.querySelector("#adminStatus");
const adminToolbar = document.querySelector("#adminToolbar");
const adminUserEmail = document.querySelector("#adminUserEmail");
const adminLogout = document.querySelector("#adminLogout");
const propertyEditor = document.querySelector("#propertyEditor");

const propertyId = new URLSearchParams(window.location.search).get("id");

let currentLanguage = localStorage.getItem("ebrostay-language") || "es";
let row = null;
let guestInfo = null;
let ownerEmail = "";
let aiAutoTranslate = localStorage.getItem("ebrostay-ai-autotranslate") !== "off";
// Images pulled out of an uploaded file, awaiting the admin's photo/floorplan/skip
// classification before they are uploaded to the listing.
let extractedImages = [];
// The photo currently being dragged to reorder, while a drag is in progress.
let photoDrag = null;
// Leaflet map + marker for the address confirmation; recreated on each render
// because renderEditor() replaces the editor's DOM (and the map container).
let adminMap = null;
let adminMarker = null;
// Geocode candidates for the current search, plus the address text those
// coordinates were resolved for (so we only re-geocode when it actually changes).
let geoCandidates = [];
let geoResolvedFor = null;

const t = (key) => translations[currentLanguage][key] || translations.es[key] || key;

function formatDate(value) {
  return new Intl.DateTimeFormat(currentLanguage === "es" ? "es-ES" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

const PAGE_STATUS_KEYS = new Set(["admin.notConfigured", "admin.notAdmin"]);
let statusTimer;

function showStatus(key) {
  clearTimeout(statusTimer);
  adminStatus.hidden = false;
  adminStatus.dataset.statusKey = key;
  adminStatus.textContent = t(key);
  adminStatus.classList.toggle("is-toast", !PAGE_STATUS_KEYS.has(key));
  const AI_ERROR_KEYS = new Set(["admin.ai.error", "admin.ai.notConfigured", "admin.ai.empty", "admin.ai.noText"]);
  const isError = key === "admin.error" || key === "admin.guestNotFound" || key === "admin.geocodeNone" || key === "admin.ownerNotFound" || AI_ERROR_KEYS.has(key);
  adminStatus.classList.toggle("is-error", isError);
  if (key === "admin.saved" || key === "admin.ai.filled") statusTimer = setTimeout(hideStatus, 2600);
  if (isError) statusTimer = setTimeout(hideStatus, 5000);
}

function hideStatus() {
  adminStatus.hidden = true;
  adminStatus.classList.remove("is-toast", "is-error");
  delete adminStatus.dataset.statusKey;
}

const AMENITY_KEYS = ["wifi", "desk", "balcony", "lift", "ac", "heating", "kitchen", "terrace", "washer", "dishwasher", "tv", "microwave", "oven", "parking"];
const ENERGY_RATINGS = ["A", "B", "C", "D", "E", "F", "G"];
const TYPE_KEYS = ["apartment", "room", "home"];

function escapeValue(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function sortedPhotos(isFloorplan) {
  return (row.property_photos || [])
    .filter((photo) => Boolean(photo.is_floorplan) === isFloorplan)
    .sort((a, b) => a.sort_order - b.sort_order || (a.storage_path < b.storage_path ? -1 : 1));
}

// Photo tiles for one group (photos or floor plans). Each tile is drag-and-drop
// reorderable and also carries ◀/▶ buttons (keyboard/touch friendly). The first
// photo is the listing cover, so there is no separate "make cover" action.
function photoGridItems(isFloorplan) {
  const photos = sortedPhotos(isFloorplan);
  if (!photos.length) {
    return `<p class="admin-empty-note">${t(isFloorplan ? "admin.noFloorplans" : "admin.noPhotos")}</p>`;
  }
  const flag = isFloorplan ? "yes" : "no";
  return photos.map((photo, index) => `
        <figure class="admin-photo" draggable="true" data-photo-id="${photo.id}" data-floorplan="${flag}">
          <img src="${EbrostayBackend.photoUrl(photo.storage_path)}" alt="" loading="lazy" draggable="false">
          ${!isFloorplan && index === 0 ? `<span class="admin-photo-cover">${t("admin.cover")}</span>` : ""}
          <div class="admin-photo-actions">
            <button class="details-button" type="button" data-move-photo="${photo.id}" data-move-dir="-1" data-floorplan="${flag}" title="${t("admin.moveLeft")}" aria-label="${t("admin.moveLeft")}"${index === 0 ? " disabled" : ""}>&#9664;</button>
            <button class="details-button" type="button" data-move-photo="${photo.id}" data-move-dir="1" data-floorplan="${flag}" title="${t("admin.moveRight")}" aria-label="${t("admin.moveRight")}"${index === photos.length - 1 ? " disabled" : ""}>&#9654;</button>
            <button class="details-button danger" type="button" data-delete-photo="${photo.id}" data-path="${escapeValue(photo.storage_path)}">${t("admin.delete")}</button>
          </div>
        </figure>
      `).join("");
}

// Re-render just one photo grid in place (after a reorder) so the surrounding
// edit form keeps any unsaved input.
function renderPhotoGrid(isFloorplan) {
  const grid = propertyEditor.querySelector(`[data-photo-grid="${isFloorplan ? "floorplans" : "photos"}"]`);
  if (grid) grid.innerHTML = photoGridItems(isFloorplan);
}

function renderPhotoSection(isFloorplan) {
  const hint = isFloorplan ? t("admin.floorplansCopy") : t("admin.reorderHint");
  return `
    <section class="admin-section">
      <div class="admin-section-head">
        <h3>${t(isFloorplan ? "admin.floorplans" : "admin.photos")}</h3>
        <label class="admin-upload">
          <span class="button ghost">${t(isFloorplan ? "admin.addFloorplans" : "admin.addPhotos")}</span>
          <input type="file" accept="image/*" multiple hidden data-photo-input="${row.id}" data-floorplan="${isFloorplan ? "yes" : "no"}">
        </label>
      </div>
      <p class="admin-hint">${hint}</p>
      <div class="admin-photo-grid" data-photo-grid="${isFloorplan ? "floorplans" : "photos"}">${photoGridItems(isFloorplan)}</div>
    </section>
  `;
}

// Persist a new order for one photo group: renumber to a clean 10,20,30…
// sequence and save only the rows that moved. Local state updates first so the
// grid re-renders instantly; a save error reloads from the server to resync.
async function applyPhotoOrder(orderedPhotos, isFloorplan) {
  const changes = PhotoOrder.renumber(orderedPhotos);
  changes.forEach(({ id, sort_order }) => {
    const photo = (row.property_photos || []).find((item) => item.id === id);
    if (photo) photo.sort_order = sort_order;
  });
  renderPhotoGrid(isFloorplan);
  if (!changes.length) return;
  const sb = EbrostayBackend.getClient();
  for (const change of changes) {
    const { error } = await sb.from("property_photos").update({ sort_order: change.sort_order }).eq("id", change.id);
    if (error) {
      showStatus("admin.error");
      await loadProperty();
      return;
    }
  }
  showStatus("admin.saved");
}

// Move one photo a step earlier (dir -1) or later (dir +1) within its group.
async function movePhotoStep(photoId, dir, isFloorplan) {
  const photos = sortedPhotos(isFloorplan);
  const index = photos.findIndex((photo) => photo.id === photoId);
  if (index < 0) return;
  await applyPhotoOrder(PhotoOrder.moveItem(photos, index, index + dir), isFloorplan);
}

// Apply a Markdown formatting command from the description toolbar to the
// textarea's current selection (or insert a placeholder when nothing is selected).
function applyRichCommand(textarea, command) {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const value = textarea.value;
  const selected = value.slice(start, end);
  let insert;
  let selStart;
  let selEnd;
  if (command === "bullet") {
    const block = selected || t("admin.rtBullet");
    insert = block.split("\n").map((line) => (line.trim() ? `- ${line.replace(/^- /, "")}` : line)).join("\n");
    selStart = start;
    selEnd = start + insert.length;
  } else {
    const marker = command === "bold" ? "**" : "*";
    const inner = selected || t(command === "bold" ? "admin.rtBold" : "admin.rtItalic");
    insert = `${marker}${inner}${marker}`;
    selStart = start + marker.length;
    selEnd = selStart + inner.length;
  }
  textarea.value = value.slice(0, start) + insert + value.slice(end);
  textarea.focus();
  textarea.setSelectionRange(selStart, selEnd);
}

function renderAiSection() {
  return `
    <section class="admin-section admin-ai">
      <h3>✦ ${t("admin.ai.section")}</h3>
      <p class="admin-hint">${t("admin.ai.intro")}</p>
      <div class="admin-ai-controls">
        <label class="admin-upload">
          <span class="button ghost">${t("admin.ai.file")}</span>
          <input type="file" accept=".pdf,.txt,.md,.csv,.text,application/pdf,text/plain,image/*,.png,.jpg,.jpeg,.webp" hidden data-ai-file>
        </label>
        <span class="admin-ai-filename" data-ai-filename></span>
      </div>
      <label class="admin-wide">
        <span>${t("admin.ai.paste")}</span>
        <textarea data-ai-paste rows="4" placeholder="${escapeValue(t("admin.ai.pastePlaceholder"))}"></textarea>
      </label>
      <div class="admin-ai-actions">
        <button class="button primary" type="button" data-ai-autofill>✦ ${t("admin.ai.autofill")}</button>
        <label class="admin-flag admin-ai-toggle"><input type="checkbox" data-ai-toggle ${aiAutoTranslate ? "checked" : ""}> <span>${t("admin.ai.autoTranslate")}</span></label>
      </div>
      <div data-ai-images>${renderExtractedImages()}</div>
    </section>
  `;
}

function renderEditForm() {
  const text = (labelKey, name, value, type = "text") => `
    <label>
      <span>${t(labelKey)}</span>
      <input name="${name}" type="${type}" value="${escapeValue(value)}" ${type === "number" ? 'step="any"' : ""}>
    </label>
  `;
  const flag = (labelKey, name, checked) => `
    <label class="admin-flag"><input type="checkbox" name="${name}" ${checked ? "checked" : ""}> <span>${t(labelKey)}</span></label>
  `;
  // Current cost policy for the row: explicit column wins, else derive from the
  // legacy bills_included flag combined with any utilities cap.
  const billsPolicyValue = row.bills_policy
    || (row.bills_included ? (row.utilities_cap_eur ? "capped" : "included") : "excluded");
  // Bilingual fields carry translate metadata + a per-field translate button,
  // so the editor can fill the counterpart language on demand or automatically.
  const transBtn = (group, lang) =>
    `<button type="button" class="ai-translate-btn" data-ai-translate data-translate-group="${group}" data-translate-lang="${lang}" title="${t("admin.ai.translateOne")}" aria-label="${t("admin.ai.translateOne")}">✦</button>`;
  const pairText = (labelKey, name, value, group, lang) => `
    <label>
      <span>${t(labelKey)} ${transBtn(group, lang)}</span>
      <input name="${name}" type="text" value="${escapeValue(value)}" data-translate-group="${group}" data-translate-lang="${lang}">
    </label>
  `;
  const richToolbar = (name) => `
    <div class="rt-toolbar">
      <button type="button" class="rt-btn" data-rt-cmd="bold" data-rt-target="${name}" title="${t("admin.rtBold")}" aria-label="${t("admin.rtBold")}"><strong>B</strong></button>
      <button type="button" class="rt-btn" data-rt-cmd="italic" data-rt-target="${name}" title="${t("admin.rtItalic")}" aria-label="${t("admin.rtItalic")}"><em>I</em></button>
      <button type="button" class="rt-btn" data-rt-cmd="bullet" data-rt-target="${name}" title="${t("admin.rtBullet")}" aria-label="${t("admin.rtBullet")}">&#8226;</button>
    </div>`;
  // Description fields accept a small Markdown subset; the toolbar inserts the
  // markers and the property page renders them via rich-text.js.
  const pairArea = (labelKey, name, value, group, lang) => `
    <label class="admin-wide">
      <span>${t(labelKey)} ${transBtn(group, lang)}</span>
      ${richToolbar(name)}
      <textarea name="${name}" rows="4" data-translate-group="${group}" data-translate-lang="${lang}">${escapeValue(value)}</textarea>
      <small class="rt-hint">${t("admin.rtHint")}</small>
    </label>
  `;

  return `
    <form class="admin-form" data-edit-form="${row.id}">
      <fieldset class="admin-group">
        <legend>${t("admin.section.basic")}</legend>
        ${text("admin.field.name", "name", row.name)}
        <label>
          <span>${t("admin.field.type")}</span>
          <select name="type">
            ${TYPE_KEYS.map((key) => `<option value="${key}" ${row.type === key ? "selected" : ""}>${t(`type.${key}`)}</option>`).join("")}
          </select>
        </label>
        ${text("admin.field.guests", "guests", row.guests, "number")}
        ${text("admin.field.rating", "rating", row.rating, "number")}
        ${text("admin.field.bedrooms", "bedrooms", row.bedrooms, "number")}
        ${text("admin.field.bathrooms", "bathrooms", row.bathrooms, "number")}
        ${text("admin.field.size", "size_m2", row.size_m2, "number")}
        ${text("admin.field.floor", "floor_number", row.floor_number, "number")}
      </fieldset>
      <fieldset class="admin-group">
        <legend>${t("admin.section.price")}</legend>
        ${text("admin.field.priceNumber", "price_number", row.price_number, "number")}
        ${pairText("admin.field.priceNoteEs", "price_note_es", row.price_note_es, "priceNote", "es")}
        ${pairText("admin.field.priceNoteEn", "price_note_en", row.price_note_en, "priceNote", "en")}
      </fieldset>
      <fieldset class="admin-group">
        <legend>${t("admin.section.conditions")}</legend>
        ${text("admin.field.minStay", "min_stay_months", row.min_stay_months, "number")}
        ${text("admin.field.maxStay", "max_stay_months", row.max_stay_months, "number")}
        ${text("admin.field.deposit", "deposit_amount", row.deposit_amount, "number")}
        ${text("admin.field.upfront", "upfront_rent_eur", row.upfront_rent_eur, "number")}
        ${text("admin.field.utilitiesCap", "utilities_cap_eur", row.utilities_cap_eur, "number")}
        <label>
          <span>${t("admin.field.billsPolicy")}</span>
          <select name="bills_policy">
            ${["included", "capped", "excluded"].map((policy) => `<option value="${policy}" ${billsPolicyValue === policy ? "selected" : ""}>${t(`admin.billsPolicy.${policy}`)}</option>`).join("")}
          </select>
        </label>
        <label>
          <span>${t("admin.field.energy")}</span>
          <select name="energy_rating">
            <option value="">${t("admin.energyNone")}</option>
            ${ENERGY_RATINGS.map((rating) => `<option value="${rating}" ${row.energy_rating === rating ? "selected" : ""}>${rating}</option>`).join("")}
          </select>
        </label>
        ${text("admin.field.video", "video_url", row.video_url)}
      </fieldset>
      <fieldset class="admin-group">
        <legend>${t("admin.section.textsEs")}</legend>
        ${pairText("admin.field.areaEs", "area_es", row.area_es, "area", "es")}
        ${pairArea("admin.field.copyEs", "copy_es", row.copy_es, "copy", "es")}
        ${pairArea("admin.field.detailsEs", "details_es", row.details_es, "details", "es")}
        ${pairText("admin.field.bedsEs", "beds_es", row.beds_es, "beds", "es")}
      </fieldset>
      <fieldset class="admin-group">
        <legend>${t("admin.section.textsEn")}</legend>
        ${pairText("admin.field.areaEn", "area_en", row.area_en, "area", "en")}
        ${pairArea("admin.field.copyEn", "copy_en", row.copy_en, "copy", "en")}
        ${pairArea("admin.field.detailsEn", "details_en", row.details_en, "details", "en")}
        ${pairText("admin.field.bedsEn", "beds_en", row.beds_en, "beds", "en")}
      </fieldset>
      <fieldset class="admin-group">
        <legend>${t("admin.section.location")}</legend>
        <div class="admin-wide">
          <span class="admin-label">${t("admin.field.addressFull")}</span>
          <div class="admin-geocode-row">
            <input name="address" type="text" value="${escapeValue(row.address)}" placeholder="${t("admin.geocodePlaceholder")}" autocomplete="off">
            <button class="details-button" type="button" data-geocode="${row.id}">${t("admin.geocodeFind")}</button>
          </div>
          <p class="admin-hint" data-geocode-status>${t("admin.addressHint")}</p>
          <div class="address-result" data-geocode-panel hidden>
            <label class="address-choices" data-geocode-choices hidden>
              <span>${t("admin.geocodeChoose")}</span>
              <select data-geocode-select></select>
            </label>
            <div class="address-proposed" data-geocode-proposed hidden>
              <p class="address-proposed-q">${t("admin.geocodeConfirmQ")}</p>
              <p class="address-proposed-street" data-geo-street></p>
              <p class="address-proposed-locality" data-geo-locality></p>
              <div class="address-map" data-geocode-map></div>
            </div>
          </div>
        </div>
        ${text("admin.field.city", "city", row.city)}
        ${text("admin.field.addressKey", "address_key", row.address_key)}
        <input type="hidden" name="lat" value="${escapeValue(row.lat ?? "")}">
        <input type="hidden" name="lng" value="${escapeValue(row.lng ?? "")}">
      </fieldset>
      <fieldset class="admin-group">
        <legend>${t("admin.section.owner")}</legend>
        <label class="admin-wide">
          <span>${t("admin.field.ownerEmail")}</span>
          <input name="owner_email" type="email" value="${escapeValue(ownerEmail)}" placeholder="propietario@email.com">
        </label>
        <p class="admin-hint">${t("admin.ownerHint")}</p>
      </fieldset>
      <fieldset class="admin-group admin-chips">
        <legend>${t("admin.field.amenities")}</legend>
        ${AMENITY_KEYS.map((key) => `
          <label class="admin-flag"><input type="checkbox" name="amenities" value="${key}" ${(row.amenities || []).includes(key) ? "checked" : ""}> <span>${t(`amenity.${key}`)}</span></label>
        `).join("")}
      </fieldset>
      <fieldset class="admin-group admin-chips">
        <legend>${t("admin.section.status")}</legend>
        ${flag("admin.flag.isNew", "is_new", row.is_new)}
        ${flag("admin.flag.checked", "checked", row.checked)}
        ${flag("admin.flag.deposit", "deposit_protected", row.deposit_protected)}
        ${flag("admin.flag.pets", "pets_allowed", row.pets_allowed)}
        ${flag("admin.flag.smoking", "smoking_allowed", row.smoking_allowed)}
        ${flag("admin.flag.couples", "couples_allowed", row.couples_allowed)}
        ${flag("admin.flag.selfCheckin", "self_checkin", row.self_checkin)}
        ${flag("admin.flag.published", "is_published", row.is_published)}
      </fieldset>
      <button class="button primary" type="submit">${t("admin.saveChanges")}</button>
    </form>
  `;
}

function renderGuestInfoForm() {
  const text = (labelKey, name, value, type = "text") => `
    <label>
      <span>${t(labelKey)}</span>
      <input name="${name}" type="${type}" value="${escapeValue(value)}">
    </label>
  `;
  const info = guestInfo || {};
  return `
    <section class="admin-section">
      <h3>${t("admin.guestInfo")}</h3>
      <p class="admin-hint">${t("admin.guestInfoCopy")}</p>
      <form class="admin-form" data-guest-info-form="${row.id}">
        <fieldset class="admin-group">
          <legend>${t("admin.guestInfo")}</legend>
          ${text("guest.wifiName", "wifi_name", info.wifi_name)}
          ${text("guest.wifiPassword", "wifi_password", info.wifi_password)}
          ${text("guest.checkinTime", "checkin_time", info.checkin_time)}
          ${text("guest.checkoutTime", "checkout_time", info.checkout_time)}
          ${text("guest.emergencyPhone", "emergency_phone", info.emergency_phone)}
          <label class="admin-wide">
            <span>${t("guest.keyPickup")}</span>
            <textarea name="key_pickup" rows="2">${escapeValue(info.key_pickup)}</textarea>
          </label>
          <label class="admin-wide">
            <span>${t("guest.notes")}</span>
            <textarea name="notes" rows="3">${escapeValue(info.notes)}</textarea>
          </label>
        </fieldset>
        <button class="button primary" type="submit">${t("admin.saveChanges")}</button>
      </form>
    </section>
  `;
}

function renderEditor() {
  if (!row) return;
  // The map container is rebuilt below, so drop the old Leaflet instance. The
  // saved coordinates already match the saved address, so don't re-geocode it.
  adminMap = null;
  adminMarker = null;
  geoCandidates = [];
  geoResolvedFor = row.address || null;
  const blocks = (row.availability_blocks || [])
    .slice()
    .sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
  const blockItems = blocks.length
    ? blocks.map((block) => `
        <li>
          <span>${formatDate(block.start_date)} &ndash; ${formatDate(block.end_date)}${block.profiles?.email ? `<small class="admin-guest">${t("admin.guest")}: ${block.profiles.email}</small>` : ""}</span>
          <button class="details-button danger" type="button" data-delete-block="${block.id}">${t("admin.delete")}</button>
        </li>
      `).join("")
    : `<li class="admin-empty">${t("admin.noBlocks")}</li>`;

  propertyEditor.innerHTML = `
    <section class="admin-card" data-property="${row.id}">
      <header class="admin-card-head">
        <div>
          <h2>${escapeValue(row.name)}</h2>
          <p class="admin-card-meta">${row.price_number} EUR/mes &middot; ${row.guests} ${t("admin.guestsUnit")}${row.address ? ` &middot; ${escapeValue(row.address)}` : ""}</p>
        </div>
        <span class="admin-chip ${row.is_published ? "is-live" : "is-off"}">${t(row.is_published ? "admin.published" : "admin.unpublished")}</span>
      </header>
      ${renderPhotoSection(false)}
      ${renderPhotoSection(true)}
      ${renderAiSection()}
      ${renderEditForm()}
      ${renderGuestInfoForm()}
      <section class="admin-section">
        <h3>${t("admin.availability")}</h3>
        <form class="admin-available" data-available-form="${row.id}">
          <label>
            <span>${t("admin.availableFrom")}</span>
            <input name="availableFrom" type="date" value="${row.available_from || ""}">
          </label>
          <button class="button ghost" type="submit">${t("admin.save")}</button>
        </form>
        <h4>${t("admin.blocks")}</h4>
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
          <label class="admin-guest-email">
            <span>${t("admin.field.guestEmail")}</span>
            <input name="guestEmail" type="email">
          </label>
          <button class="button primary" type="submit">${t("admin.add")}</button>
        </form>
      </section>
    </section>
  `;
}

async function loadProperty() {
  const sb = EbrostayBackend.getClient();
  const [propResult, infoResult] = await Promise.all([
    sb.from("properties")
      .select("*, availability_blocks(id, start_date, end_date, profiles(email)), property_photos(id, storage_path, sort_order, is_floorplan)")
      .eq("id", propertyId)
      .maybeSingle(),
    sb.from("property_guest_info").select("*").eq("property_id", propertyId).maybeSingle()
  ]);
  if (propResult.error || !propResult.data) {
    showStatus("admin.error");
    return;
  }
  row = propResult.data;
  guestInfo = infoResult.data || null;
  ownerEmail = "";
  if (row.owner_id) {
    const { data: owner } = await sb.from("profiles").select("email").eq("id", row.owner_id).maybeSingle();
    ownerEmail = owner?.email || "";
  }
  renderEditor();
}

// Ebrostay operates in Spain, so Spanish results are surfaced first.
const spainRank = (result) => (result.address?.country_code === "es" ? 0 : 1);

// Turn a Nominatim result into a human-readable address (a street line and a
// "postcode city" line) plus its coordinates. The admin never sees raw numbers.
function describeGeoResult(result) {
  const a = result.address || {};
  const fromName = (result.display_name || "").split(",").map((part) => part.trim());
  const street = [a.road || a.pedestrian || a.footway || a.neighbourhood || a.suburb, a.house_number]
    .filter(Boolean).join(" ").trim();
  const city = a.city || a.town || a.village || a.municipality || a.county || "";
  const locality = [a.postcode, city].filter(Boolean).join(" ").trim();
  const streetLine = street || fromName[0] || "";
  const localityLine = locality || fromName.slice(1, 3).join(", ");
  return {
    street: streetLine,
    locality: localityLine,
    city,
    label: [streetLine, localityLine].filter(Boolean).join(" · ") || result.display_name,
    lat: Number(result.lat),
    lng: Number(result.lon)
  };
}

// Query Nominatim, loosening the search until something matches, then return
// de-duplicated candidates with Spanish addresses listed first.
async function fetchGeocodeCandidates(query) {
  const lang = currentLanguage === "es" ? "es" : "en";
  const search = async (q) => {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=10&accept-language=${lang}&q=${encodeURIComponent(q)}`,
      { headers: { Accept: "application/json" } }
    );
    const results = await response.json();
    return Array.isArray(results) ? results : [];
  };
  // OpenStreetMap often lacks the house number or expects the official street
  // name, so fall back to progressively looser queries.
  const cleanup = (value) => value.replace(/\s{2,}/g, " ").replace(/\s+,/g, ",").replace(/^[\s,]+|[\s,]+$/g, "");
  const located = /,|zaragoza|españa|espana|spain/i.test(query);
  const withPlace = located ? query : `${query}, Zaragoza, España`;
  const noNumber = cleanup(withPlace.replace(/\d+/g, " "));
  const noStreetType = cleanup(noNumber.replace(/\b(calle|c\/|avenida|avda\.?|av\.?|paseo|plaza|pza\.?|camino|ronda)\s+(de\s+|del\s+|la\s+)?/gi, ""));
  const candidates = [...new Set([withPlace, noNumber, noStreetType].filter(Boolean))];
  let results = [];
  for (const candidate of candidates) {
    results = await search(candidate);
    if (results.length) break;
  }
  const seen = new Set();
  const unique = results.filter((r) => !seen.has(r.place_id) && seen.add(r.place_id));
  // Stable sort keeps Nominatim's relevance order within each country group.
  unique.sort((a, b) => spainRank(a) - spainRank(b));
  return unique;
}

// Draw / move the confirmation map pin for the chosen coordinates.
function showAdminMapPin(lat, lng) {
  const el = propertyEditor.querySelector("[data-geocode-map]");
  if (!el || typeof L === "undefined") return;
  if (!adminMap) {
    adminMap = L.map(el, { scrollWheelZoom: false }).setView([lat, lng], 16);
    adminMap.attributionControl.setPrefix(false);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(adminMap);
  } else {
    adminMap.setView([lat, lng], 16);
  }
  if (adminMarker) adminMarker.setLatLng([lat, lng]);
  else adminMarker = L.marker([lat, lng]).addTo(adminMap);
  // The container starts hidden, so Leaflet needs a nudge once it is shown.
  setTimeout(() => adminMap && adminMap.invalidateSize(), 0);
}

// Apply a candidate to the form: fill the hidden coordinates (+ city if empty),
// show the proposed address, drop the map pin, and remember the resolved text.
function applyGeoCandidate(index) {
  const form = propertyEditor.querySelector("[data-edit-form]");
  const candidate = geoCandidates[index];
  if (!form || !candidate) return;
  const info = describeGeoResult(candidate);
  form.querySelector('input[name="lat"]').value = info.lat.toFixed(6);
  form.querySelector('input[name="lng"]').value = info.lng.toFixed(6);
  const cityInput = form.querySelector('input[name="city"]');
  if (cityInput && !cityInput.value.trim() && info.city) cityInput.value = info.city;

  const proposed = propertyEditor.querySelector("[data-geocode-proposed]");
  proposed.hidden = false;
  proposed.querySelector("[data-geo-street]").textContent = info.street || "—";
  proposed.querySelector("[data-geo-locality]").textContent = info.locality || "";
  showAdminMapPin(info.lat, info.lng);

  geoResolvedFor = form.querySelector('input[name="address"]').value.trim();
}

// "Find address" button: geocode what the admin typed and present the match(es)
// — a dropdown when several are possible, Spanish ones first.
async function geocodeIntoForm() {
  const form = propertyEditor.querySelector("[data-edit-form]");
  const status = propertyEditor.querySelector("[data-geocode-status]");
  const panel = propertyEditor.querySelector("[data-geocode-panel]");
  const choices = propertyEditor.querySelector("[data-geocode-choices]");
  const select = propertyEditor.querySelector("[data-geocode-select]");
  const query = form?.querySelector('input[name="address"]')?.value.trim();
  if (!form || !query) return;
  status.textContent = t("admin.geocodeSearching");
  status.classList.remove("is-error");
  try {
    geoCandidates = await fetchGeocodeCandidates(query);
    if (!geoCandidates.length) {
      panel.hidden = true;
      status.textContent = t("admin.geocodeNone");
      status.classList.add("is-error");
      return;
    }
    panel.hidden = false;
    status.textContent = geoCandidates.length > 1 ? t("admin.geocodeFoundMany") : t("admin.geocodeFound");
    // A dropdown only makes sense when there is a real choice to make.
    if (geoCandidates.length > 1) {
      select.innerHTML = geoCandidates
        .map((r, i) => `<option value="${i}">${escapeValue(describeGeoResult(r).label)}</option>`)
        .join("");
      select.value = "0";
      choices.hidden = false;
    } else {
      choices.hidden = true;
    }
    applyGeoCandidate(0);
  } catch {
    panel.hidden = true;
    status.textContent = t("admin.geocodeError");
    status.classList.add("is-error");
  }
}

function editPayloadFromForm(form) {
  const formData = new FormData(form);
  const textOrNull = (name) => formData.get(name)?.toString().trim() || null;
  const numberOrNull = (name) => {
    const value = formData.get(name)?.toString().trim();
    return value === "" || value == null || Number.isNaN(Number(value)) ? null : Number(value);
  };
  return {
    name: formData.get("name")?.toString().trim() || "",
    price_label: `${Number(formData.get("price_number")) || 0} EUR`,
    price_number: Number(formData.get("price_number")) || 0,
    guests: Number(formData.get("guests")) || 1,
    address: textOrNull("address"),
    area_es: textOrNull("area_es"),
    area_en: textOrNull("area_en"),
    copy_es: textOrNull("copy_es"),
    copy_en: textOrNull("copy_en"),
    details_es: textOrNull("details_es"),
    details_en: textOrNull("details_en"),
    price_note_es: textOrNull("price_note_es"),
    price_note_en: textOrNull("price_note_en"),
    rating: formData.get("rating") ? Number(formData.get("rating")) : null,
    type: formData.get("type")?.toString() || "apartment",
    address_key: formData.get("address_key")?.toString().trim() || "pedro",
    city: formData.get("city")?.toString().trim().toLowerCase() || "zaragoza",
    lat: Number(formData.get("lat")) || 0,
    lng: Number(formData.get("lng")) || 0,
    amenities: formData.getAll("amenities").map((value) => value.toString()),
    bedrooms: numberOrNull("bedrooms"),
    bathrooms: numberOrNull("bathrooms"),
    size_m2: numberOrNull("size_m2"),
    floor_number: numberOrNull("floor_number"),
    min_stay_months: numberOrNull("min_stay_months"),
    max_stay_months: numberOrNull("max_stay_months"),
    deposit_amount: numberOrNull("deposit_amount"),
    upfront_rent_eur: numberOrNull("upfront_rent_eur"),
    utilities_cap_eur: numberOrNull("utilities_cap_eur"),
    energy_rating: textOrNull("energy_rating"),
    video_url: textOrNull("video_url"),
    beds_es: textOrNull("beds_es"),
    beds_en: textOrNull("beds_en"),
    pets_allowed: formData.has("pets_allowed"),
    smoking_allowed: formData.has("smoking_allowed"),
    couples_allowed: formData.has("couples_allowed"),
    self_checkin: formData.has("self_checkin"),
    is_new: formData.has("is_new"),
    checked: formData.has("checked"),
    deposit_protected: formData.has("deposit_protected"),
    bills_policy: textOrNull("bills_policy") || "included",
    // Keep the legacy boolean in sync for older clients: only an excluded
    // policy means bills are not included (capped still bundles an allowance).
    bills_included: (textOrNull("bills_policy") || "included") !== "excluded",
    is_published: formData.has("is_published")
  };
}

// Downscale to <=1920px wide and re-encode to WebP q80 in the browser before
// upload, mirroring the batch compression run on the existing library. Photos
// (stored as PNG/JPEG) typically shrink ~95%+ with no visible quality loss.
// Returns { blob, ext, contentType }; falls back to the original file whenever
// WebP can't be produced or the result wouldn't actually be smaller.
async function compressImageForUpload(file) {
  const MAX_WIDTH = 1920;
  const QUALITY = 0.8;
  const type = file.type || "";
  // Only re-encode raster photos; leave SVG/GIF and non-images untouched.
  if (!type.startsWith("image/") || type === "image/svg+xml" || type === "image/gif") {
    return { blob: file, ext: null, contentType: type || undefined };
  }
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_WIDTH / bitmap.width); // cap width, never upscale
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", QUALITY));
    // Bail out if the browser can't encode WebP, or it didn't actually help.
    if (!blob || blob.type !== "image/webp" || blob.size >= file.size) {
      return { blob: file, ext: null, contentType: type || undefined };
    }
    return { blob, ext: "webp", contentType: "image/webp" };
  } catch (err) {
    return { blob: file, ext: null, contentType: type || undefined };
  }
}

async function uploadPhotos(files, isFloorplan) {
  const sb = EbrostayBackend.getClient();
  let maxOrder = Math.max(0, ...(row?.property_photos || []).map((photo) => photo.sort_order));
  showStatus("admin.uploading");

  for (const file of files) {
    const compressed = await compressImageForUpload(file);
    let cleanName = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").slice(-60);
    // Match the stored extension to the actual bytes when we re-encoded to WebP.
    if (compressed.ext) cleanName = cleanName.replace(/\.[a-z0-9]+$/i, "") + "." + compressed.ext;
    const path = `${propertyId}/${Date.now()}-${cleanName}`;
    const { error: uploadError } = await sb.storage
      .from("property-photos")
      .upload(path, compressed.blob, { cacheControl: "31536000", contentType: compressed.contentType });
    if (uploadError) {
      showStatus("admin.error");
      return;
    }
    maxOrder += 10;
    const { error: insertError } = await sb.from("property_photos").insert({
      property_id: propertyId,
      storage_path: path,
      sort_order: maxOrder,
      is_floorplan: isFloorplan
    });
    if (insertError) {
      showStatus("admin.error");
      return;
    }
  }

  showStatus("admin.saved");
  await loadProperty();
}

// Tesseract.js is only loaded the first time a scanned PDF or image needs OCR,
// so it never weighs down the common digital-PDF / pasted-text path.
let tesseractLoader = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve();
  if (!tesseractLoader) {
    tesseractLoader = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  return tesseractLoader;
}

async function renderPageToCanvas(page, scale = 2) {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  return canvas;
}

// OCR (Spanish + English) for sources without a text layer: scanned PDFs
// (rendered page by page) and image files. Slow, so pages are capped.
async function ocrImages(sources, onProgress) {
  await loadTesseract();
  const worker = await Tesseract.createWorker("spa+eng");
  let out = "";
  try {
    for (let i = 0; i < sources.length; i += 1) {
      onProgress?.(i + 1, sources.length);
      const { data } = await worker.recognize(sources[i]);
      out += data.text + "\n";
    }
  } finally {
    await worker.terminate();
  }
  return out.trim();
}

// Pull plain text out of an uploaded file. Digital PDFs use pdf.js; scanned
// PDFs and images fall back to OCR; everything else is read as text. Returns
// "" only when nothing readable is found. onProgress reports OCR page numbers.
async function extractTextFromFile(file, onProgress) {
  if (!file) return "";
  const name = (file.name || "").toLowerCase();
  const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
  const isImage = (file.type || "").startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|tiff?)$/.test(name);

  if (isPdf && window.pdfjsLib) {
    try {
      const buffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
      const textPages = Math.min(pdf.numPages, 30);
      let out = "";
      for (let i = 1; i <= textPages; i += 1) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        out += content.items.map((item) => item.str).join(" ") + "\n";
      }
      // A real text layer gives plenty of characters; almost nothing means the
      // PDF is scanned, so render its pages and OCR them instead.
      if (out.replace(/\s/g, "").length >= 20) return out.trim();
      const ocrPages = Math.min(pdf.numPages, 8);
      const canvases = [];
      for (let i = 1; i <= ocrPages; i += 1) {
        canvases.push(await renderPageToCanvas(await pdf.getPage(i)));
      }
      return await ocrImages(canvases, onProgress);
    } catch (error) {
      console.warn("PDF read failed", error);
      return "";
    }
  }

  if (isImage) {
    try {
      return await ocrImages([file], onProgress);
    } catch (error) {
      console.warn("image OCR failed", error);
      return "";
    }
  }

  try {
    return (await file.text()).trim();
  } catch {
    return "";
  }
}

// Turn a pdf.js image object (bitmap or raw pixel data) into a canvas, flattening
// any transparency onto white so floor-plan PNGs don't become black as JPEG.
function imageObjToCanvas(img) {
  const w = img && img.width;
  const h = img && img.height;
  if (!w || !h) return null;
  const raw = document.createElement("canvas");
  raw.width = w;
  raw.height = h;
  const rctx = raw.getContext("2d");
  if (img.bitmap) {
    rctx.drawImage(img.bitmap, 0, 0);
  } else if (img.data) {
    const data = img.data;
    const imageData = rctx.createImageData(w, h);
    const out = imageData.data;
    if (data.length === w * h * 4) {
      out.set(data);
    } else if (data.length === w * h * 3) {
      for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
        out[j] = data[i]; out[j + 1] = data[i + 1]; out[j + 2] = data[i + 2]; out[j + 3] = 255;
      }
    } else if (data.length === w * h) {
      for (let i = 0, j = 0; i < data.length; i += 1, j += 4) {
        out[j] = out[j + 1] = out[j + 2] = data[i]; out[j + 3] = 255;
      }
    } else {
      return null;
    }
    rctx.putImageData(imageData, 0, 0);
  } else {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(raw, 0, 0);
  return canvas;
}

// Heuristic: floor plans are mostly white with thin, low-saturation lines,
// whereas photos are colourful. Used only to pre-select the classification.
function looksLikeFloorplan(canvas) {
  try {
    const size = 64;
    const small = document.createElement("canvas");
    small.width = size;
    small.height = size;
    const ctx = small.getContext("2d");
    ctx.drawImage(canvas, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    let white = 0;
    let satSum = 0;
    const total = size * size;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
      const max = Math.max(r, g, b); const min = Math.min(r, g, b);
      if (max > 235 && min > 225) white += 1;
      satSum += max === 0 ? 0 : (max - min) / max;
    }
    return white / total > 0.55 && satSum / total < 0.12;
  } catch {
    return false;
  }
}

function getImageObj(page, name, timeoutMs = 4000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
    const timer = setTimeout(() => finish(null), timeoutMs);
    try {
      page.objs.get(name, (img) => { clearTimeout(timer); finish(img); });
    } catch {
      clearTimeout(timer);
      finish(null);
    }
  });
}

// Pull the embedded photos / floor plans out of an uploaded file: image XObjects
// from a PDF, or the image file itself. Tiny graphics (logos) are skipped.
async function extractImagesFromFile(file) {
  const results = [];
  const name = (file.name || "").toLowerCase();
  const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
  const isImage = (file.type || "").startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|tiff?)$/.test(name);

  const pushCanvas = (canvas) => {
    if (!canvas) return;
    if (Math.max(canvas.width, canvas.height) < 200) return; // skip logos/icons
    results.push(canvas);
  };

  if (isPdf && window.pdfjsLib) {
    try {
      const buffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
      const pages = Math.min(pdf.numPages, 20);
      const seen = new Set();
      const OPS = pdfjsLib.OPS;
      for (let p = 1; p <= pages && results.length < 24; p += 1) {
        const page = await pdf.getPage(p);
        const ops = await page.getOperatorList();
        for (let i = 0; i < ops.fnArray.length; i += 1) {
          const fn = ops.fnArray[i];
          if (fn === OPS.paintImageXObject || fn === OPS.paintImageXObjectRepeat) {
            const imgName = ops.argsArray[i][0];
            if (typeof imgName !== "string" || seen.has(imgName)) continue;
            seen.add(imgName);
            const img = await getImageObj(page, imgName);
            if (img) pushCanvas(imageObjToCanvas(img));
          }
        }
      }
    } catch (error) {
      console.warn("PDF image extraction failed", error);
    }
  } else if (isImage) {
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d").drawImage(bitmap, 0, 0);
      pushCanvas(canvas);
    } catch (error) {
      console.warn("image load failed", error);
    }
  }

  // Convert each canvas to a JPEG blob + preview URL and pre-classify it.
  const items = [];
  for (const canvas of results) {
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.9));
    if (!blob) continue;
    items.push({
      blob,
      url: URL.createObjectURL(blob),
      classification: looksLikeFloorplan(canvas) ? "floorplan" : "photo"
    });
  }
  return items;
}

// Render the extracted-image review strip: a thumbnail per image with a
// Photo / Floor plan / Skip choice and an "Add images to listing" button.
function renderExtractedImages() {
  if (!extractedImages.length) return "";
  const option = (value, current) => `<option value="${value}" ${current === value ? "selected" : ""}>${t(`admin.ai.img${value.charAt(0).toUpperCase()}${value.slice(1)}`)}</option>`;
  const cards = extractedImages.map((image, index) => `
    <figure class="admin-ai-image">
      <img src="${image.url}" alt="" loading="lazy">
      <select data-img-class="${index}">
        ${option("photo", image.classification)}
        ${option("floorplan", image.classification)}
        ${option("skip", image.classification)}
      </select>
    </figure>
  `).join("");
  return `
    <h4>${t("admin.ai.images")}</h4>
    <p class="admin-hint">${t("admin.ai.imagesHint")}</p>
    <div class="admin-ai-image-grid">${cards}</div>
    <button class="button ghost" type="button" data-ai-add-images>${t("admin.ai.addImages")}</button>
  `;
}

function refreshExtractedImages() {
  const container = propertyEditor.querySelector("[data-ai-images]");
  if (container) container.innerHTML = renderExtractedImages();
}

// Upload the chosen extracted images straight to the listing (storage + the
// property_photos table), respecting each one's photo/floorplan classification.
async function uploadExtractedImages() {
  const chosen = extractedImages.filter((image) => image.classification !== "skip");
  if (!chosen.length) {
    showStatus("admin.ai.noImagesSelected");
    return;
  }
  const sb = EbrostayBackend.getClient();
  showStatus("admin.uploading");
  const photos = row?.property_photos || [];
  let photoOrder = Math.max(0, ...photos.filter((p) => !p.is_floorplan).map((p) => p.sort_order));
  let floorOrder = Math.max(0, ...photos.filter((p) => p.is_floorplan).map((p) => p.sort_order));
  let counter = 0;
  for (const image of chosen) {
    const isFloorplan = image.classification === "floorplan";
    counter += 1;
    const compressed = await compressImageForUpload(image.blob);
    const ext = compressed.ext || "jpg";
    const path = `${propertyId}/${Date.now()}-${counter}-ai.${ext}`;
    const { error: uploadError } = await sb.storage
      .from("property-photos")
      .upload(path, compressed.blob, { contentType: compressed.contentType || "image/jpeg", cacheControl: "31536000" });
    if (uploadError) {
      showStatus("admin.error");
      return;
    }
    const sortOrder = isFloorplan ? (floorOrder += 10) : (photoOrder += 10);
    const { error: insertError } = await sb.from("property_photos").insert({
      property_id: propertyId,
      storage_path: path,
      sort_order: sortOrder,
      is_floorplan: isFloorplan
    });
    if (insertError) {
      showStatus("admin.error");
      return;
    }
  }
  extractedImages.forEach((image) => URL.revokeObjectURL(image.url));
  extractedImages = [];
  showStatus("admin.saved");
  await loadProperty();
}

// Write AI-extracted values into the edit form without saving, so the admin
// reviews them and presses Save changes. Existing values are only overwritten
// when the AI returned something for that field.
function populateFormFromAi(fields) {
  const form = propertyEditor.querySelector("[data-edit-form]");
  if (!form || !fields) return;
  const setValue = (fieldName, value) => {
    const input = form.querySelector(`[name="${fieldName}"]`);
    if (input && value != null && String(value).trim() !== "") input.value = value;
  };
  [
    "name", "area_es", "area_en", "copy_es", "copy_en", "details_es", "details_en",
    "beds_es", "beds_en", "price_note_es", "price_note_en", "city", "address",
    "guests", "bedrooms", "bathrooms", "size_m2", "floor_number", "price_number",
    "deposit_amount", "upfront_rent_eur", "utilities_cap_eur", "min_stay_months", "max_stay_months"
  ].forEach((fieldName) => setValue(fieldName, fields[fieldName]));

  if (fields.type && TYPE_KEYS.includes(fields.type)) setValue("type", fields.type);
  if (fields.energy_rating && ENERGY_RATINGS.includes(fields.energy_rating)) setValue("energy_rating", fields.energy_rating);

  if (Array.isArray(fields.amenities)) {
    fields.amenities.forEach((key) => {
      const box = form.querySelector(`input[name="amenities"][value="${key}"]`);
      if (box) box.checked = true;
    });
  }
}

// Read the structured fields currently in the form, to feed the description writer.
function collectFieldsFromForm() {
  const form = propertyEditor.querySelector("[data-edit-form]");
  if (!form) return {};
  const text = (name) => form.querySelector(`[name="${name}"]`)?.value?.trim() || "";
  const number = (name) => {
    const value = text(name);
    return value === "" || Number.isNaN(Number(value)) ? null : Number(value);
  };
  return {
    type: text("type"),
    area_es: text("area_es"), area_en: text("area_en"),
    address: text("address"), city: text("city"),
    guests: number("guests"), bedrooms: number("bedrooms"), bathrooms: number("bathrooms"),
    size_m2: number("size_m2"), floor_number: number("floor_number"),
    beds_es: text("beds_es"), beds_en: text("beds_en"),
    price_number: number("price_number"),
    min_stay_months: number("min_stay_months"), max_stay_months: number("max_stay_months"),
    energy_rating: text("energy_rating"),
    amenities: [...form.querySelectorAll('input[name="amenities"]:checked')].map((box) => box.value)
  };
}

// Downscale a few extracted photos to data URIs so the description writer can
// actually "see" the home. Skips images the admin marked as skip.
async function imagesToDataUrls(maxCount = 3, maxDim = 800) {
  const candidates = extractedImages.filter((image) => image.classification !== "skip").slice(0, maxCount);
  const urls = [];
  for (const image of candidates) {
    try {
      const bitmap = await createImageBitmap(image.blob);
      const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
      urls.push(canvas.toDataURL("image/jpeg", 0.7));
    } catch {
      /* skip unreadable image */
    }
  }
  return urls;
}

async function runAutofill() {
  const fileInput = propertyEditor.querySelector("[data-ai-file]");
  const pasteEl = propertyEditor.querySelector("[data-ai-paste]");
  const file = fileInput?.files?.[0] || null;
  const pasted = (pasteEl?.value || "").trim();
  let text = "";
  if (file) {
    showStatus("admin.ai.reading");
    // OCR can take a while; report progress per page in the status line.
    const onProgress = (page, total) => {
      clearTimeout(statusTimer);
      adminStatus.hidden = false;
      adminStatus.classList.add("is-toast");
      adminStatus.classList.remove("is-error");
      adminStatus.textContent = `${t("admin.ai.ocr")} ${page}/${total}`;
    };
    text = await extractTextFromFile(file, onProgress);
    if (!text && !pasted) {
      showStatus("admin.ai.noText");
      return;
    }
  }
  if (!text) text = pasted;
  if (!text) {
    showStatus("admin.ai.empty");
    return;
  }
  showStatus("admin.ai.thinking");
  const result = await EbrostayBackend.aiExtractProperty(text);
  if (!result.ok) {
    showStatus(result.code === "ai_not_configured" ? "admin.ai.notConfigured" : "admin.ai.error");
    return;
  }
  populateFormFromAi(result.fields);

  // Also pull any photos / floor plans out of the file for review.
  if (file) {
    showStatus("admin.ai.extractingImages");
    extractedImages.forEach((image) => URL.revokeObjectURL(image.url));
    extractedImages = await extractImagesFromFile(file);
    refreshExtractedImages();
  }

  // If the source had no description text, write one from the known facts and
  // the extracted photos.
  const form = propertyEditor.querySelector("[data-edit-form]");
  const descriptionEmpty = ["copy_es", "copy_en", "details_es", "details_en"]
    .every((name) => !(form?.querySelector(`[name="${name}"]`)?.value || "").trim());
  if (descriptionEmpty) {
    showStatus("admin.ai.writing");
    const images = await imagesToDataUrls(3);
    const generated = await EbrostayBackend.aiGenerateDescription(collectFieldsFromForm(), images);
    if (generated.ok) populateFormFromAi(generated.fields);
  }

  showStatus("admin.ai.filled");
}

// Translate one bilingual field into its counterpart language and write the
// result into the paired input. Used automatically on change and via the ✦ button.
async function translateFromField(sourceEl) {
  if (!sourceEl) return;
  const group = sourceEl.dataset.translateGroup;
  const sourceLang = sourceEl.dataset.translateLang;
  if (!group || !sourceLang) return;
  const targetLang = sourceLang === "es" ? "en" : "es";
  const targetEl = propertyEditor.querySelector(
    `[data-translate-group="${group}"][data-translate-lang="${targetLang}"]`
  );
  const value = sourceEl.value.trim();
  if (!targetEl || !value) return;
  if (sourceEl.dataset.lastTranslated === value) return;
  showStatus("admin.ai.translating");
  const result = await EbrostayBackend.aiTranslateField(value, sourceLang, targetLang, group);
  if (result.ok && result.text) {
    targetEl.value = result.text;
    targetEl.dataset.lastTranslated = result.text;
    sourceEl.dataset.lastTranslated = value;
    hideStatus();
  } else {
    showStatus(result.code === "ai_not_configured" ? "admin.ai.notConfigured" : "admin.ai.error");
  }
}

if (propertyEditor) {
  propertyEditor.addEventListener("click", async (event) => {
    const rtBtn = event.target.closest("[data-rt-cmd]");
    if (rtBtn) {
      const textarea = propertyEditor.querySelector(`textarea[name="${rtBtn.dataset.rtTarget}"]`);
      if (textarea) applyRichCommand(textarea, rtBtn.dataset.rtCmd);
      return;
    }

    if (event.target.closest("[data-ai-autofill]")) {
      await runAutofill();
      return;
    }

    if (event.target.closest("[data-ai-add-images]")) {
      await uploadExtractedImages();
      return;
    }

    const translateBtn = event.target.closest("[data-ai-translate]");
    if (translateBtn) {
      const group = translateBtn.dataset.translateGroup;
      const lang = translateBtn.dataset.translateLang;
      const sourceEl = propertyEditor.querySelector(
        `[data-translate-group="${group}"][data-translate-lang="${lang}"]`
      );
      await translateFromField(sourceEl);
      return;
    }

    if (event.target.closest("[data-geocode]")) {
      await geocodeIntoForm();
      return;
    }

    const moveBtn = event.target.closest("[data-move-photo]");
    if (moveBtn) {
      await movePhotoStep(moveBtn.dataset.movePhoto, Number(moveBtn.dataset.moveDir), moveBtn.dataset.floorplan === "yes");
      return;
    }

    const sb = EbrostayBackend.getClient();
    const blockId = event.target.closest("[data-delete-block]")?.dataset.deleteBlock;
    const deletePhoto = event.target.closest("[data-delete-photo]");

    if (blockId) {
      const { error } = await sb.from("availability_blocks").delete().eq("id", blockId);
      if (error) showStatus("admin.error");
      else await loadProperty();
    }

    if (deletePhoto) {
      await sb.storage.from("property-photos").remove([deletePhoto.dataset.path]);
      const { error } = await sb.from("property_photos").delete().eq("id", deletePhoto.dataset.deletePhoto);
      if (error) showStatus("admin.error");
      else await loadProperty();
    }
  });

  propertyEditor.addEventListener("change", async (event) => {
    const geoSelect = event.target.closest("[data-geocode-select]");
    if (geoSelect) {
      applyGeoCandidate(Number(geoSelect.value));
      return;
    }

    const photoInput = event.target.closest("[data-photo-input]");
    if (photoInput) {
      if (event.target.files?.length) await uploadPhotos([...event.target.files], photoInput.dataset.floorplan === "yes");
      return;
    }

    const aiFile = event.target.closest("[data-ai-file]");
    if (aiFile) {
      const nameEl = propertyEditor.querySelector("[data-ai-filename]");
      if (nameEl) nameEl.textContent = aiFile.files?.[0]?.name || "";
      return;
    }

    const aiToggle = event.target.closest("[data-ai-toggle]");
    if (aiToggle) {
      aiAutoTranslate = aiToggle.checked;
      localStorage.setItem("ebrostay-ai-autotranslate", aiAutoTranslate ? "on" : "off");
      return;
    }

    const imgClass = event.target.closest("[data-img-class]");
    if (imgClass) {
      const image = extractedImages[Number(imgClass.dataset.imgClass)];
      if (image) image.classification = imgClass.value;
      return;
    }

    // Auto-translate a bilingual field into its counterpart when the admin
    // edits it (fires on blur/change), if the toggle is on.
    const pairField = event.target.closest("[data-translate-group]");
    if (pairField && aiAutoTranslate) {
      await translateFromField(pairField);
    }
  });

  propertyEditor.addEventListener("submit", async (event) => {
    event.preventDefault();
    const sb = EbrostayBackend.getClient();
    const formData = new FormData(event.target);

    if (event.target.dataset.editForm) {
      const payload = editPayloadFromForm(event.target);
      // If the saved address hasn't been resolved to coordinates in the UI
      // (admin typed an address but never pressed "Find"), do it silently now
      // so the listing always ends up with a valid map pin. An address the
      // admin already confirmed via the dropdown is left untouched.
      if (payload.address && payload.address !== geoResolvedFor) {
        const best = (await fetchGeocodeCandidates(payload.address))[0];
        if (best) {
          payload.lat = Number(best.lat);
          payload.lng = Number(best.lon);
          geoResolvedFor = payload.address;
        }
      }

      // resolve the owner by email: assign the property and flag the profile
      const ownerInput = formData.get("owner_email")?.toString().trim().toLowerCase() || "";
      if (ownerInput !== (ownerEmail || "").toLowerCase()) {
        if (!ownerInput) {
          payload.owner_id = null;
        } else {
          const { data: ownerProfile } = await sb.from("profiles").select("id").ilike("email", ownerInput).maybeSingle();
          if (!ownerProfile) {
            showStatus("admin.ownerNotFound");
            return;
          }
          payload.owner_id = ownerProfile.id;
          await sb.from("profiles").update({ is_owner: true }).eq("id", ownerProfile.id);
        }
      }

      const { error } = await sb.from("properties").update(payload).eq("id", propertyId);
      if (error) showStatus("admin.error");
      else {
        showStatus("admin.saved");
        await loadProperty();
      }
      return;
    }

    if (event.target.dataset.guestInfoForm) {
      const textOrNull = (name) => formData.get(name)?.toString().trim() || null;
      const { error } = await sb.from("property_guest_info").upsert({
        property_id: propertyId,
        wifi_name: textOrNull("wifi_name"),
        wifi_password: textOrNull("wifi_password"),
        key_pickup: textOrNull("key_pickup"),
        checkin_time: textOrNull("checkin_time"),
        checkout_time: textOrNull("checkout_time"),
        emergency_phone: textOrNull("emergency_phone"),
        notes: textOrNull("notes"),
        updated_at: new Date().toISOString()
      });
      if (error) showStatus("admin.error");
      else {
        showStatus("admin.saved");
        await loadProperty();
      }
      return;
    }

    if (event.target.dataset.blockForm) {
      const startDate = formData.get("startDate");
      const endDate = formData.get("endDate");
      if (!startDate || !endDate || endDate < startDate) {
        showStatus("admin.error");
        return;
      }
      let guestId = null;
      const guestEmail = formData.get("guestEmail")?.toString().trim().toLowerCase();
      if (guestEmail) {
        const { data: guestProfile } = await sb
          .from("profiles")
          .select("id")
          .ilike("email", guestEmail)
          .maybeSingle();
        if (!guestProfile) {
          showStatus("admin.guestNotFound");
          return;
        }
        guestId = guestProfile.id;
      }
      const { error } = await sb.from("availability_blocks").insert({
        property_id: propertyId,
        start_date: startDate,
        end_date: endDate,
        user_id: guestId
      });
      if (error) showStatus("admin.error");
      else {
        showStatus("admin.saved");
        await loadProperty();
      }
      return;
    }

    if (event.target.dataset.availableForm) {
      const { error } = await sb
        .from("properties")
        .update({ available_from: formData.get("availableFrom") || null })
        .eq("id", propertyId);
      if (error) showStatus("admin.error");
      else showStatus("admin.saved");
    }
  });

  // Drag-and-drop reordering for the photo and floor-plan grids.
  propertyEditor.addEventListener("dragstart", (event) => {
    const figure = event.target.closest(".admin-photo[draggable='true']");
    if (!figure) return;
    photoDrag = { id: figure.dataset.photoId, floorplan: figure.dataset.floorplan === "yes" };
    figure.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    try { event.dataTransfer.setData("text/plain", figure.dataset.photoId); } catch { /* not all browsers allow this */ }
  });

  propertyEditor.addEventListener("dragend", (event) => {
    event.target.closest(".admin-photo")?.classList.remove("is-dragging");
    propertyEditor.querySelectorAll(".admin-photo.is-drop-target").forEach((el) => el.classList.remove("is-drop-target"));
    photoDrag = null;
  });

  propertyEditor.addEventListener("dragover", (event) => {
    if (!photoDrag) return;
    const grid = event.target.closest("[data-photo-grid]");
    // only allow dropping within the same group (photos vs floor plans)
    if (!grid || (grid.dataset.photoGrid === "floorplans") !== photoDrag.floorplan) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    propertyEditor.querySelectorAll(".admin-photo.is-drop-target").forEach((el) => el.classList.remove("is-drop-target"));
    const over = event.target.closest(".admin-photo");
    if (over && over.dataset.photoId !== photoDrag.id) over.classList.add("is-drop-target");
  });

  propertyEditor.addEventListener("drop", async (event) => {
    if (!photoDrag) return;
    const grid = event.target.closest("[data-photo-grid]");
    if (!grid || (grid.dataset.photoGrid === "floorplans") !== photoDrag.floorplan) return;
    event.preventDefault();
    const isFloorplan = photoDrag.floorplan;
    const draggedId = photoDrag.id;
    const targetId = event.target.closest(".admin-photo")?.dataset.photoId;
    propertyEditor.querySelectorAll(".admin-photo.is-drop-target").forEach((el) => el.classList.remove("is-drop-target"));
    photoDrag = null;

    const photos = sortedPhotos(isFloorplan);
    const fromIndex = photos.findIndex((photo) => photo.id === draggedId);
    if (fromIndex < 0) return;
    // Dropped on a tile → take that tile's slot; dropped on empty space → go last.
    let toIndex = targetId && targetId !== draggedId
      ? photos.findIndex((photo) => photo.id === targetId)
      : photos.length - 1;
    if (toIndex < 0) toIndex = photos.length - 1;
    await applyPhotoOrder(PhotoOrder.moveItem(photos, fromIndex, toIndex), isFloorplan);
  });
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
  if (row) renderEditor();
}

async function routeUI(user, isAdmin) {
  if (!EbrostayBackend.isConfigured() || !propertyId) {
    window.location.replace("admin.html");
    return;
  }
  if (!user) {
    window.location.replace("admin.html");
    return;
  }
  adminToolbar.hidden = false;
  adminUserEmail.textContent = user.email || "";
  if (!isAdmin) {
    showStatus("admin.notAdmin");
    propertyEditor.innerHTML = "";
    return;
  }
  hideStatus();
  await loadProperty();
}

if (adminLogout) {
  adminLogout.addEventListener("click", async () => {
    await EbrostayBackend.signOut();
    window.location.href = "admin.html";
  });
}

languageButtons.forEach((button) => {
  button.addEventListener("click", () => applyLanguage(button.dataset.lang));
});

const year = document.querySelector("#year");
if (year) year.textContent = new Date().getFullYear();

applyLanguage(currentLanguage);

if (window.EbrostayBackend) {
  let routed = false;
  EbrostayBackend.init({
    onAuthChanged: (user, isAdmin) => {
      // first auth event decides; later refreshes just keep the session alive
      if (routed && user) return;
      routed = true;
      routeUI(user, isAdmin);
    }
  });
}
