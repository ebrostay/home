(function () {
  const form = document.querySelector("#ownerListingForm");
  if (!form) return;

  const DRAFT_KEY = "ebrostay-owner-listing-draft";
  const status = document.querySelector("[data-owner-draft-status]");
  const summary = document.querySelector("[data-owner-photo-summary]");
  const description = form.querySelector("[data-owner-description]");
  const photoGrid = document.querySelector(".owner-photo-grid");
  const docsButton = document.querySelector("[data-owner-docs]");
  const addPhotoButton = document.querySelector("[data-owner-add-photo]");
  const loginButtons = document.querySelectorAll("[data-owner-login]");
  const photoGroups = {};
  let pendingPublish = false;
  let restoredPublishId = "";
  let extraSlotCount = 0;
  let lastPublishedRecord = null;
  let descriptionVariantIndex = 0;

  const serviceKeys = {
    wifi: "amenity.wifi",
    desk: "amenity.desk",
    lift: "amenity.lift",
    ac: "amenity.ac",
    heating: "amenity.heating",
    kitchen: "amenity.kitchen",
    bills: "badge.bills",
    deposit: "badge.deposit"
  };

  const zaragozaLocationHints = [
    { match: /movera/i, postcode: "50194", neighborhood: "Movera", lat: 41.64929, lng: -0.82209 },
    { match: /pedro|universidad|catolico/i, postcode: "50009", neighborhood: "Universidad", lat: 41.65393, lng: -0.90783 },
    { match: /centro|casco/i, postcode: "50001", neighborhood: "Centro", lat: 41.653, lng: -0.881 },
    { match: /delicias/i, postcode: "50017", neighborhood: "Delicias", lat: 41.645, lng: -0.908 },
    { match: /romareda/i, postcode: "50009", neighborhood: "Romareda", lat: 41.638, lng: -0.901 },
    { match: /actur|goya/i, postcode: "50018", neighborhood: "Actur-Rey Fernando", lat: 41.674, lng: -0.892 },
    { match: /fuentes/i, postcode: "50002", neighborhood: "Las Fuentes", lat: 41.646, lng: -0.864 },
    { match: /torrero/i, postcode: "50007", neighborhood: "Torrero-La Paz", lat: 41.631, lng: -0.879 }
  ];

  function lang() {
    return document.documentElement.lang === "en" ? "en" : "es";
  }

  function tr(key) {
    try {
      return translations[lang()]?.[key] || translations.es?.[key] || key;
    } catch {
      return key;
    }
  }

  function field(name) {
    return form.elements[name];
  }

  function ownerUser() {
    return window.EbrostayBackend?.getUser?.() || null;
  }

  function photoInputs() {
    return Array.from(document.querySelectorAll("[data-owner-photo]"));
  }

  function selectedServiceKeys() {
    return Array.from(form.querySelectorAll('input[name="services"]:checked')).map((input) => input.value);
  }

  function selectedServices() {
    return selectedServiceKeys().map((key) => tr(serviceKeys[key] || key));
  }

  function roomLabelForInput(input) {
    return input.dataset.roomName || tr(input.dataset.roomLabel || "ownerPost.roomExtra");
  }

  function flattenedPhotos() {
    return Object.values(photoGroups).flat().filter((photo) => photo?.dataUrl);
  }

  function roomSummaryItems() {
    return photoInputs()
      .map((input) => {
        const group = photoGroups[input.dataset.ownerPhoto] || [];
        if (!group.length) return "";
        return group.length > 1 ? `${roomLabelForInput(input)} (${group.length})` : roomLabelForInput(input);
      })
      .filter(Boolean);
  }

  function draftSnapshot() {
    return {
      title: field("title")?.value || "",
      address: field("address")?.value || "",
      price: field("price")?.value || "",
      available: field("available")?.value || "",
      bedrooms: field("bedrooms")?.value || "",
      bathrooms: field("bathrooms")?.value || "",
      capacity: field("capacity")?.value || "",
      type: field("type")?.value || "apartment",
      services: selectedServiceKeys(),
      description: description?.value || "",
      photos: photoGroups,
      publishedId: restoredPublishId
    };
  }

  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draftSnapshot()));
    } catch {
      /* Large photo drafts can exceed storage; the visible draft still works. */
    }
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, type: file.type, dataUrl: reader.result });
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  function setSlotPreview(input) {
    const slot = input.closest(".owner-photo-slot");
    const group = photoGroups[input.dataset.ownerPhoto] || [];
    if (!slot || !group.length) return;
    slot.style.setProperty("--owner-photo-url", `url("${group[0].dataUrl}")`);
    slot.classList.add("has-photo");
    slot.dataset.fileName = group.length > 1 ? `${group.length} photos` : group[0].name;
  }

  function createExtraSlot(label) {
    if (!photoGrid) return null;
    extraSlotCount += 1;
    const key = `extra-${Date.now().toString(36)}-${extraSlotCount}`;
    const slot = document.createElement("label");
    slot.className = "owner-photo-slot";
    slot.innerHTML = `
      <input type="file" accept="image/*" multiple data-owner-photo="${key}" data-room-label="ownerPost.roomExtra">
      <span class="owner-photo-plus" aria-hidden="true">+</span>
      <span></span>
    `;
    const labelText = label || `${tr("ownerPost.roomExtra")} ${extraSlotCount}`;
    slot.querySelector("span:last-child").textContent = labelText;
    const input = slot.querySelector("input");
    input.dataset.roomName = labelText;
    photoGrid.appendChild(slot);
    return input;
  }

  function restorePhotoSlots(draft) {
    if (!draft?.photos) return;
    Object.entries(draft.photos).forEach(([key, photos]) => {
      if (!Array.isArray(photos) || !photos.length) return;
      let input = document.querySelector(`[data-owner-photo="${key}"]`);
      if (!input) input = createExtraSlot(photos[0]?.label || "");
      if (!input) return;
      photoGroups[input.dataset.ownerPhoto] = photos;
      setSlotPreview(input);
    });
  }

  function restoreDraft() {
    let draft = null;
    try {
      draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    } catch {
      draft = null;
    }
    if (!draft) return;
    ["title", "address", "price", "available", "bedrooms", "bathrooms", "capacity", "type"].forEach((name) => {
      if (field(name) && draft[name] != null) field(name).value = draft[name];
    });
    if (description && draft.description) {
      description.value = draft.description;
      description.dataset.generated = "true";
    }
    form.querySelectorAll('input[name="services"]').forEach((input) => {
      input.checked = Array.isArray(draft.services) && draft.services.includes(input.value);
    });
    restoredPublishId = draft.publishedId || "";
    restorePhotoSlots(draft);
  }

  function ensureTitle() {
    const title = field("title");
    if (!title || (title.value.trim() && title.dataset.generated !== "true")) return;
    const address = field("address")?.value.trim();
    title.value = lang() === "en"
      ? (address ? `Furnished flat in ${address}` : "Furnished flat in Zaragoza")
      : (address ? `Piso amueblado en ${address}` : "Piso amueblado en Zaragoza");
    title.dataset.generated = "true";
  }

  function descriptionFacts() {
    const address = field("address")?.value.trim();
    const price = field("price")?.value.trim();
    const bedrooms = field("bedrooms")?.value.trim();
    const bathrooms = field("bathrooms")?.value.trim();
    const capacity = field("capacity")?.value.trim();
    const available = field("available")?.value.trim();
    const services = selectedServices();
    const rooms = roomSummaryItems();
    const photoNames = flattenedPhotos().map((photo) => photo.name).filter(Boolean).slice(0, 6);

    return { address, price, bedrooms, bathrooms, capacity, available, services, rooms, photoNames };
  }

  function generatedDescription(variant = 0) {
    const { address, price, bedrooms, bathrooms, capacity, available, services, rooms, photoNames } = descriptionFacts();
    const pickedVariant = Math.abs(Number(variant) || 0) % 3;

    if (lang() === "en") {
      const variants = [
        [
        `${address ? `Furnished mid-stay home in ${address}` : "Furnished mid-stay home in Zaragoza"}, prepared for verified tenants and managed by Ebrostay.`,
        bedrooms || bathrooms || capacity
          ? `Layout: ${bedrooms || "0"} bedrooms, ${bathrooms || "0"} bathrooms, and capacity for up to ${capacity || "1"} people.`
          : "Layout details will be completed from the uploaded photos and owner notes.",
        services.length ? `Included highlights: ${services.join(", ")}.` : "Add services to complete the listing highlights.",
        rooms.length ? `Photos received for: ${rooms.join(", ")}.` : "Suggested photos are recommended, but you can publish without completing every slot.",
        photoNames.length ? `Uploaded files reviewed: ${photoNames.join(", ")}.` : "",
        price ? `Suggested monthly price: ${price} EUR/month.` : "Add a monthly price to prepare the booking card.",
        available ? `Available from ${available}.` : "Add the available-from date before publishing."
        ],
        [
          `${address ? `This furnished home in ${address}` : "This furnished home in Zaragoza"} is ready for medium-length stays and will be presented under Ebrostay's verified rental process.`,
          bedrooms || bathrooms || capacity
            ? `The draft advertises ${bedrooms || "0"} bedrooms, ${bathrooms || "0"} bathrooms, and space for up to ${capacity || "1"} guests.`
            : "The room distribution can be refined once more photos or owner notes are added.",
          services.length ? `Strong selling points: ${services.join(", ")}.` : "Select services to make the value proposition clearer.",
          rooms.length ? `Current photo coverage includes ${rooms.join(", ")}.` : "The six suggested photo types are helpful for trust, but they are not required to publish.",
          price ? `The listing is being prepared at ${price} EUR per month.` : "Add the monthly price so the customer-facing card is complete.",
          available ? `Move-in can be offered from ${available}.` : "The available-from date is still pending."
        ],
        [
          `${address ? `Ebrostay can publish this ${address} home` : "Ebrostay can publish this Zaragoza home"} as a furnished, managed option for professionals and relocating teams.`,
          bedrooms || bathrooms || capacity
            ? `Key facts: ${bedrooms || "0"} bedrooms, ${bathrooms || "0"} bathrooms, maximum capacity ${capacity || "1"}.`
            : "Key facts will become sharper as the owner completes the room details.",
          services.length ? `The home should stand out for ${services.join(", ")}.` : "Add amenities and conditions to improve search confidence.",
          rooms.length ? `Uploaded photo categories: ${rooms.join(", ")}.` : "More photos can be added later to improve consistency and visibility.",
          photoNames.length ? `Files considered: ${photoNames.join(", ")}.` : "",
          price ? `Recommended published rent: ${price} EUR/month.` : "Monthly rent is still missing.",
          available ? `Availability starts on ${available}.` : "Availability should be added before final publication."
        ]
      ];
      return variants[pickedVariant].filter(Boolean).join("\n");
    }

    const variants = [
      [
        `${address ? `Vivienda amueblada de media estancia en ${address}` : "Vivienda amueblada de media estancia en Zaragoza"}, preparada para inquilinos verificados y gestionada por Ebrostay.`,
        bedrooms || bathrooms || capacity
          ? `Distribucion: ${bedrooms || "0"} dormitorios, ${bathrooms || "0"} banos y capacidad para hasta ${capacity || "1"} personas.`
          : "La distribucion se completara con las fotos y notas del propietario.",
        services.length ? `Incluye: ${services.join(", ")}.` : "Anade servicios para completar los puntos destacados del anuncio.",
        rooms.length ? `Fotos recibidas de: ${rooms.join(", ")}.` : "Las fotos sugeridas son recomendables, pero puedes publicar sin completar todos los espacios.",
        photoNames.length ? `Archivos revisados: ${photoNames.join(", ")}.` : "",
        price ? `Precio mensual sugerido: ${price} EUR/mes.` : "Anade el precio mensual para preparar la tarjeta de reserva.",
        available ? `Disponible desde ${available}.` : "Anade la fecha de disponibilidad antes de publicar."
      ],
      [
        `${address ? `Este piso amueblado en ${address}` : "Este piso amueblado en Zaragoza"} esta preparado para estancias de media duracion y para el proceso verificado de Ebrostay.`,
        bedrooms || bathrooms || capacity
          ? `El borrador presenta ${bedrooms || "0"} dormitorios, ${bathrooms || "0"} banos y capacidad maxima para ${capacity || "1"} personas.`
          : "La distribucion puede completarse en cuanto se anadan mas fotos o notas del propietario.",
        services.length ? `Puntos fuertes del anuncio: ${services.join(", ")}.` : "Selecciona servicios para reforzar la propuesta de valor.",
        rooms.length ? `La cobertura fotografica actual incluye ${rooms.join(", ")}.` : "Las seis fotos sugeridas ayudan a generar confianza, pero no son obligatorias para publicar.",
        price ? `El anuncio se esta preparando con un precio de ${price} EUR/mes.` : "Falta anadir el precio mensual para completar la ficha.",
        available ? `Entrada disponible desde ${available}.` : "La fecha de disponibilidad sigue pendiente."
      ],
      [
        `${address ? `Ebrostay puede publicar esta vivienda en ${address}` : "Ebrostay puede publicar esta vivienda en Zaragoza"} como una opcion amueblada y gestionada para profesionales y equipos desplazados.`,
        bedrooms || bathrooms || capacity
          ? `Datos clave: ${bedrooms || "0"} dormitorios, ${bathrooms || "0"} banos y capacidad maxima ${capacity || "1"}.`
          : "Los datos clave se iran afinando cuando el propietario complete las estancias.",
        services.length ? `La vivienda destaca por ${services.join(", ")}.` : "Anade comodidades y condiciones para mejorar la confianza en busqueda.",
        rooms.length ? `Categorias de fotos subidas: ${rooms.join(", ")}.` : "Se pueden anadir mas fotos despues para mejorar consistencia y visibilidad.",
        photoNames.length ? `Archivos considerados: ${photoNames.join(", ")}.` : "",
        price ? `Renta recomendada para publicar: ${price} EUR/mes.` : "Falta la renta mensual.",
        available ? `Disponible a partir de ${available}.` : "Conviene anadir la disponibilidad antes de publicar."
      ]
    ];
    return variants[pickedVariant].filter(Boolean).join("\n");
  }

  function updateGeneratedText(force) {
    ensureTitle();
    if (description && (force || !description.value.trim() || description.dataset.generated === "true")) {
      description.value = generatedDescription(descriptionVariantIndex);
      description.dataset.generated = "true";
    }
  }

  function updateSummary() {
    const rooms = roomSummaryItems();
    const photoCount = flattenedPhotos().length;
    if (summary) {
      summary.textContent = photoCount
        ? tr("ownerPost.readyWithPhotos").replace("{count}", photoCount).replace("{rooms}", rooms.join(", "))
        : tr("ownerPost.readyCopy");
    }
    if (status && !status.classList.contains("is-success")) {
      status.textContent = ownerUser() ? tr("ownerPost.saved") : tr("ownerPost.draftHint");
    }
  }

  async function handlePhoto(input) {
    const files = Array.from(input.files || []);
    if (!files.length) return;
    const loaded = (await Promise.all(files.map(readFileAsDataUrl))).filter(Boolean)
      .map((photo) => ({ ...photo, label: roomLabelForInput(input) }));
    photoGroups[input.dataset.ownerPhoto] = [
      ...(photoGroups[input.dataset.ownerPhoto] || []),
      ...loaded
    ].slice(0, 18);
    setSlotPreview(input);
    status?.classList.remove("is-success");
    updateGeneratedText(true);
    updateSummary();
    saveDraft();
  }

  function collectAiFields() {
    return {
      name: field("title")?.value || "",
      area_es: field("address")?.value || "",
      area_en: field("address")?.value || "",
      price_number: Number(field("price")?.value) || null,
      bedrooms: Number(field("bedrooms")?.value) || null,
      bathrooms: Number(field("bathrooms")?.value) || null,
      guests: Number(field("capacity")?.value) || null,
      amenities: selectedServiceKeys(),
      owner_notes: description?.value || "",
      photos: roomSummaryItems()
    };
  }

  async function regenerateDescription() {
    ensureTitle();
    if (status) {
      status.textContent = tr("ownerPost.aiWorking");
      status.classList.remove("is-success");
    }
    const fallback = () => {
      descriptionVariantIndex += 1;
      if (description) {
        description.value = generatedDescription(descriptionVariantIndex);
        description.dataset.generated = "true";
      } else {
        updateGeneratedText(true);
      }
      if (status) status.textContent = tr("ownerPost.aiFallback");
    };
    if (window.EbrostayBackend?.aiGenerateDescription) {
      const images = flattenedPhotos().slice(0, 3).map((photo) => photo.dataUrl);
      const generated = await EbrostayBackend.aiGenerateDescription(collectAiFields(), images);
      const fields = generated?.fields || {};
      const text = lang() === "en"
        ? (fields.details_en || fields.copy_en)
        : (fields.details_es || fields.copy_es);
      if (generated?.ok && text && description) {
        if (text.trim() === description.value.trim()) {
          fallback();
          saveDraft();
          return;
        }
        descriptionVariantIndex += 1;
        description.value = text;
        description.dataset.generated = "true";
        if (status) status.textContent = tr("ownerPost.aiDone");
        saveDraft();
        return;
      }
    }
    fallback();
    saveDraft();
  }

  function locationFromAddress(address) {
    const hit = zaragozaLocationHints.find((item) => item.match.test(address || ""));
    return hit || { postcode: "50001", neighborhood: "Centro", lat: 41.653, lng: -0.881 };
  }

  function buildPublishedRecord() {
    updateGeneratedText(false);
    const address = field("address")?.value.trim() || "Zaragoza";
    const location = locationFromAddress(address);
    const services = selectedServiceKeys();
    const photos = flattenedPhotos();
    const priceNumber = Number(field("price")?.value) || 0;
    const title = field("title")?.value.trim() || (lang() === "en" ? `Furnished flat in ${address}` : `Piso amueblado en ${address}`);
    const desc = description?.value.trim() || generatedDescription();
    restoredPublishId = restoredPublishId || `owner-${Date.now().toString(36)}`;

    return {
      id: restoredPublishId,
      title,
      name: title,
      address,
      city: "zaragoza",
      area: location.neighborhood,
      neighborhood: location.neighborhood,
      postcode: location.postcode,
      lat: location.lat,
      lng: location.lng,
      type: field("type")?.value || "apartment",
      priceNumber,
      guests: Number(field("capacity")?.value) || 1,
      bedrooms: Number(field("bedrooms")?.value) || null,
      bathrooms: Number(field("bathrooms")?.value) || null,
      availableFrom: field("available")?.value || new Date().toISOString().slice(0, 10),
      amenities: services.filter((key) => !["bills", "deposit"].includes(key)),
      billsIncluded: services.includes("bills"),
      depositProtected: services.includes("deposit"),
      copy: desc.split("\n")[0] || desc,
      details: desc,
      photos: photos.filter((photo) => !/floor|plano/i.test(photo.label || photo.name)).map((photo) => photo.dataUrl),
      floorplans: photos.filter((photo) => /floor|plano/i.test(photo.label || photo.name)).map((photo) => photo.dataUrl),
      publishedAt: new Date().toISOString()
    };
  }

  async function publishListing() {
    const user = ownerUser();
    if (!user) {
      pendingPublish = true;
      updateGeneratedText(false);
      saveDraft();
      if (status) {
        status.textContent = tr("ownerPost.loginRequired");
        status.classList.add("is-success");
      }
      openOwnerLogin();
      return;
    }

    const record = buildPublishedRecord();
    lastPublishedRecord = record;
    if (typeof saveOwnerPublishedRecord === "function") saveOwnerPublishedRecord(record);

    let remoteSaved = false;
    if (window.EbrostayBackend?.publishOwnerProperty) {
      const result = await EbrostayBackend.publishOwnerProperty({
        ...record,
        price: `${record.priceNumber} EUR`,
        addressKey: "owner",
        isNew: true,
        checked: true,
        area: record.area,
        areaEs: record.area,
        areaEn: record.area,
        copyEs: record.copy,
        copyEn: record.copy,
        detailsEs: record.details,
        detailsEn: record.details
      });
      remoteSaved = Boolean(result?.ok);
    }

    status.textContent = remoteSaved ? tr("ownerPost.published") : tr("ownerPost.publishedLocal");
    status.classList.add("is-success");
    docsButton?.removeAttribute("disabled");
    saveDraft();
    if (typeof renderMapLocationFilters === "function") renderMapLocationFilters();
    if (typeof renderProperties === "function") {
      mapNeedsFit = true;
      renderProperties();
    }
  }

  function openOwnerLogin() {
    const dialog = document.querySelector("#authDialog");
    const authFormElement = document.querySelector("#authForm");
    if (typeof showAuthForm === "function") showAuthForm();
    if (typeof setAuthMode === "function") setAuthMode("signin");
    authFormElement?.querySelector("input[name='email']")?.focus();
    if (dialog && !dialog.open) dialog.showModal();
  }

  function downloadDocs() {
    const record = lastPublishedRecord || buildPublishedRecord();
    const lines = [
      "EbroStay property dossier",
      "",
      `Title: ${record.title}`,
      `Address / area: ${record.address}`,
      `Postcode: ${record.postcode}`,
      `Neighborhood: ${record.neighborhood}`,
      `Price: ${record.priceNumber} EUR/month`,
      `Available from: ${record.availableFrom}`,
      `Capacity: ${record.guests}`,
      `Bedrooms: ${record.bedrooms || ""}`,
      `Bathrooms: ${record.bathrooms || ""}`,
      `Amenities: ${record.amenities.join(", ")}`,
      "",
      "Description:",
      record.details,
      "",
      `Photos included: ${(record.photos || []).length}`,
      `Floor plans included: ${(record.floorplans || []).length}`
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${record.id || "ebrostay-listing"}-dossier.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  restoreDraft();
  photoInputs().forEach(setSlotPreview);
  updateGeneratedText(false);
  updateSummary();
  if (typeof hydrateOwnerPublishedProperties === "function") hydrateOwnerPublishedProperties();

  document.addEventListener("change", (event) => {
    const input = event.target.closest("[data-owner-photo]");
    if (input) {
      handlePhoto(input);
      return;
    }
    if (form.contains(event.target)) {
      updateGeneratedText(false);
      updateSummary();
      saveDraft();
    }
  });

  form.addEventListener("input", (event) => {
    if (event.target === description) {
      description.dataset.generated = "false";
    } else if (event.target === field("title")) {
      field("title").dataset.generated = "false";
    } else {
      updateGeneratedText(false);
    }
    status?.classList.remove("is-success");
    updateSummary();
    saveDraft();
  });

  document.querySelector("[data-owner-regenerate]")?.addEventListener("click", regenerateDescription);

  document.querySelector("[data-owner-start]")?.addEventListener("click", () => {
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => field("title")?.focus(), 320);
  });

  loginButtons.forEach((button) => button.addEventListener("click", () => {
    if (ownerUser()) {
      if (status) {
        status.textContent = tr("ownerPost.saved");
        status.classList.add("is-success");
      }
      return;
    }
    openOwnerLogin();
  }));

  addPhotoButton?.addEventListener("click", () => {
    const input = createExtraSlot();
    input?.focus();
  });

  docsButton?.addEventListener("click", downloadDocs);

  document.querySelectorAll("[data-lang]").forEach((button) => {
    button.addEventListener("click", () => window.setTimeout(updateSummary, 0));
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    publishListing();
  });

  window.EbrostayOwnerComposer = {
    refreshAuth(user) {
      if (user && pendingPublish) {
        pendingPublish = false;
        publishListing();
      } else {
        updateSummary();
      }
    },
    publish: publishListing
  };
})();
