// Ebrostay Supabase backend bridge.
// When supabase-config.js has credentials, listings, availability,
// favorites, auth, and the contact form all run on Supabase.
// Without credentials every feature falls back to the static behavior.

const EbrostayBackend = (() => {
  let client = null;
  let user = null;
  let isAdmin = false;
  let isOwner = false;
  let callbacks = {};

  function isConfigured() {
    return Boolean(
      typeof SUPABASE_URL === "string" &&
      SUPABASE_URL.startsWith("https://") &&
      typeof SUPABASE_ANON_KEY === "string" &&
      SUPABASE_ANON_KEY.length > 20 &&
      typeof window.supabase !== "undefined"
    );
  }

  function getClient() {
    if (!client && isConfigured()) {
      client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return client;
  }

  function photoUrl(storagePath) {
    const sb = getClient();
    if (!sb) return "";
    return sb.storage.from("property-photos").getPublicUrl(storagePath).data.publicUrl;
  }

  function mapRowToProperty(row) {
    const key = `db.${row.id}`;
    const locationFallback = row.address_key === "movera"
      ? { postcode: "50194", neighborhood: "Movera" }
      : { postcode: "50009", neighborhood: "Universidad" };
    const set = (suffix, es, en) => {
      translations.es[`${key}.${suffix}`] = es ?? en ?? "";
      translations.en[`${key}.${suffix}`] = en ?? es ?? "";
    };
    set("name", row.name, typeof localizeListingTitle === "function" ? localizeListingTitle(row.name, "en") : row.name);
    set("area", row.area_es, row.area_en);
    set("copy", row.copy_es, row.copy_en);
    set("details", row.details_es, row.details_en);
    if (row.price_note_es || row.price_note_en) set("priceNote", row.price_note_es, row.price_note_en);
    if (row.beds_es || row.beds_en) set("beds", row.beds_es, row.beds_en);

    return {
      id: row.id,
      city: row.city,
      type: row.type,
      address: row.address || null,
      addressKey: row.address_key,
      postcode: row.postcode || locationFallback.postcode,
      neighborhood: row.neighborhood || locationFallback.neighborhood || row.area_es || row.area_en || "",
      nameKey: `${key}.name`,
      areaKey: `${key}.area`,
      copyKey: `${key}.copy`,
      detailsKey: `${key}.details`,
      priceNoteKey: (row.price_note_es || row.price_note_en) ? `${key}.priceNote` : undefined,
      lat: row.lat,
      lng: row.lng,
      guests: row.guests,
      price: `${row.price_number} EUR`,
      priceNumber: row.price_number,
      rating: row.rating === null ? null : Number(row.rating),
      availableFrom: row.available_from,
      isNew: row.is_new,
      checked: row.checked,
      depositProtected: row.deposit_protected,
      billsIncluded: row.bills_included,
      amenities: row.amenities || [],
      bedrooms: row.bedrooms,
      bathrooms: row.bathrooms,
      sizeM2: row.size_m2,
      floorNumber: row.floor_number,
      minStayMonths: row.min_stay_months,
      maxStayMonths: row.max_stay_months,
      depositAmount: row.deposit_amount,
      upfrontRentEur: row.upfront_rent_eur,
      utilitiesCapEur: row.utilities_cap_eur,
      petsAllowed: row.pets_allowed,
      smokingAllowed: row.smoking_allowed,
      couplesAllowed: row.couples_allowed,
      selfCheckin: row.self_checkin,
      energyRating: row.energy_rating,
      videoUrl: row.video_url,
      bedsKey: (row.beds_es || row.beds_en) ? `${key}.beds` : undefined,
      photos: (row.property_photos || [])
        .filter((photo) => !photo.is_floorplan)
        .sort((a, b) => a.sort_order - b.sort_order || (a.storage_path < b.storage_path ? -1 : 1))
        .map((photo) => photoUrl(photo.storage_path)),
      floorplans: (row.property_photos || [])
        .filter((photo) => photo.is_floorplan)
        .sort((a, b) => a.sort_order - b.sort_order || (a.storage_path < b.storage_path ? -1 : 1))
        .map((photo) => photoUrl(photo.storage_path)),
      unavailable: (row.availability_blocks || [])
        // confirmed blocks (no hold) and still-active holds count as taken
        .filter((block) => !block.hold_expires_at || new Date(block.hold_expires_at) > new Date())
        .map((block) => [block.start_date, block.end_date])
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    };
  }

  async function loadProperties() {
    const sb = getClient();
    if (!sb) return false;
    let { data, error } = await sb
      .from("properties")
      .select("*, availability_blocks(start_date, end_date, hold_expires_at), property_photos(storage_path, sort_order, is_floorplan)")
      .eq("is_published", true)
      .order("price_number", { ascending: true });
    if (error) {
      // The photos table may not exist yet (upgrade SQL not run); retry without it.
      ({ data, error } = await sb
        .from("properties")
        .select("*, availability_blocks(start_date, end_date, hold_expires_at)")
        .eq("is_published", true)
        .order("price_number", { ascending: true }));
    }
    if (error || !data || data.length === 0) {
      if (error) console.warn("Supabase properties load failed, using built-in data:", error.message);
      return false;
    }
    properties.length = 0;
    properties.push(...data.map(mapRowToProperty));
    return true;
  }

  async function refreshAuth() {
    const sb = getClient();
    if (!sb) return;
    const { data } = await sb.auth.getUser();
    user = data?.user || null;
    isAdmin = false;
    isOwner = false;
    if (user) {
      const { data: profile } = await sb
        .from("profiles")
        .select("is_admin, is_owner")
        .eq("id", user.id)
        .maybeSingle();
      isAdmin = Boolean(profile?.is_admin);
      isOwner = Boolean(profile?.is_owner);
    }
    callbacks.onAuthChanged?.(user, isAdmin);
  }

  async function init(handlers) {
    callbacks = handlers || {};
    if (!isConfigured()) return;
    const sb = getClient();

    sb.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") callbacks.onPasswordRecovery?.();
      refreshAuth();
    });

    const loaded = await loadProperties();
    if (loaded) callbacks.onPropertiesLoaded?.();
    await refreshAuth();
  }

  async function signIn(email, password) {
    const { error } = await getClient().auth.signInWithPassword({ email, password });
    return error;
  }

  async function signUp(email, password) {
    const { data, error } = await getClient().auth.signUp({ email, password });
    return { needsConfirmation: Boolean(data?.user && !data?.session), error };
  }

  async function signOut() {
    await getClient().auth.signOut();
  }

  async function resetPassword(email) {
    const { error } = await getClient().auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    });
    return error;
  }

  async function updatePassword(password) {
    const { error } = await getClient().auth.updateUser({ password });
    return error;
  }

  // Which OAuth providers are enabled in the Supabase project (so the
  // buttons only appear once Google/Azure are configured in the dashboard)
  async function getEnabledProviders() {
    if (!isConfigured()) return {};
    try {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
        headers: { apikey: SUPABASE_ANON_KEY }
      });
      const settings = await response.json();
      return settings?.external || {};
    } catch {
      return {};
    }
  }

  async function signInWithProvider(provider) {
    const { error } = await getClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin + window.location.pathname }
    });
    return error;
  }

  async function publishOwnerProperty(property) {
    const sb = getClient();
    if (!sb) return { ok: false, code: "not_configured" };
    if (!user) return { ok: false, code: "not_signed_in" };
    const priceNumber = Number(property?.priceNumber) || 0;
    const row = {
      id: property.id,
      city: property.city || "zaragoza",
      type: property.type || "apartment",
      address_key: property.addressKey || "owner",
      lat: Number(property.lat) || 41.6516,
      lng: Number(property.lng) || -0.8809,
      guests: Number(property.guests) || 1,
      price_label: property.price || `${priceNumber} EUR`,
      price_number: priceNumber,
      rating: property.rating || null,
      available_from: property.availableFrom || null,
      is_new: Boolean(property.isNew),
      checked: Boolean(property.checked),
      deposit_protected: Boolean(property.depositProtected),
      bills_included: Boolean(property.billsIncluded),
      amenities: property.amenities || [],
      name: property.name || "Owner listing",
      area_es: property.areaEs || property.area || "",
      area_en: property.areaEn || property.area || "",
      copy_es: property.copyEs || property.copy || "",
      copy_en: property.copyEn || property.copy || "",
      details_es: property.detailsEs || property.details || "",
      details_en: property.detailsEn || property.details || "",
      bedrooms: property.bedrooms || null,
      bathrooms: property.bathrooms || null,
      floor_number: property.floorNumber || null,
      min_stay_months: property.minStayMonths || 1,
      is_published: true,
      owner_id: user.id
    };
    let { error } = await sb.from("properties").upsert({
      ...row,
      postcode: property.postcode || null,
      neighborhood: property.neighborhood || property.area || null
    });
    if (error && /postcode|neighborhood|column/i.test(error.message || "")) {
      ({ error } = await sb.from("properties").upsert(row));
    }
    if (error) console.warn("Owner property publish failed:", error.message);
    return { ok: !error, code: error ? "server_error" : "saved", error };
  }

  function coverUrl(property) {
    const photos = (property?.property_photos || [])
      .filter((photo) => !photo.is_floorplan)
      .sort((a, b) => a.sort_order - b.sort_order || (a.storage_path < b.storage_path ? -1 : 1));
    return photos.length ? photoUrl(photos[0].storage_path) : "";
  }

  async function loadMyBookings() {
    if (!user) return null;
    const sb = getClient();
    const [paidResult, assignedResult] = await Promise.all([
      sb.from("bookings")
        .select("id, property_id, property_name, start_date, end_date, months, amount_eur, status, invoice_url, invoice_pdf, receipt_url, properties(address, property_photos(storage_path, sort_order, is_floorplan))")
        .eq("user_id", user.id)
        .order("start_date"),
      sb.from("availability_blocks")
        .select("start_date, end_date, properties(id, name, address, property_photos(storage_path, sort_order, is_floorplan))")
        .eq("user_id", user.id)
        .order("start_date")
    ]);
    if (paidResult.error && assignedResult.error) return null;
    return {
      paid: (paidResult.data || []).map((row) => ({
        ...row,
        cover: coverUrl(row.properties),
        address: row.properties?.address || null
      })),
      assigned: (assignedResult.data || []).map((row) => ({
        startDate: row.start_date,
        endDate: row.end_date,
        propertyId: row.properties?.id || null,
        propertyName: row.properties?.name || "",
        address: row.properties?.address || null,
        cover: coverUrl(row.properties)
      }))
    };
  }

  // Full detail for one of the signed-in user's bookings (RLS scoped),
  // including the tenant-only stay info when the admin has filled it in.
  async function loadBookingDetail(bookingId) {
    if (!user || !bookingId) return null;
    const sb = getClient();
    const { data, error } = await sb
      .from("bookings")
      .select("*, properties(id, name, address, lat, lng, property_photos(storage_path, sort_order, is_floorplan))")
      .eq("id", bookingId)
      .maybeSingle();
    if (error || !data) return null;
    let guestInfo = null;
    if (data.property_id) {
      const { data: info } = await sb
        .from("property_guest_info")
        .select("wifi_name, wifi_password, key_pickup, checkin_time, checkout_time, emergency_phone, notes")
        .eq("property_id", data.property_id)
        .maybeSingle();
      guestInfo = info || null;
    }
    return { ...data, cover: coverUrl(data.properties), guestInfo };
  }

  // Send a booking request (no online payment). The request-booking Edge
  // Function computes the fees, records the request and emails Ebrostay; we
  // review it and mark the property taken manually.
  async function requestBooking(propertyId, startDate, endDate, tenantNames) {
    const sb = getClient();
    try {
      const { data, error } = await sb.functions.invoke("request-booking", {
        body: { propertyId, startDate, endDate, tenantNames: tenantNames || "" }
      });
      if (error) {
        let code = "server_error";
        try { code = (await error.context?.json())?.error || code; } catch { /* keep default */ }
        return { ok: false, code };
      }
      return { ok: Boolean(data?.ok), code: data?.ok ? null : "server_error" };
    } catch {
      return { ok: false, code: "server_error" };
    }
  }

  async function deactivateAccount() {
    const sb = getClient();
    const { error } = await sb.rpc("deactivate_my_account");
    if (error) return error;
    await sb.auth.signOut();
    return null;
  }

  async function loadFavorites() {
    if (!user) return null;
    const { data, error } = await getClient().from("favorites").select("property_id");
    if (error) return null;
    return data.map((row) => row.property_id);
  }

  async function saveFavorite(propertyId, on) {
    if (!user) return;
    const sb = getClient();
    if (on) {
      await sb.from("favorites").upsert({ user_id: user.id, property_id: propertyId });
    } else {
      await sb.from("favorites").delete().match({ user_id: user.id, property_id: propertyId });
    }
  }

  async function sendInquiry(fields) {
    const sb = getClient();
    if (!sb) return { ok: false };
    const { error } = await sb.from("inquiries").insert({
      name: fields.name,
      email: fields.email,
      property: fields.property,
      message: fields.message,
      language: fields.language,
      user_id: user?.id || null
    });
    if (error) console.warn("Inquiry insert failed:", error.message);
    return { ok: !error };
  }

  // Owner partnership application (public lead capture)
  async function submitOwnerLead(fields) {
    const sb = getClient();
    if (!sb) return { ok: false };
    const { error } = await sb.from("owner_leads").insert({
      name: fields.name,
      email: fields.email,
      phone: fields.phone || null,
      city: fields.city || null,
      units: fields.units || null,
      message: fields.message || null,
      user_id: user?.id || null
    });
    if (error) console.warn("Owner lead insert failed:", error.message);
    return { ok: !error };
  }

  // Owner dashboard: their properties, paid bookings on them, and payout details
  async function loadOwnerDashboard() {
    if (!user) return null;
    const sb = getClient();
    const [propsResult, payoutResult] = await Promise.all([
      sb.from("properties")
        .select("id, name, address, price_number, is_published, property_photos(storage_path, sort_order, is_floorplan)")
        .eq("owner_id", user.id)
        .order("name"),
      sb.from("owner_payout_details").select("*").eq("owner_id", user.id).maybeSingle()
    ]);
    const properties = propsResult.data || [];
    let bookings = [];
    if (properties.length) {
      const ids = properties.map((p) => p.id);
      const { data } = await sb.from("bookings")
        .select("property_id, property_name, start_date, end_date, months, amount_eur, status, created_at")
        .in("property_id", ids)
        .order("created_at", { ascending: false });
      bookings = data || [];
    }
    return {
      properties: properties.map((p) => ({ ...p, cover: coverUrl(p) })),
      bookings,
      payout: payoutResult.data || null
    };
  }

  async function saveOwnerPayout(fields) {
    if (!user) return { ok: false };
    const sb = getClient();
    const { error } = await sb.from("owner_payout_details").upsert({
      owner_id: user.id,
      account_holder: fields.account_holder || null,
      iban: fields.iban || null,
      bank_name: fields.bank_name || null,
      tax_id: fields.tax_id || null,
      billing_address: fields.billing_address || null,
      payout_notes: fields.payout_notes || null,
      updated_at: new Date().toISOString()
    });
    if (error) console.warn("Payout save failed:", error.message);
    return { ok: !error };
  }

  function getIsOwner() {
    return isOwner;
  }

  // AI editor helpers (DeepSeek via the ai-property-assistant Edge Function).
  // Both return a plain result object and never throw, so the editor can show
  // a friendly status when AI is unconfigured or offline.
  async function aiExtractProperty(text) {
    const sb = getClient();
    if (!sb) return { ok: false, code: "not_configured" };
    try {
      const { data, error } = await sb.functions.invoke("ai-property-assistant", {
        body: { action: "extract", text: String(text || "").slice(0, 24000) }
      });
      if (error) {
        let code = "server_error";
        try { code = (await error.context?.json())?.error || code; } catch { /* keep default */ }
        return { ok: false, code };
      }
      return { ok: true, fields: data?.fields || {} };
    } catch {
      return { ok: false, code: "server_error" };
    }
  }

  async function aiGenerateDescription(fields, images) {
    const sb = getClient();
    if (!sb) return { ok: false, code: "not_configured" };
    try {
      const { data, error } = await sb.functions.invoke("ai-property-assistant", {
        body: { action: "describe", fields: fields || {}, images: images || [] }
      });
      if (error) {
        let code = "server_error";
        try { code = (await error.context?.json())?.error || code; } catch { /* keep default */ }
        return { ok: false, code };
      }
      return { ok: true, fields: data?.fields || {} };
    } catch {
      return { ok: false, code: "server_error" };
    }
  }

  async function aiTranslateField(text, source, target, field) {
    const sb = getClient();
    if (!sb) return { ok: false, code: "not_configured" };
    try {
      const { data, error } = await sb.functions.invoke("ai-property-assistant", {
        body: { action: "translate", text: String(text || "").slice(0, 24000), source, target, field }
      });
      if (error) {
        let code = "server_error";
        try { code = (await error.context?.json())?.error || code; } catch { /* keep default */ }
        return { ok: false, code };
      }
      return { ok: true, text: data?.text || "" };
    } catch {
      return { ok: false, code: "server_error" };
    }
  }

  // Admin: pending and historical booking requests (RLS limits reads to admins).
  async function loadBookingRequests() {
    const sb = getClient();
    if (!sb) return null;
    const { data, error } = await sb
      .from("booking_requests")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("Booking requests load failed:", error.message);
      return null;
    }
    return data || [];
  }

  // Admin: move a request through its lifecycle (new → contacted → confirmed
  // / declined). RLS only lets admins update.
  async function updateBookingRequestStatus(id, status) {
    const sb = getClient();
    if (!sb) return { ok: false };
    const { error } = await sb.from("booking_requests").update({ status }).eq("id", id);
    if (error) console.warn("Booking request update failed:", error.message);
    return { ok: !error };
  }

  return {
    isConfigured,
    getClient,
    init,
    refreshAuth,
    signIn,
    signUp,
    signOut,
    resetPassword,
    updatePassword,
    getEnabledProviders,
    signInWithProvider,
    publishOwnerProperty,
    reloadProperties: loadProperties,
    loadMyBookings,
    loadBookingDetail,
    requestBooking,
    loadBookingRequests,
    updateBookingRequestStatus,
    deactivateAccount,
    loadFavorites,
    saveFavorite,
    sendInquiry,
    submitOwnerLead,
    loadOwnerDashboard,
    saveOwnerPayout,
    aiExtractProperty,
    aiTranslateField,
    aiGenerateDescription,
    photoUrl,
    getUser: () => user,
    getIsAdmin: () => isAdmin,
    getIsOwner
  };
})();

window.EbrostayBackend = EbrostayBackend;
