const form = document.querySelector("#ownerListingForm");
const photoInput = document.querySelector("#ownerPhotos");
const preview = document.querySelector("#ownerPhotoPreview");
const statusEl = document.querySelector("#ownerListingStatus");
const authActions = document.querySelector("#ownerAuthActions");
const languageButtons = document.querySelectorAll("[data-lang]");
let currentLanguage = localStorage.getItem("ebrostay-language") || "es";
let photoItems = [];
let photoUrls = [];

const OWNER_COPY = {
  es: {
    navOwners: "Propietarios",
    portal: "Entrar / ver mis viviendas",
    kicker: "Publica sin llamadas",
    title: "Sube fotos y deja que Ebrostay prepare el primer borrador.",
    lead: "Añade tus fotos, marca servicios como wifi o gastos incluidos y guarda el borrador. Si creas cuenta después, no se pierde nada.",
    photosKicker: "Fotos primero",
    photosTitle: "Enséñanos la vivienda",
    choosePhotos: "Subir fotos",
    photoHint: "Las fotos se guardan en este navegador hasta que termines el alta.",
    name: "Nombre",
    phone: "Teléfono",
    address: "Dirección o zona",
    homeType: "Tipo",
    bedrooms: "Habitaciones",
    bathrooms: "Baños",
    price: "Renta deseada",
    togglesKicker: "Servicios",
    togglesTitle: "Marca lo que ya incluye",
    draftKicker: "Borrador con IA",
    draftTitle: "Descripción inicial",
    generate: "Generar descripción",
    descriptionPlaceholder: "La descripción aparecerá aquí...",
    aiHint: "Si la IA remota no está disponible, generamos un borrador local con tus datos y fotos.",
    save: "Guardar borrador y continuar",
    saveNote: "No te preocupes: guardamos lo que has escrito antes de pedirte iniciar sesión o crear cuenta.",
    saved: "Borrador guardado. Inicia sesión o crea cuenta; no perderás lo que has subido.",
    login: "Iniciar sesión o crear cuenta",
    emailUs: "Enviar por email",
    emptyPhotos: "Sube fotos de salón, dormitorios, cocina, baño y plano si lo tienes.",
    addMorePhotos: "Añadir más fotos",
    localDraft: "Borrador local generado con tus datos y fotos.",
    aiDraft: "Descripción generada por IA. Revísala antes de guardar.",
    toggles: {
      wifi: "Wifi",
      utilities: "Gastos incluidos",
      desk: "Zona de trabajo",
      washer: "Lavadora",
      dishwasher: "Lavavajillas",
      ac: "Aire acondicionado",
      heating: "Calefacción",
      kitchen: "Cocina equipada",
      terrace: "Terraza",
      parking: "Parking",
      lift: "Ascensor",
      selfCheckin: "Autoentrada"
    },
    photoSlots: ["Salón principal", "Dormitorio", "Cocina", "Baño", "Entrada o fachada", "Plano"]
  },
  en: {
    navOwners: "Owners",
    portal: "Sign in / see my homes",
    kicker: "List without calls",
    title: "Upload photos and let Ebrostay prepare the first draft.",
    lead: "Add your photos, mark services like wifi or utilities included, and save the draft. If you create an account after, nothing is lost.",
    photosKicker: "Photos first",
    photosTitle: "Show us the home",
    choosePhotos: "Upload photos",
    photoHint: "Photos are saved in this browser until you finish onboarding.",
    name: "Name",
    phone: "Phone",
    address: "Address or area",
    homeType: "Type",
    bedrooms: "Bedrooms",
    bathrooms: "Bathrooms",
    price: "Target rent",
    togglesKicker: "Services",
    togglesTitle: "Mark what is included",
    draftKicker: "AI draft",
    draftTitle: "Initial description",
    generate: "Generate description",
    descriptionPlaceholder: "The description will appear here...",
    aiHint: "If remote AI is unavailable, we generate a local draft from your details and photos.",
    save: "Save draft and continue",
    saveNote: "Do not worry: we save what you entered before asking you to sign in or create an account.",
    saved: "Draft saved. Sign in or create an account; you will not lose what you uploaded.",
    login: "Sign in or create account",
    emailUs: "Send by email",
    emptyPhotos: "Upload living room, bedroom, kitchen, bathroom and floor plan photos if you have them.",
    addMorePhotos: "Add more photos",
    localDraft: "Local draft generated from your details and photos.",
    aiDraft: "AI description generated. Review it before saving.",
    toggles: {
      wifi: "Wifi",
      utilities: "Utilities included",
      desk: "Work area",
      washer: "Washer",
      dishwasher: "Dishwasher",
      ac: "Air conditioning",
      heating: "Heating",
      kitchen: "Equipped kitchen",
      terrace: "Terrace",
      parking: "Parking",
      lift: "Lift",
      selfCheckin: "Self check-in"
    },
    photoSlots: ["Main living room", "Bedroom", "Kitchen", "Bathroom", "Entrance or facade", "Floor plan"]
  }
};

const c = (key) => OWNER_COPY[currentLanguage]?.[key] || OWNER_COPY.es[key] || key;
const toggleKeys = ["wifi", "utilities", "desk", "washer", "dishwasher", "ac", "heating", "kitchen", "terrace", "parking", "lift", "selfCheckin"];

function photoSlotLabels() {
  return OWNER_COPY[currentLanguage]?.photoSlots || OWNER_COPY.es.photoSlots;
}

function photoPlaceholder(label, index, addMore = false) {
  return `
    <button class="owner-photo-slot${addMore ? " is-add-more" : ""}" type="button" data-photo-slot="${index}">
      <span class="owner-photo-slot-icon">+</span>
      <strong>${label}</strong>
      <small>${addMore ? c("addMorePhotos") : c("emptyPhotos")}</small>
    </button>
  `;
}

function dbOpen() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("ebrostay-owner-listing-draft", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("photos", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function savePhotos(files) {
  const db = await dbOpen();
  const tx = db.transaction("photos", "readwrite");
  const store = tx.objectStore("photos");
  await new Promise((resolve) => { store.clear().onsuccess = resolve; });
  let index = 0;
  for (const file of files) {
    store.put({ id: String(index++), name: file.name, type: file.type, blob: file, ts: Date.now() });
  }
  await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  db.close();
}

async function loadPhotos() {
  try {
    const db = await dbOpen();
    const tx = db.transaction("photos", "readonly");
    const request = tx.objectStore("photos").getAll();
    const rows = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return rows;
  } catch {
    return [];
  }
}

function revokePhotoUrls() {
  photoUrls.forEach((url) => URL.revokeObjectURL(url));
  photoUrls = [];
}

function renderPhotos() {
  revokePhotoUrls();
  if (!preview) return;
  if (!photoItems.length) {
    preview.innerHTML = photoSlotLabels().map((label, index) => photoPlaceholder(label, index)).join("");
    return;
  }
  const filled = photoItems.map((item, index) => {
    const url = URL.createObjectURL(item.blob);
    photoUrls.push(url);
    const label = photoSlotLabels()[index] || item.name;
    return `<figure><img src="${url}" alt=""><figcaption>${index + 1}. ${label}</figcaption></figure>`;
  }).join("");
  const remaining = photoSlotLabels()
    .slice(photoItems.length)
    .map((label, index) => photoPlaceholder(label, photoItems.length + index, true))
    .join("");
  preview.innerHTML = filled + remaining;
}

function fields() {
  const data = new FormData(form);
  return Object.fromEntries([...data.entries()].map(([key, value]) => [key, String(value).trim()]));
}

function selectedToggles() {
  return [...form.querySelectorAll('[name="amenities"]:checked')].map((box) => box.value);
}

function saveDraft(showStatus = false) {
  const draft = { fields: fields(), amenities: selectedToggles(), updatedAt: new Date().toISOString(), photoCount: photoItems.length };
  localStorage.setItem("ebrostay-owner-listing-draft", JSON.stringify(draft));
  if (showStatus && statusEl) statusEl.textContent = c("saved");
  return draft;
}

function loadDraft() {
  let draft = null;
  try { draft = JSON.parse(localStorage.getItem("ebrostay-owner-listing-draft") || "null"); } catch { return; }
  if (!draft) return;
  Object.entries(draft.fields || {}).forEach(([name, value]) => {
    const el = form.elements[name];
    if (el && typeof el.value === "string") el.value = value;
  });
  (draft.amenities || []).forEach((key) => {
    const box = form.querySelector(`[name="amenities"][value="${key}"]`);
    if (box) box.checked = true;
  });
}

function renderToggles() {
  const wrap = document.querySelector("#ownerToggles");
  if (!wrap) return;
  wrap.innerHTML = toggleKeys.map((key) => `
    <label class="owner-toggle"><input type="checkbox" name="amenities" value="${key}"><span>${c("toggles")[key]}</span></label>
  `).join("");
}

function localDescription() {
  const f = fields();
  const amenities = selectedToggles().map((key) => c("toggles")[key].toLowerCase());
  if (currentLanguage === "es") {
    return `Vivienda ${f.type || "amueblada"} en ${f.address || "Zaragoza"}, preparada para estancias de media duración con Ebrostay. Cuenta con ${f.bedrooms || "varias"} habitaciones y ${f.bathrooms || "baño completo"}; las fotos subidas (${photoItems.length}) servirán para preparar un anuncio visual y verificado. Servicios destacados: ${amenities.join(", ") || "wifi, equipamiento esencial y soporte durante la estancia"}. Renta objetivo: ${f.price ? `${f.price} EUR/mes` : "por definir"}.`;
  }
  return `Furnished ${f.type || "home"} in ${f.address || "Zaragoza"}, prepared for mid-stay rentals with Ebrostay. It has ${f.bedrooms || "several"} bedrooms and ${f.bathrooms || "a full bathroom"}; the uploaded photos (${photoItems.length}) will help prepare a verified visual listing. Highlights: ${amenities.join(", ") || "wifi, essential equipment and support during the stay"}. Target rent: ${f.price ? `${f.price} EUR/month` : "to be defined"}.`;
}

async function imageDataUrls(maxCount = 3) {
  const out = [];
  for (const item of photoItems.slice(0, maxCount)) {
    const bitmap = await createImageBitmap(item.blob);
    const scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    out.push(canvas.toDataURL("image/jpeg", 0.72));
  }
  return out;
}

async function generateDescription() {
  saveDraft();
  const description = form.elements.description;
  if (statusEl) statusEl.textContent = c("aiHint");
  if (window.EbrostayBackend?.isConfigured()) {
    const f = fields();
    const result = await EbrostayBackend.aiGenerateDescription({
      type: f.type,
      address: f.address,
      bedrooms: Number(f.bedrooms) || null,
      bathrooms: Number(f.bathrooms) || null,
      price_number: Number(f.price) || null,
      amenities: selectedToggles()
    }, await imageDataUrls());
    const text = result.fields?.details_es || result.fields?.copy_es || result.fields?.details_en || result.fields?.copy_en;
    if (result.ok && text) {
      description.value = text;
      if (statusEl) statusEl.textContent = c("aiDraft");
      saveDraft();
      return;
    }
  }
  description.value = localDescription();
  if (statusEl) statusEl.textContent = c("localDraft");
  saveDraft();
}

function applyLanguage(language) {
  currentLanguage = OWNER_COPY[language] ? language : "es";
  localStorage.setItem("ebrostay-language", currentLanguage);
  document.documentElement.lang = currentLanguage;
  document.querySelectorAll("[data-owner-i18n]").forEach((el) => { el.textContent = c(el.dataset.ownerI18n); });
  document.querySelectorAll("[data-owner-i18n-attr]").forEach((el) => {
    el.dataset.ownerI18nAttr.split(";").forEach((pair) => {
      const [attr, key] = pair.split(":");
      if (attr && key) el.setAttribute(attr, c(key));
    });
  });
  languageButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.lang === currentLanguage));
  renderToggles();
  loadDraft();
}

photoInput?.addEventListener("change", async () => {
  photoItems = [...(photoInput.files || [])].map((file, index) => ({ id: String(index), name: file.name, type: file.type, blob: file }));
  await savePhotos(photoItems.map((item) => item.blob));
  renderPhotos();
  saveDraft();
});

preview?.addEventListener("click", (event) => {
  if (!event.target.closest("[data-photo-slot]")) return;
  photoInput?.click();
});

document.querySelector("#generateOwnerDescription")?.addEventListener("click", generateDescription);
form?.addEventListener("input", () => saveDraft());
form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const draft = saveDraft(true);
  const f = fields();
  if (window.EbrostayBackend?.isConfigured()) {
    await EbrostayBackend.submitOwnerLead({
      name: f.name,
      email: f.email,
      phone: f.phone,
      units: "1",
      city: f.address,
      message: `${f.description || ""}\n\nAmenities: ${draft.amenities.join(", ")}\nPhotos saved locally: ${draft.photoCount}`
    });
  }
  authActions.hidden = false;
});

languageButtons.forEach((button) => button.addEventListener("click", () => applyLanguage(button.dataset.lang)));
document.querySelector("#year").textContent = new Date().getFullYear();

(async function boot() {
  applyLanguage(currentLanguage);
  loadDraft();
  photoItems = await loadPhotos();
  renderPhotos();
  if (window.EbrostayBackend?.isConfigured()) EbrostayBackend.init({});
})();
