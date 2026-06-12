const languageButtons = document.querySelectorAll("[data-lang]");
const adminStatus = document.querySelector("#adminStatus");
const adminLogin = document.querySelector("#adminLogin");
const adminLoginMessage = document.querySelector("#adminLoginMessage");
const adminToolbar = document.querySelector("#adminToolbar");
const adminUserEmail = document.querySelector("#adminUserEmail");
const adminLogout = document.querySelector("#adminLogout");
const adminProperties = document.querySelector("#adminProperties");

let currentLanguage = localStorage.getItem("ebrostay-language") || "es";
let adminRows = [];
let selectedPropertyId = null;

const t = (key) => translations[currentLanguage][key] || translations.es[key] || key;

function formatDate(value) {
  return new Intl.DateTimeFormat(currentLanguage === "es" ? "es-ES" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

// Page-level notices stay inline; everything else floats as a toast so it is
// visible no matter how far down the page the action happened.
const PAGE_STATUS_KEYS = new Set(["admin.notConfigured", "admin.notAdmin"]);
let statusTimer;

function showStatus(key) {
  clearTimeout(statusTimer);
  adminStatus.hidden = false;
  adminStatus.dataset.statusKey = key;
  adminStatus.textContent = t(key);
  adminStatus.classList.toggle("is-toast", !PAGE_STATUS_KEYS.has(key));
  adminStatus.classList.toggle("is-error", key === "admin.error");
  if (key === "admin.saved") statusTimer = setTimeout(hideStatus, 2600);
  if (key === "admin.error") statusTimer = setTimeout(hideStatus, 5000);
}

function hideStatus() {
  adminStatus.hidden = true;
  adminStatus.classList.remove("is-toast", "is-error");
  delete adminStatus.dataset.statusKey;
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
  if (adminRows.length) renderAdmin();
}

async function loadAdminData() {
  const sb = EbrostayBackend.getClient();
  const { data, error } = await sb
    .from("properties")
    .select("*, availability_blocks(id, start_date, end_date), property_photos(id, storage_path, sort_order)")
    .order("id");
  if (error) {
    showStatus("admin.error");
    return;
  }
  adminRows = data || [];
  renderAdmin();
}

const AMENITY_KEYS = ["wifi", "desk", "balcony", "lift", "ac", "heating", "kitchen", "terrace"];
const TYPE_KEYS = ["apartment", "room", "home"];

function escapeValue(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function renderPhotos(row) {
  const photos = (row.property_photos || [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order || (a.storage_path < b.storage_path ? -1 : 1));

  const items = photos.length
    ? photos.map((photo, index) => `
        <figure class="admin-photo">
          <img src="${EbrostayBackend.photoUrl(photo.storage_path)}" alt="" loading="lazy">
          ${index === 0 ? `<span class="admin-photo-cover">${t("admin.cover")}</span>` : ""}
          <div class="admin-photo-actions">
            ${index === 0 ? "" : `<button class="details-button" type="button" data-cover-photo="${photo.id}" data-property="${row.id}">${t("admin.makeCover")}</button>`}
            <button class="details-button danger" type="button" data-delete-photo="${photo.id}" data-path="${escapeValue(photo.storage_path)}">${t("admin.delete")}</button>
          </div>
        </figure>
      `).join("")
    : `<p class="admin-empty-note">${t("admin.noPhotos")}</p>`;

  return `
    <section class="admin-section">
      <div class="admin-section-head">
        <h3>${t("admin.photos")}</h3>
        <label class="admin-upload">
          <span class="button ghost">${t("admin.addPhotos")}</span>
          <input type="file" accept="image/*" multiple hidden data-photo-input="${row.id}">
        </label>
      </div>
      <div class="admin-photo-grid">${items}</div>
    </section>
  `;
}

function renderEditForm(row) {
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
    <details class="admin-edit">
      <summary>${t("admin.editDetails")}</summary>
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
        </fieldset>
        <fieldset class="admin-group">
          <legend>${t("admin.section.price")}</legend>
          ${text("admin.field.priceLabel", "price_label", row.price_label)}
          ${text("admin.field.priceNumber", "price_number", row.price_number, "number")}
          ${text("admin.field.priceNoteEs", "price_note_es", row.price_note_es)}
          ${text("admin.field.priceNoteEn", "price_note_en", row.price_note_en)}
        </fieldset>
        <fieldset class="admin-group">
          <legend>${t("admin.section.textsEs")}</legend>
          ${text("admin.field.areaEs", "area_es", row.area_es)}
          ${area("admin.field.copyEs", "copy_es", row.copy_es)}
          ${area("admin.field.detailsEs", "details_es", row.details_es)}
        </fieldset>
        <fieldset class="admin-group">
          <legend>${t("admin.section.textsEn")}</legend>
          ${text("admin.field.areaEn", "area_en", row.area_en)}
          ${area("admin.field.copyEn", "copy_en", row.copy_en)}
          ${area("admin.field.detailsEn", "details_en", row.details_en)}
        </fieldset>
        <fieldset class="admin-group">
          <legend>${t("admin.section.location")}</legend>
          <div class="admin-wide">
            <span class="admin-label">${t("admin.field.address")}</span>
            <div class="admin-geocode-row">
              <input type="text" data-geocode-input="${row.id}" placeholder="${t("admin.geocodePlaceholder")}">
              <button class="details-button" type="button" data-geocode="${row.id}">${t("admin.geocodeFind")}</button>
            </div>
            <p class="admin-hint" data-geocode-status="${row.id}">${t("admin.geocodeHint")}</p>
          </div>
          ${text("admin.field.city", "city", row.city)}
          ${text("admin.field.addressKey", "address_key", row.address_key)}
          ${text("admin.field.lat", "lat", row.lat, "number")}
          ${text("admin.field.lng", "lng", row.lng, "number")}
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
          ${flag("admin.flag.published", "is_published", row.is_published)}
        </fieldset>
        <button class="button primary" type="submit">${t("admin.saveChanges")}</button>
      </form>
    </details>
  `;
}

function renderAdmin() {
  if (!adminRows.some((row) => row.id === selectedPropertyId)) {
    selectedPropertyId = adminRows[0]?.id || null;
  }

  const openEditors = new Set(
    [...adminProperties.querySelectorAll(".admin-edit[open]")]
      .map((details) => details.closest("[data-property]")?.dataset.property)
      .filter(Boolean)
  );

  const tabs = `
    <nav class="admin-tabs" aria-label="${t("admin.title")}">
      ${adminRows.map((row) => `
        <button class="admin-tab ${row.id === selectedPropertyId ? "is-active" : ""}" type="button" data-tab="${row.id}">
          <span class="admin-tab-dot ${row.is_published ? "is-live" : ""}"></span>${row.name}
        </button>
      `).join("")}
    </nav>
  `;

  adminProperties.innerHTML = tabs + adminRows.map((row) => {
    const blocks = (row.availability_blocks || [])
      .slice()
      .sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
    const blockItems = blocks.length
      ? blocks.map((block) => `
          <li>
            <span>${formatDate(block.start_date)} &ndash; ${formatDate(block.end_date)}</span>
            <button class="details-button danger" type="button" data-delete-block="${block.id}">${t("admin.delete")}</button>
          </li>
        `).join("")
      : `<li class="admin-empty">${t("admin.noBlocks")}</li>`;

    return `
      <section class="admin-card" data-property="${row.id}" ${row.id === selectedPropertyId ? "" : "hidden"}>
        <header class="admin-card-head">
          <div>
            <h2>${row.name}</h2>
            <p class="admin-card-meta">${row.price_label} &middot; ${row.guests} ${t("admin.guestsUnit")}${row.rating ? ` &middot; &#9733; ${row.rating}` : ""}</p>
          </div>
          <span class="admin-chip ${row.is_published ? "is-live" : "is-off"}">${t(row.is_published ? "admin.published" : "admin.unpublished")}</span>
        </header>
        ${renderPhotos(row)}
        ${renderEditForm(row)}
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
            <button class="button primary" type="submit">${t("admin.add")}</button>
          </form>
        </section>
      </section>
    `;
  }).join("");

  openEditors.forEach((propertyId) => {
    adminProperties
      .querySelector(`[data-property="${propertyId}"] .admin-edit`)
      ?.setAttribute("open", "");
  });
}

async function routeUI(user, isAdmin) {
  if (!EbrostayBackend.isConfigured()) {
    showStatus("admin.notConfigured");
    adminLogin.hidden = true;
    adminToolbar.hidden = true;
    adminProperties.innerHTML = "";
    return;
  }

  if (!user) {
    hideStatus();
    adminLogin.hidden = false;
    adminToolbar.hidden = true;
    adminProperties.innerHTML = "";
    adminRows = [];
    return;
  }

  adminLogin.hidden = true;
  adminToolbar.hidden = false;
  adminUserEmail.textContent = user.email || "";

  if (!isAdmin) {
    showStatus("admin.notAdmin");
    adminProperties.innerHTML = "";
    adminRows = [];
    return;
  }

  hideStatus();
  await loadAdminData();
}

if (adminLogin) {
  adminLogin.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(adminLogin);
    adminLoginMessage.className = "auth-message";
    const error = await EbrostayBackend.signIn(
      formData.get("email")?.toString().trim() || "",
      formData.get("password")?.toString() || ""
    );
    if (error) {
      adminLoginMessage.textContent = t("auth.error");
      adminLoginMessage.classList.add("is-error");
    } else {
      adminLogin.reset();
    }
  });
}

if (adminLogout) {
  adminLogout.addEventListener("click", () => EbrostayBackend.signOut());
}

async function uploadPhotos(propertyId, files) {
  const sb = EbrostayBackend.getClient();
  const row = adminRows.find((item) => item.id === propertyId);
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
      sort_order: maxOrder
    });
    if (insertError) {
      showStatus("admin.error");
      return;
    }
  }

  showStatus("admin.saved");
  await loadAdminData();
}

async function geocodeAddress(propertyId) {
  const card = adminProperties.querySelector(`[data-property="${propertyId}"]`);
  const input = card?.querySelector(`[data-geocode-input="${propertyId}"]`);
  const status = card?.querySelector(`[data-geocode-status="${propertyId}"]`);
  const form = card?.querySelector(`[data-edit-form="${propertyId}"]`);
  const query = input?.value.trim();
  if (!card || !form || !query) return;

  status.textContent = t("admin.geocodeSearching");
  const search = async (q) => {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
      { headers: { Accept: "application/json" } }
    );
    const results = await response.json();
    return Array.isArray(results) && results.length ? results[0] : null;
  };

  try {
    // OpenStreetMap often lacks the house number or expects the official
    // street name, so fall back to progressively looser queries
    const cleanup = (value) => value.replace(/\s{2,}/g, " ").replace(/\s+,/g, ",").replace(/^[\s,]+|[\s,]+$/g, "");
    const noNumber = cleanup(query.replace(/\d+/g, " "));
    const noStreetType = cleanup(noNumber.replace(/\b(calle|c\/|avenida|avda\.?|av\.?|paseo|plaza|pza\.?|camino|ronda)\s+(de\s+|del\s+|la\s+)?/gi, ""));
    const candidates = [...new Set([query, noNumber, noStreetType].filter(Boolean))];

    let match = null;
    for (const candidate of candidates) {
      match = await search(candidate);
      if (match) break;
    }
    if (!match) {
      status.textContent = t("admin.geocodeNone");
      return;
    }
    form.querySelector('input[name="lat"]').value = Number(match.lat).toFixed(5);
    form.querySelector('input[name="lng"]').value = Number(match.lon).toFixed(5);
    status.textContent = `${t("admin.geocodeFound")} ${match.display_name}`;
  } catch {
    status.textContent = t("admin.geocodeError");
  }
}

function editPayloadFromForm(form) {
  const formData = new FormData(form);
  const textOrNull = (name) => formData.get(name)?.toString().trim() || null;
  return {
    name: formData.get("name")?.toString().trim() || "",
    price_label: formData.get("price_label")?.toString().trim() || "",
    price_number: Number(formData.get("price_number")) || 0,
    guests: Number(formData.get("guests")) || 1,
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
    is_new: formData.has("is_new"),
    checked: formData.has("checked"),
    deposit_protected: formData.has("deposit_protected"),
    bills_included: formData.has("bills_included"),
    is_published: formData.has("is_published")
  };
}

if (adminProperties) {
  adminProperties.addEventListener("click", async (event) => {
    const tabId = event.target.closest("[data-tab]")?.dataset.tab;
    if (tabId) {
      selectedPropertyId = tabId;
      renderAdmin();
      return;
    }

    const geocodeId = event.target.closest("[data-geocode]")?.dataset.geocode;
    if (geocodeId) {
      await geocodeAddress(geocodeId);
      return;
    }

    const sb = EbrostayBackend.getClient();
    const blockId = event.target.closest("[data-delete-block]")?.dataset.deleteBlock;
    const deletePhoto = event.target.closest("[data-delete-photo]");
    const coverPhoto = event.target.closest("[data-cover-photo]");

    if (blockId) {
      const { error } = await sb.from("availability_blocks").delete().eq("id", blockId);
      if (error) showStatus("admin.error");
      else await loadAdminData();
    }

    if (deletePhoto) {
      await sb.storage.from("property-photos").remove([deletePhoto.dataset.path]);
      const { error } = await sb.from("property_photos").delete().eq("id", deletePhoto.dataset.deletePhoto);
      if (error) showStatus("admin.error");
      else await loadAdminData();
    }

    if (coverPhoto) {
      const row = adminRows.find((item) => item.id === coverPhoto.dataset.property);
      const minOrder = Math.min(0, ...(row?.property_photos || []).map((photo) => photo.sort_order));
      const { error } = await sb
        .from("property_photos")
        .update({ sort_order: minOrder - 10 })
        .eq("id", coverPhoto.dataset.coverPhoto);
      if (error) showStatus("admin.error");
      else await loadAdminData();
    }
  });

  adminProperties.addEventListener("keydown", (event) => {
    const geocodeInput = event.target.closest("[data-geocode-input]");
    if (geocodeInput && event.key === "Enter") {
      event.preventDefault();
      geocodeAddress(geocodeInput.dataset.geocodeInput);
    }
  });

  adminProperties.addEventListener("change", async (event) => {
    const propertyId = event.target.closest("[data-photo-input]")?.dataset.photoInput;
    if (!propertyId || !event.target.files?.length) return;
    await uploadPhotos(propertyId, [...event.target.files]);
  });

  adminProperties.addEventListener("submit", async (event) => {
    event.preventDefault();
    const sb = EbrostayBackend.getClient();
    const blockPropertyId = event.target.dataset.blockForm;
    const availablePropertyId = event.target.dataset.availableForm;
    const editPropertyId = event.target.dataset.editForm;
    const formData = new FormData(event.target);

    if (editPropertyId) {
      const { error } = await sb
        .from("properties")
        .update(editPayloadFromForm(event.target))
        .eq("id", editPropertyId);
      if (error) showStatus("admin.error");
      else {
        showStatus("admin.saved");
        await loadAdminData();
      }
      return;
    }

    if (blockPropertyId) {
      const startDate = formData.get("startDate");
      const endDate = formData.get("endDate");
      if (!startDate || !endDate || endDate < startDate) {
        showStatus("admin.error");
        return;
      }
      const { error } = await sb.from("availability_blocks").insert({
        property_id: blockPropertyId,
        start_date: startDate,
        end_date: endDate
      });
      if (error) showStatus("admin.error");
      else {
        showStatus("admin.saved");
        await loadAdminData();
      }
    }

    if (availablePropertyId) {
      const { error } = await sb
        .from("properties")
        .update({ available_from: formData.get("availableFrom") || null })
        .eq("id", availablePropertyId);
      if (error) showStatus("admin.error");
      else showStatus("admin.saved");
    }
  });
}

languageButtons.forEach((button) => {
  button.addEventListener("click", () => applyLanguage(button.dataset.lang));
});

const year = document.querySelector("#year");
if (year) year.textContent = new Date().getFullYear();

applyLanguage(currentLanguage);

if (window.EbrostayBackend) {
  EbrostayBackend.init({
    onAuthChanged: (user, isAdmin) => routeUI(user, isAdmin)
  });
  if (!EbrostayBackend.isConfigured()) routeUI(null, false);
}
