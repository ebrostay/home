// Ebrostay Supabase backend bridge.
// When supabase-config.js has credentials, listings, availability,
// favorites, auth, and the contact form all run on Supabase.
// Without credentials every feature falls back to the static behavior.

const EbrostayBackend = (() => {
  let client = null;
  let user = null;
  let isAdmin = false;
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
    const set = (suffix, es, en) => {
      translations.es[`${key}.${suffix}`] = es ?? en ?? "";
      translations.en[`${key}.${suffix}`] = en ?? es ?? "";
    };
    set("name", row.name, row.name);
    set("area", row.area_es, row.area_en);
    set("copy", row.copy_es, row.copy_en);
    set("details", row.details_es, row.details_en);
    if (row.price_note_es || row.price_note_en) set("priceNote", row.price_note_es, row.price_note_en);
    if (row.beds_es || row.beds_en) set("beds", row.beds_es, row.beds_en);

    return {
      id: row.id,
      city: row.city,
      type: row.type,
      addressKey: row.address_key,
      nameKey: `${key}.name`,
      areaKey: `${key}.area`,
      copyKey: `${key}.copy`,
      detailsKey: `${key}.details`,
      priceNoteKey: (row.price_note_es || row.price_note_en) ? `${key}.priceNote` : undefined,
      lat: row.lat,
      lng: row.lng,
      guests: row.guests,
      price: row.price_label,
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
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order || (a.storage_path < b.storage_path ? -1 : 1))
        .map((photo) => photoUrl(photo.storage_path)),
      unavailable: (row.availability_blocks || [])
        .map((block) => [block.start_date, block.end_date])
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    };
  }

  async function loadProperties() {
    const sb = getClient();
    if (!sb) return false;
    let { data, error } = await sb
      .from("properties")
      .select("*, availability_blocks(start_date, end_date), property_photos(storage_path, sort_order)")
      .eq("is_published", true)
      .order("price_number", { ascending: true });
    if (error) {
      // The photos table may not exist yet (upgrade SQL not run); retry without it.
      ({ data, error } = await sb
        .from("properties")
        .select("*, availability_blocks(start_date, end_date)")
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
    if (user) {
      const { data: profile } = await sb
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .maybeSingle();
      isAdmin = Boolean(profile?.is_admin);
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

  async function loadMyBookings() {
    if (!user) return null;
    const sb = getClient();
    const [paidResult, assignedResult] = await Promise.all([
      sb.from("bookings")
        .select("property_id, property_name, start_date, end_date, months, amount_eur, status, invoice_url, invoice_pdf, receipt_url")
        .eq("user_id", user.id)
        .order("start_date"),
      sb.from("availability_blocks")
        .select("start_date, end_date, properties(name)")
        .eq("user_id", user.id)
        .order("start_date")
    ]);
    if (paidResult.error && assignedResult.error) return null;
    return {
      paid: paidResult.data || [],
      assigned: (assignedResult.data || []).map((row) => ({
        startDate: row.start_date,
        endDate: row.end_date,
        propertyName: row.properties?.name || ""
      }))
    };
  }

  async function createBookingCheckout(propertyId, startDate, endDate) {
    const sb = getClient();
    try {
      const { data, error } = await sb.functions.invoke("create-booking-checkout", {
        body: { propertyId, startDate, endDate }
      });
      if (error) {
        let code = "server_error";
        try { code = (await error.context?.json())?.error || code; } catch { /* keep default */ }
        return { url: null, code };
      }
      return { url: data?.url || null, code: data?.url ? null : "server_error" };
    } catch {
      return { url: null, code: "server_error" };
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
    loadMyBookings,
    createBookingCheckout,
    deactivateAccount,
    loadFavorites,
    saveFavorite,
    sendInquiry,
    photoUrl,
    getUser: () => user,
    getIsAdmin: () => isAdmin
  };
})();

window.EbrostayBackend = EbrostayBackend;
