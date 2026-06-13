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
  const isError = key === "admin.error" || key === "admin.guestNotFound" || key === "admin.geocodeNone" || key === "admin.ownerNotFound";
  adminStatus.classList.toggle("is-error", isError);
  if (key === "admin.saved") statusTimer = setTimeout(hideStatus, 2600);
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

function renderPhotoSection(isFloorplan) {
  const photos = sortedPhotos(isFloorplan);
  const items = photos.length
    ? photos.map((photo, index) => `
        <figure class="admin-photo">
          <img src="${EbrostayBackend.photoUrl(photo.storage_path)}" alt="" loading="lazy">
          ${!isFloorplan && index === 0 ? `<span class="admin-photo-cover">${t("admin.cover")}</span>` : ""}
          <div class="admin-photo-actions">
            ${isFloorplan || index === 0 ? "" : `<button class="details-button" type="button" data-cover-photo="${photo.id}">${t("admin.makeCover")}</button>`}
            <button class="details-button danger" type="button" data-delete-photo="${photo.id}" data-path="${escapeValue(photo.storage_path)}">${t("admin.delete")}</button>
          </div>
        </figure>
      `).join("")
    : `<p class="admin-empty-note">${t(isFloorplan ? "admin.noFloorplans" : "admin.noPhotos")}</p>`;

  return `
    <section class="admin-section">
      <div class="admin-section-head">
        <h3>${t(isFloorplan ? "admin.floorplans" : "admin.photos")}</h3>
        <label class="admin-upload">
          <span class="button ghost">${t(isFloorplan ? "admin.addFloorplans" : "admin.addPhotos")}</span>
          <input type="file" accept="image/*" multiple hidden data-photo-input="${row.id}" data-floorplan="${isFloorplan ? "yes" : "no"}">
        </label>
      </div>
      ${isFloorplan ? `<p class="admin-hint">${t("admin.floorplansCopy")}</p>` : ""}
      <div class="admin-photo-grid">${items}</div>
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
  const area = (labelKey, name, value) => `
    <label class="admin-wide">
      <span>${t(labelKey)}</span>
      <textarea name="${name}" rows="3">${escapeValue(value)}</textarea>
    </label>
  `;
  const flag = (labelKey, name, checked) => `
    <label class="admin-flag"><input type="checkbox" name="${name}" ${checked ? "checked" : ""}> <span>${t(labelKey)}</span></label>
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
        ${text("admin.field.priceNoteEs", "price_note_es", row.price_note_es)}
        ${text("admin.field.priceNoteEn", "price_note_en", row.price_note_en)}
      </fieldset>
      <fieldset class="admin-group">
        <legend>${t("admin.section.conditions")}</legend>
        ${text("admin.field.minStay", "min_stay_months", row.min_stay_months, "number")}
        ${text("admin.field.maxStay", "max_stay_months", row.max_stay_months, "number")}
        ${text("admin.field.deposit", "deposit_amount", row.deposit_amount, "number")}
        ${text("admin.field.upfront", "upfront_rent_eur", row.upfront_rent_eur, "number")}
        ${text("admin.field.utilitiesCap", "utilities_cap_eur", row.utilities_cap_eur, "number")}
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
        ${text("admin.field.areaEs", "area_es", row.area_es)}
        ${area("admin.field.copyEs", "copy_es", row.copy_es)}
        ${area("admin.field.detailsEs", "details_es", row.details_es)}
        ${text("admin.field.bedsEs", "beds_es", row.beds_es)}
      </fieldset>
      <fieldset class="admin-group">
        <legend>${t("admin.section.textsEn")}</legend>
        ${text("admin.field.areaEn", "area_en", row.area_en)}
        ${area("admin.field.copyEn", "copy_en", row.copy_en)}
        ${area("admin.field.detailsEn", "details_en", row.details_en)}
        ${text("admin.field.bedsEn", "beds_en", row.beds_en)}
      </fieldset>
      <fieldset class="admin-group">
        <legend>${t("admin.section.location")}</legend>
        <div class="admin-wide">
          <label>
            <span>${t("admin.field.addressFull")}</span>
            <input name="address" type="text" value="${escapeValue(row.address)}" placeholder="${t("admin.geocodePlaceholder")}">
          </label>
          <p class="admin-hint" data-geocode-status="${row.id}">${t("admin.addressHint")}</p>
          <button class="details-button" type="button" data-geocode="${row.id}">${t("admin.geocodeFind")}</button>
        </div>
        ${text("admin.field.city", "city", row.city)}
        ${text("admin.field.addressKey", "address_key", row.address_key)}
        ${text("admin.field.lat", "lat", row.lat, "number")}
        ${text("admin.field.lng", "lng", row.lng, "number")}
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
        ${flag("admin.flag.bills", "bills_included", row.bills_included)}
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

async function geocode(query) {
  const search = async (q) => {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
      { headers: { Accept: "application/json" } }
    );
    const results = await response.json();
    return Array.isArray(results) && results.length ? results[0] : null;
  };
  // OpenStreetMap often lacks the house number or expects the official
  // street name, so fall back to progressively looser queries
  const cleanup = (value) => value.replace(/\s{2,}/g, " ").replace(/\s+,/g, ",").replace(/^[\s,]+|[\s,]+$/g, "");
  const withCity = /zaragoza/i.test(query) ? query : `${query}, Zaragoza`;
  const noNumber = cleanup(withCity.replace(/\d+/g, " "));
  const noStreetType = cleanup(noNumber.replace(/\b(calle|c\/|avenida|avda\.?|av\.?|paseo|plaza|pza\.?|camino|ronda)\s+(de\s+|del\s+|la\s+)?/gi, ""));
  const candidates = [...new Set([withCity, noNumber, noStreetType].filter(Boolean))];
  for (const candidate of candidates) {
    const match = await search(candidate);
    if (match) return match;
  }
  return null;
}

async function geocodeIntoForm() {
  const form = propertyEditor.querySelector("[data-edit-form]");
  const status = propertyEditor.querySelector("[data-geocode-status]");
  const query = form?.querySelector('input[name="address"]')?.value.trim();
  if (!form || !query) return null;
  status.textContent = t("admin.geocodeSearching");
  try {
    const match = await geocode(query);
    if (!match) {
      status.textContent = t("admin.geocodeNone");
      return null;
    }
    form.querySelector('input[name="lat"]').value = Number(match.lat).toFixed(5);
    form.querySelector('input[name="lng"]').value = Number(match.lon).toFixed(5);
    status.textContent = `${t("admin.geocodeFound")} ${match.display_name}`;
    return match;
  } catch {
    status.textContent = t("admin.geocodeError");
    return null;
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
    bills_included: formData.has("bills_included"),
    is_published: formData.has("is_published")
  };
}

async function uploadPhotos(files, isFloorplan) {
  const sb = EbrostayBackend.getClient();
  let maxOrder = Math.max(0, ...(row?.property_photos || []).map((photo) => photo.sort_order));
  showStatus("admin.uploading");

  for (const file of files) {
    const cleanName = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").slice(-60);
    const path = `${propertyId}/${Date.now()}-${cleanName}`;
    const { error: uploadError } = await sb.storage.from("property-photos").upload(path, file);
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

if (propertyEditor) {
  propertyEditor.addEventListener("click", async (event) => {
    if (event.target.closest("[data-geocode]")) {
      await geocodeIntoForm();
      return;
    }

    const sb = EbrostayBackend.getClient();
    const blockId = event.target.closest("[data-delete-block]")?.dataset.deleteBlock;
    const deletePhoto = event.target.closest("[data-delete-photo]");
    const coverPhoto = event.target.closest("[data-cover-photo]");

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

    if (coverPhoto) {
      const minOrder = Math.min(0, ...(row?.property_photos || []).map((photo) => photo.sort_order));
      const { error } = await sb
        .from("property_photos")
        .update({ sort_order: minOrder - 10 })
        .eq("id", coverPhoto.dataset.coverPhoto);
      if (error) showStatus("admin.error");
      else await loadProperty();
    }
  });

  propertyEditor.addEventListener("change", async (event) => {
    const input = event.target.closest("[data-photo-input]");
    if (!input || !event.target.files?.length) return;
    await uploadPhotos([...event.target.files], input.dataset.floorplan === "yes");
  });

  propertyEditor.addEventListener("submit", async (event) => {
    event.preventDefault();
    const sb = EbrostayBackend.getClient();
    const formData = new FormData(event.target);

    if (event.target.dataset.editForm) {
      const payload = editPayloadFromForm(event.target);
      // when the address changed, derive fresh coordinates from it
      if (payload.address && payload.address !== (row.address || null)) {
        await geocodeIntoForm();
        payload.lat = Number(event.target.querySelector('input[name="lat"]').value) || payload.lat;
        payload.lng = Number(event.target.querySelector('input[name="lng"]').value) || payload.lng;
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
