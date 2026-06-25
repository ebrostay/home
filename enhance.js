// Ebrostay — progressive enhancement: hero readability, audience switch, filters, support and listing UX.
// Self-contained, dependency-light, and respects reduced-motion.
(function () {
  "use strict";

  var AUDIENCE_KEY = "ebrostay-audience";
  var AUDIENCE_SEEN_KEY = "ebrostay-audience-seen";

  var copy = {
    es: {
      homeNav: "Inicio",
      switchLabel: "Elige tu perfil",
      tenant: "Buscar alojamiento",
      tenantSub: "Alojo a mi equipo",
      owner: "Gestiona mi piso",
      ownerSub: "Quiero publicar",
      tenantStatus: "Versión empresas activa",
      ownerStatus: "Versión propietario activa",
      tenantHint: "Estancias de media duración para empleados y equipos desplazados.",
      ownerHint: "Publica tu vivienda y delega toda la gestión.",
      ownerKicker: "Gestión para propietarios, 100% digital",
      ownerTitle: "Tu vivienda, gestionada de principio a fin.",
      ownerCopy: "Publicamos tu vivienda, encontramos inquilinos, verificamos perfiles, gestionamos contratos, cobros, fianza, soporte y pagos a tu cuenta. Tú ves llegar los ingresos; nosotros hacemos el trabajo.",
      ownerTrust1: "Gestión sin involucración",
      ownerTrust2: "Demanda corporativa",
      ownerTrust3: "Pagos claros a tu IBAN",
      ownerCta: "Publicar mi vivienda →",
      ownerPanelKicker: "Modo propietario",
      ownerPanelTitle: "Convierte tu vivienda en ingresos sin gestionar llamadas, anuncios ni incidencias.",
      ownerPanelCopy: "Ebrostay se ocupa de todo el ciclo de alquiler de media estancia: preparación, publicación, inquilinos, contrato, cobros y soporte.",
      ownerPanelPrimary: "Quiero que gestionéis mi vivienda",
      ownerPanelSecondary: "Ver ventajas para propietarios",
      tenantNavCta: "Buscar vivienda",
      ownerNavCta: "Publicar vivienda",
      ownerNavDashboard: "Mi portal",
      benefits: [
        ["armchair", "Pisos amueblados"],
        ["headphones", "Soporte 24/7"],
        ["file-signature", "Contrato claro"],
        ["sparkles", "Limpieza y entrada"],
        ["shield-check", "Gestión de incidencias"],
        ["credit-card", "Pago digital"]
      ],
      whyTitle: "Tan fácil como reservar un hotel, pero para estancias de meses.",
      whyLead: "Elige fechas, compara viviendas verificadas y solicita tu estancia con precio claro, soporte humano y condiciones preparadas para empresas y profesionales.",
      howKicker: "Cómo funciona",
      howTitle: "Elige, solicita y entra.",
      howSteps: [
        ["search", "Elige", "Filtra por zona, fechas, capacidad y comodidades."],
        ["send", "Solicita", "Envía tu solicitud sin llamadas ni visitas innecesarias."],
        ["key-round", "Entra", "Recibe confirmación, contrato y soporte de llegada."]
      ],
      filtersAddress: "Zona o dirección",
      filtersAddressPlaceholder: "Movera, Universidad, Pedro II...",
      filtersBedrooms: "Habitaciones mínimas",
      filtersBathrooms: "Baños mínimos",
      filtersAny: "Cualquiera",
      filtersClear: "Limpiar filtros",
      mapTitle: "Mapa interactivo",
      mapCopy: "Acércate, muévete por Zaragoza y toca un precio para ver la vivienda. Los pins se actualizan con los anuncios publicados.",
      assistantOpen: "¿Necesitas ayuda?",
      assistantTitle: "Asistente Ebrostay",
      assistantCopy: "Dinos tu duda y te abrimos un WhatsApp con el mensaje preparado.",
      assistantPlaceholder: "Estoy intentando reservar y necesito ayuda con...",
      assistantSend: "Pedir ayuda",
      assistantOwnerCopy: "Cuéntanos qué necesitas como propietario y te abrimos un WhatsApp con el mensaje preparado.",
      assistantOwnerPlaceholder: "Soy propietario y necesito ayuda con...",
      assistantAccountCopy: "Dinos qué pasa con tu cuenta o tu reserva y te abrimos un WhatsApp con el mensaje preparado.",
      assistantAccountPlaceholder: "Tengo una reserva y necesito ayuda con...",
      adminAssistantOpen: "Soporte de administración",
      adminAssistantTitle: "Soporte de administración",
      adminAssistantCopy: "Cuéntanos la incidencia de gestión y abrimos un WhatsApp con el equipo de operaciones.",
      adminAssistantPlaceholder: "No puedo acceder al panel de administración / necesito ayuda con...",
      adminAssistantSend: "Avisar a operaciones",
      adminAssistantSubject: "Soporte de administración Ebrostay",
      legal: "Ebrostay trata tus datos solo para responder solicitudes y gestionar reservas. Consulta nuestra política de privacidad y derechos GDPR.",
      trustVerified: "Vivienda verificada",
      trustDeposit: "Fianza protegida",
      trustSupport: "Soporte 24/7",
      trustPrice: "Precio total sin sorpresas",
      mediaPhotos: "Fotos",
      mediaFloorplan: "Plano",
      mediaVideo: "Vídeo",
      mediaShare: "Compartir",
      galleryHint: "Doble clic en la foto para abrir la galería",
      shareLinkedin: "LinkedIn",
      shareWhatsapp: "WhatsApp",
      shareEmail: "Email",
      ownerExtraFurnish: "Amueblamiento",
      ownerExtraFurnishCopy: "Podemos preparar y amueblar tu vivienda para alquiler corporativo.",
      ownerExtraMove: "Entrada y salida",
      ownerExtraMoveCopy: "Coordinamos check-in, check-out, limpieza y asistencia al huésped.",
      ownerExtraStats: "Estadísticas",
      ownerExtraStatsCopy: "Seguimiento de demanda, ocupación, ingresos y próximos pagos.",
      noPortalTop: "El portal queda integrado en la experiencia de propietario, no como distracción principal."
    },
    en: {
      homeNav: "Home",
      switchLabel: "Choose your profile",
      tenant: "Find a stay",
      tenantSub: "Housing for my team",
      owner: "Manage my flat",
      ownerSub: "I want to list",
      tenantStatus: "Company version active",
      ownerStatus: "Owner version active",
      tenantHint: "Mid-stay homes for relocating employees and teams.",
      ownerHint: "List your property and delegate the management.",
      ownerKicker: "Property management, 100% digital",
      ownerTitle: "Your property, managed end to end.",
      ownerCopy: "We list your home, find tenants, verify profiles, handle contracts, payments, deposits, support and payouts to your account. You see the income; we do the work.",
      ownerTrust1: "Hands-off management",
      ownerTrust2: "Corporate demand",
      ownerTrust3: "Clear IBAN payouts",
      ownerCta: "List my property →",
      ownerPanelKicker: "Owner mode",
      ownerPanelTitle: "Turn your property into income without managing calls, listings or issues.",
      ownerPanelCopy: "Ebrostay handles the full mid-stay rental cycle: preparation, listing, tenants, contract, payments and support.",
      ownerPanelPrimary: "I want you to manage my property",
      ownerPanelSecondary: "See owner benefits",
      tenantNavCta: "Find a home",
      ownerNavCta: "List a home",
      ownerNavDashboard: "My portal",
      benefits: [
        ["armchair", "Fully furnished"],
        ["headphones", "24/7 support"],
        ["file-signature", "Clear contract"],
        ["sparkles", "Cleaning & arrival"],
        ["shield-check", "Issue management"],
        ["credit-card", "Digital payment"]
      ],
      whyTitle: "As easy as booking a hotel, but for stays of months.",
      whyLead: "Pick dates, compare verified homes and request your stay with clear pricing, human support and conditions ready for companies and professionals.",
      howKicker: "How it works",
      howTitle: "Pick, request, move in.",
      howSteps: [
        ["search", "Pick", "Filter by area, dates, capacity and amenities."],
        ["send", "Request", "Send your request without calls or unnecessary viewings."],
        ["key-round", "Move in", "Receive confirmation, contract and arrival support."]
      ],
      filtersAddress: "Area or address",
      filtersAddressPlaceholder: "Movera, University, Pedro II...",
      filtersBedrooms: "Minimum bedrooms",
      filtersBathrooms: "Minimum bathrooms",
      filtersAny: "Any",
      filtersClear: "Clear filters",
      mapTitle: "Interactive map",
      mapCopy: "Zoom, move around Zaragoza and tap a price to view the home. Pins update from the published listings.",
      assistantOpen: "Need help?",
      assistantTitle: "Ebrostay assistant",
      assistantCopy: "Tell us the issue and we will open WhatsApp with the message ready.",
      assistantPlaceholder: "I am trying to book and need help with...",
      assistantSend: "Ask for help",
      assistantOwnerCopy: "Tell us what you need as an owner and we will open WhatsApp with the message ready.",
      assistantOwnerPlaceholder: "I am a property owner and need help with...",
      assistantAccountCopy: "Tell us what is happening with your account or booking and we will open WhatsApp with the message ready.",
      assistantAccountPlaceholder: "I have a booking and need help with...",
      adminAssistantOpen: "Admin support",
      adminAssistantTitle: "Admin support",
      adminAssistantCopy: "Tell us the management issue and we will open WhatsApp with the operations team.",
      adminAssistantPlaceholder: "I cannot access the admin panel / I need help with...",
      adminAssistantSend: "Notify operations",
      adminAssistantSubject: "Ebrostay admin support",
      legal: "Ebrostay uses your data only to answer requests and manage bookings. See our privacy policy and GDPR rights.",
      trustVerified: "Verified home",
      trustDeposit: "Deposit protected",
      trustSupport: "24/7 support",
      trustPrice: "Total price, no surprises",
      mediaPhotos: "Photos",
      mediaFloorplan: "Floor plan",
      mediaVideo: "Video",
      mediaShare: "Share",
      galleryHint: "Double-click the photo to open the gallery",
      shareLinkedin: "LinkedIn",
      shareWhatsapp: "WhatsApp",
      shareEmail: "Email",
      ownerExtraFurnish: "Furnishing",
      ownerExtraFurnishCopy: "We can prepare and furnish your home for corporate rentals.",
      ownerExtraMove: "Move-in/out",
      ownerExtraMoveCopy: "We coordinate check-in, check-out, cleaning and guest assistance.",
      ownerExtraStats: "Statistics",
      ownerExtraStatsCopy: "Track demand, occupancy, income and upcoming payouts.",
      noPortalTop: "The portal remains part of the owner experience, not the main distraction."
    }
  };

  function isAdminPage() {
    // partner.html shares the .admin-page styling class but is an owner portal,
    // so match the admin panel by path instead of the shared CSS class.
    return (window.location.pathname || "").toLowerCase().indexOf("admin") !== -1;
  }

  function lang() {
    var stored = "";
    try { stored = localStorage.getItem("ebrostay-language") || ""; } catch { stored = ""; }
    var current = stored || document.documentElement.lang || "es";
    return String(current).toLowerCase().startsWith("en") ? "en" : "es";
  }

  function text(key) {
    return (copy[lang()] && copy[lang()][key]) || copy.es[key] || key;
  }

  // Detect which audience the floating help widget should speak to:
  // owner (partner / owner portal), account (signed-in booking/account pages), or tenant.
  function supportContext() {
    var path = (window.location.pathname || "").toLowerCase();
    // Owner portal: the dedicated partner page (not the owner pitch on the homepage).
    if (path.indexOf("partner") !== -1 || document.querySelector(".partner-grid, .partner-empty")) {
      return "owner";
    }
    // Account / admin pages: existing bookings, not a new booking.
    if (path.indexOf("account") !== -1 || path.indexOf("admin") !== -1 || document.querySelector(".account-page, .admin-page")) {
      return "account";
    }
    return "tenant";
  }

  function supportCopyKey() {
    if (isAdminPage()) return "adminAssistantCopy";
    var ctx = supportContext();
    return ctx === "owner" ? "assistantOwnerCopy" : ctx === "account" ? "assistantAccountCopy" : "assistantCopy";
  }

  function supportPlaceholderKey() {
    if (isAdminPage()) return "adminAssistantPlaceholder";
    var ctx = supportContext();
    return ctx === "owner" ? "assistantOwnerPlaceholder" : ctx === "account" ? "assistantAccountPlaceholder" : "assistantPlaceholder";
  }

  function siteText(key) {
    try {
      if (typeof translations !== "undefined") {
        var language = lang();
        return (translations[language] && translations[language][key]) || (translations.es && translations.es[key]) || key;
      }
    } catch { /* translation dictionary unavailable */ }
    return key;
  }

  function setText(target, value) {
    var element = typeof target === "string" ? document.querySelector(target) : target;
    if (element) element.textContent = value;
  }

  function icon(name) {
    return `<i data-lucide="${name}" aria-hidden="true"></i>`;
  }

  // Translate static [data-i18n] content + sync the language buttons. Runs on
  // every page (idempotent); the safety net for pages without a page-specific
  // script (e.g. about, privacy) so the English/Spanish versions both work.
  function applyKeyedTranslations(language) {
    if (typeof translations === "undefined") return;
    var lng = translations[language] ? language : "es";
    document.documentElement.lang = lng;
    try { localStorage.setItem("ebrostay-language", lng); } catch (e) { /* ignore */ }
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = siteText(el.dataset.i18n);
    });
    document.querySelectorAll("[data-i18n-attr]").forEach(function (el) {
      el.dataset.i18nAttr.split(";").forEach(function (pair) {
        var p = pair.split(":");
        if (p[0] && p[1]) el.setAttribute(p[0].trim(), siteText(p[1].trim()));
      });
    });
    document.querySelectorAll("[data-lang]").forEach(function (b) {
      b.classList.toggle("is-active", b.dataset.lang === lng);
    });
    // Show the matching language block for rich content that can't be
    // translated via textContent (e.g. the privacy/legal page).
    document.querySelectorAll("[data-lang-content]").forEach(function (block) {
      block.hidden = block.dataset.langContent !== lng;
    });
  }

  function refreshIcons() {
    window.lucide?.createIcons?.();
  }

  function whatsappLink(message) {
    var number = typeof WHATSAPP_NUMBER !== "undefined" ? WHATSAPP_NUMBER : "34678715418";
    return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
  }

  function contactEmail() {
    return typeof CONTACT_EMAIL !== "undefined" ? CONTACT_EMAIL : "info@ebrostay.com";
  }

  function addGlobalStyles() {
    if (document.getElementById("ebro-enhancement-styles")) return;
    var style = document.createElement("style");
    style.id = "ebro-enhancement-styles";
    style.textContent = `
      :root { --ebro-glass: rgba(250, 249, 246, 0.94); }
      body, button, input, select, textarea { font-family: "Hanken Grotesque", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif !important; }
      h1, h2, h3, .brand-wordmark { font-family: "Hanken Grotesque", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif !important; }
      .section-kicker { color: var(--text-brand); font-size: 0.86rem; letter-spacing: 0.045em; }
      .hero-overlay { background: linear-gradient(90deg, rgba(10, 51, 36, 0.94), rgba(13, 29, 24, 0.60) 52%, rgba(13, 29, 24, 0.18)), linear-gradient(0deg, rgba(10, 20, 17, 0.84), rgba(10, 20, 17, 0.16) 54%); }
      .hero .eyebrow { display: inline-flex; align-items: center; gap: 8px; width: fit-content; max-width: 100%; margin-bottom: 12px; border: 1px solid rgba(250, 249, 246, 0.72); border-radius: var(--radius-pill); padding: 8px 12px; background: rgba(250, 249, 246, 0.94); color: var(--green-900); font-size: clamp(0.82rem, 1vw, 0.94rem); line-height: 1.08; letter-spacing: 0.045em; box-shadow: 0 10px 28px rgba(10, 20, 17, 0.20); text-shadow: none; }
      .hero .eyebrow::before { content: ""; flex: 0 0 auto; width: 7px; height: 7px; border-radius: 50%; background: var(--clay); box-shadow: 0 0 0 4px rgba(217, 99, 42, 0.16); }
      .hero h1, .hero-copy { text-shadow: 0 2px 18px rgba(10, 20, 17, 0.38); }
      .hero-copy { color: rgba(255, 255, 255, 0.94); }
      .audience-switch { display: grid; grid-template-columns: minmax(0, 1fr) minmax(270px, 0.72fr); gap: 12px; align-items: center; width: min(760px, 100%); margin: 18px 0 14px; border: 1px solid rgba(250, 249, 246, 0.42); border-radius: 16px; padding: 10px; background: var(--ebro-glass); color: var(--ink); box-shadow: 0 14px 34px rgba(10, 20, 17, 0.22); backdrop-filter: blur(14px); }
      .audience-switch.is-first-visit { animation: audiencePulse 1.8s var(--ease-out) 1; }
      .audience-switch-copy { display: grid; gap: 2px; min-width: 0; }
      .audience-switch-copy span { color: var(--muted); font-size: 0.72rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
      .audience-switch-copy strong { color: var(--green-900); font-size: clamp(0.96rem, 1.45vw, 1.12rem); line-height: 1.08; }
      .audience-switch-note { grid-column: 1 / -1; margin: -2px 2px 0; color: var(--muted); font-size: 0.86rem; font-weight: 600; }
      .audience-toggle { position: relative; display: grid; grid-template-columns: 1fr 1fr; min-height: 50px; border: 1px solid var(--line); border-radius: var(--radius-pill); padding: 4px; background: var(--sunken); box-shadow: inset 0 1px 2px rgba(42,39,34,.08); }
      .audience-toggle-indicator { position: absolute; top: 4px; bottom: 4px; left: 4px; width: calc(50% - 4px); border-radius: var(--radius-pill); background: var(--green); box-shadow: var(--shadow-brand); transition: transform 360ms var(--ease-spring), background 220ms var(--ease-out); }
      .audience-switch[data-audience="owner"] .audience-toggle-indicator { transform: translateX(100%); background: var(--clay); box-shadow: 0 6px 20px rgba(217, 99, 42, 0.28); }
      .audience-toggle button { position: relative; z-index: 1; display: grid; gap: 0; place-items: center; border: 0; border-radius: var(--radius-pill); padding: 7px 10px; color: var(--muted); background: transparent; font-weight: 600; line-height: 1.08; cursor: pointer; transition: color 220ms var(--ease-out), transform 220ms var(--ease-out); }
      .audience-toggle button:hover { transform: translateY(-1px); }
      .audience-toggle button.is-active { color: #fff; }
      .audience-toggle small { font-size: 0.68rem; font-weight: 600; opacity: .88; }
      /* Compact, subtle variant docked in the top bar next to the logo */
      .audience-switch--compact { width: auto; margin: 0 0 0 4px; padding: 0; border: 0; background: none; box-shadow: none; backdrop-filter: none; display: inline-flex; align-items: center; flex: 0 0 auto; }
      .audience-switch--compact .audience-toggle { min-height: 36px; padding: 3px; gap: 2px; background: transparent; border: 1px solid var(--line); box-shadow: none; }
      .audience-switch--compact .audience-toggle-indicator { top: 3px; bottom: 3px; left: 3px; width: calc(50% - 3px); background: var(--surface-brand-soft); box-shadow: none; }
      .audience-switch--compact[data-audience="owner"] .audience-toggle-indicator { transform: translateX(100%); background: var(--surface-accent-soft); box-shadow: none; }
      .audience-switch--compact .audience-toggle button { padding: 4px 14px; font-size: 0.82rem; white-space: nowrap; color: var(--muted); }
      .audience-switch--compact .audience-toggle button.is-active { color: var(--text-brand); }
      .audience-switch--compact[data-audience="owner"] .audience-toggle button[data-audience-option="owner"].is-active { color: var(--accent); }
      @media (max-width: 600px) {
        .site-header { flex-wrap: wrap; row-gap: 0; }
        .audience-switch--compact { display: inline-flex; order: 9; flex-basis: 100%; margin: 8px 0 2px; }
        .audience-switch--compact .audience-toggle { width: 100%; }
      }
      .audience-owner-panel { display: none; width: min(760px, 100%); margin-top: 16px; border: 1px solid rgba(250, 249, 246, 0.35); border-radius: var(--radius-lg); padding: clamp(16px, 2.4vw, 22px); background: var(--ebro-glass); color: var(--ink); box-shadow: 0 16px 40px rgba(10, 20, 17, 0.22); backdrop-filter: blur(14px); }
      html[data-audience="owner"] .audience-owner-panel { display: grid; gap: 16px; animation: audiencePanelIn 300ms var(--ease-out); }
      html[data-audience="owner"] .hero-search { display: none; }
      html[data-audience="owner"] .marketplace { display: none; }
      .audience-owner-panel span { color: var(--clay-600); font-size: 0.76rem; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
      .audience-owner-panel strong { display: block; margin-top: 4px; color: var(--green-900); font-size: clamp(1.12rem, 2.2vw, 1.55rem); line-height: 1.05; }
      .audience-owner-panel p { margin: 8px 0 0; color: var(--ink-soft); font-size: .98rem; font-weight: 600; }
      .audience-owner-actions { display: flex; flex-wrap: wrap; gap: 10px; }
      .audience-owner-actions .button { text-decoration: none; }
      .hero-benefits { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; width: min(760px, 100%); margin: 0 0 16px; }
      .hero-benefit { display: flex; align-items: center; gap: 8px; border: 1px solid rgba(250,249,246,.24); border-radius: 14px; padding: 8px 10px; color: #fff; background: rgba(250,249,246,.10); font-weight: 600; font-size: .88rem; backdrop-filter: blur(10px); }
      .hero-benefit svg { width: 17px; height: 17px; color: #f3c2a6; flex: 0 0 auto; }
      .trust-row { gap: 12px; }
      .trust-row span { display: inline-flex; align-items: center; gap: 7px; border: 0; border-radius: 0; padding: 0; background: transparent; color: rgba(255,255,255,.93); font-size: .92rem; }
      .trust-row span svg { width: 17px; height: 17px; color: #f3c2a6; }
      .filter-panel .button.ghost, #resetAvailability { border-color: var(--green); color: var(--text-brand); font-weight: 600; }
      .enhanced-filter-row { display: grid; gap: 14px; }
      .enhanced-filter-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .quick-filters [data-quick="deposit"] { display: none !important; }
      .marketplace-layout { grid-template-columns: 260px minmax(0, 1.3fr) minmax(330px, 0.9fr); }
      .google-map-wrap { min-height: 560px; background: var(--green-900); }
      .listings-map .leaflet-tile { filter: saturate(.72) hue-rotate(32deg) contrast(.96) brightness(1.02); }
      .listings-map::after, .detail-map::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(135deg, rgba(31,138,87,.12), rgba(217,99,42,.05)); z-index: 410; mix-blend-mode: multiply; }
      .map-copy { border-top: 1px solid var(--line); background: var(--surface); }
      .map-copy strong { font-size: 1rem; }
      .map-addresses { display: none; }
      .property-card { border-radius: var(--radius-lg); }
      .property-body { gap: 11px; }
      .property-title-row .section-kicker, #detailKicker { color: var(--text-brand); font-size: .82rem; letter-spacing: .055em; }
      .property-body > p { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .amenity-list span { display: inline-flex; align-items: center; gap: 5px; }
      .amenity-list span svg { width: 14px; height: 14px; color: var(--green); }
      .property-meta span { display: inline-flex; align-items: center; gap: 5px; }
      .property-meta span svg { width: 14px; height: 14px; }
      .how-section.is-slogan { grid-template-columns: .8fr 1.2fr; align-items: center; }
      .how-section.is-slogan .steps article { min-height: 150px; }
      .how-section.is-slogan .steps article svg { width: 22px; height: 22px; color: var(--green); }
      .site-footer { flex-wrap: wrap; }
      .footer-legal-note { flex-basis: 100%; margin: 2px 0 0; color: var(--muted); font-size: .82rem; }
      .footer-legal-note a { color: var(--text-brand); font-weight: 600; }
      .support-fab { position: fixed; right: 22px; bottom: 22px; z-index: 70; display: inline-flex; align-items: center; gap: 9px; border: 0; border-radius: var(--radius-pill); padding: 12px 16px; color: #fff; background: var(--green); font-weight: 600; box-shadow: var(--shadow-brand); cursor: pointer; }
      .support-fab svg { width: 18px; height: 18px; }
      .support-panel { position: fixed; right: 22px; bottom: 82px; z-index: 70; display: none; width: min(360px, calc(100vw - 32px)); border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 18px; background: var(--surface); box-shadow: var(--shadow); }
      .support-panel.is-open { display: grid; gap: 12px; animation: audiencePanelIn 180ms var(--ease-out); }
      .support-panel h3, .support-panel p { margin: 0; }
      .support-panel textarea { min-height: 92px; }
      .support-panel-actions { display: flex; gap: 8px; }
      .detail-media { background-size: cover !important; background-repeat: no-repeat !important; background-position: center !important; background-color: var(--sunken); }
      .detail-gallery { display: flex; gap: 8px; overflow-x: auto; padding: 10px 0 0; }
      .gallery-thumb { flex: 0 0 92px; height: 66px; background-size: cover; }
      .detail-media-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
      .detail-media-tabs a, .detail-media-tabs button { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--line); border-radius: var(--radius-pill); padding: 9px 12px; background: var(--surface); color: var(--text-brand); font-weight: 600; text-decoration: none; cursor: pointer; }
      .detail-media-tabs svg { width: 16px; height: 16px; }
      .detail-highlights, .trust-detail-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 18px 0; }
      .detail-highlight, .trust-detail-card { border: 1px solid var(--line); border-radius: 14px; padding: 12px; background: var(--surface); font-weight: 600; color: var(--ink); }
      .detail-highlight svg, .trust-detail-card svg { width: 18px; height: 18px; color: var(--green); margin-bottom: 6px; }
      .share-social-row { display: flex; flex-wrap: nowrap; gap: 8px; margin-top: 10px; }
      .share-social-row a { display: inline-flex; justify-content: center; align-items: center; width: 42px; height: 42px; border: 1px solid var(--line); border-radius: var(--radius-sm); text-decoration: none; color: var(--text-muted); background: var(--surface); transition: color 120ms var(--ease-out), border-color 120ms var(--ease-out); }
      .share-social-row a:hover { color: var(--text-brand); border-color: var(--line-strong); }
      .share-social-row svg { width: 18px; height: 18px; }
      .booking-widget { gap: 10px; }
      .booking-widget h4, .movein-box h4 { margin-bottom: 2px; color: var(--text-brand); font-size: .92rem; letter-spacing: .045em; }
      .booking-widget label { font-size: .82rem; gap: 5px; }
      .booking-widget input, .booking-widget textarea { min-height: 42px; font-size: .96rem; }
      .movein-rows li, #detailMoveInRows li { gap: 12px; font-size: .92rem; }
      .booking-note { font-size: .82rem; line-height: 1.35; }
      .booking-tip { align-items: flex-start; }
      .gallery-lightbox { position: fixed; inset: 0; z-index: 120; display: none; place-items: center; padding: 28px; background: rgba(10, 20, 17, .86); }
      .gallery-lightbox.is-open { display: grid; }
      .gallery-lightbox img { max-width: min(1100px, 92vw); max-height: 82vh; object-fit: contain; border-radius: 18px; box-shadow: var(--shadow); background: var(--sunken); }
      .gallery-lightbox button { position: absolute; border: 0; border-radius: var(--radius-pill); padding: 10px 13px; color: var(--ink); background: var(--surface); font-weight: 600; cursor: pointer; }
      .gallery-close { top: 20px; right: 20px; }
      .gallery-prev { left: 20px; top: 50%; transform: translateY(-50%); }
      .gallery-next { right: 20px; top: 50%; transform: translateY(-50%); }
      .owner-extra-strip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; width: min(1240px, calc(100% - 38px)); margin: 20px auto 0; }
      .owner-extra-card { border: 1px solid var(--line); border-radius: 16px; padding: 18px; background: var(--surface); box-shadow: var(--shadow-xs); }
      .owner-extra-card svg { width: 22px; height: 22px; color: var(--green); }
      .owner-extra-card h3 { margin-top: 8px; }
      .owner-extra-card p { margin-bottom: 0; }
      body.owner-page .header-actions .admin-link[href="partner.html"] { display: none; }
      @keyframes audiencePulse { 0% { box-shadow: 0 0 0 0 rgba(250,249,246,0), 0 14px 34px rgba(10,20,17,.22); transform: translateY(0); } 38% { box-shadow: 0 0 0 8px rgba(250,249,246,.22), 0 20px 48px rgba(10,20,17,.30); transform: translateY(-2px); } 100% { box-shadow: 0 0 0 0 rgba(250,249,246,0), 0 14px 34px rgba(10,20,17,.22); transform: translateY(0); } }
      @keyframes audiencePanelIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      @media (prefers-reduced-motion: reduce) { .audience-switch.is-first-visit, html[data-audience="owner"] .audience-owner-panel, .support-panel.is-open { animation: none; } .audience-toggle-indicator, .audience-toggle button { transition: none; } }
      @media (max-width: 1180px) { .marketplace-layout { grid-template-columns: 260px minmax(0, 1fr); } .map-panel { grid-column: 1 / -1; } .google-map-wrap { min-height: 500px; } }
      @media (max-width: 820px) { .marketplace-layout { grid-template-columns: 1fr; } .hero .eyebrow { white-space: normal; font-size: clamp(.78rem, 3.2vw, .92rem); padding: 8px 12px; } .audience-switch { grid-template-columns: 1fr; gap: 10px; padding: 10px; } .audience-toggle { min-height: 48px; } .hero-benefits { grid-template-columns: 1fr 1fr; } .enhanced-filter-pair { grid-template-columns: 1fr; } .google-map-wrap { min-height: 420px; } .owner-extra-strip { grid-template-columns: 1fr; } .share-social-row { grid-template-columns: 1fr; } .support-fab { right: 14px; bottom: 14px; } .support-panel { right: 14px; bottom: 72px; } }
    `;
    document.head.appendChild(style);
  }

  function preferredAudience() {
    try { return localStorage.getItem(AUDIENCE_KEY) === "owner" ? "owner" : "tenant"; } catch { return "tenant"; }
  }

  function isFirstAudienceVisit() {
    try { return localStorage.getItem(AUDIENCE_SEEN_KEY) !== "true"; } catch { return false; }
  }

  function markAudienceSeen() {
    try { localStorage.setItem(AUDIENCE_SEEN_KEY, "true"); } catch { /* ignore */ }
  }

  function createAudienceSwitch() {
    var existing = document.querySelector("[data-audience-switch]");
    if (existing) return existing;
    // Homepage-only (the mode drives the hero); rendered subtly in the top bar.
    var hero = document.querySelector(".hero");
    var header = document.querySelector(".site-header");
    var brand = header && header.querySelector(".brand");
    if (!hero || !header || !brand) return null;
    var node = document.createElement("div");
    node.className = "audience-switch audience-switch--compact";
    node.setAttribute("data-audience-switch", "");
    node.setAttribute("aria-label", "Website audience selector");
    node.innerHTML = `
      <div class="audience-toggle" role="radiogroup" aria-label="Choose company or owner version">
        <span class="audience-toggle-indicator" aria-hidden="true"></span>
        <button type="button" role="radio" data-audience-option="tenant"><span data-audience-tenant></span></button>
        <button type="button" role="radio" data-audience-option="owner"><span data-audience-owner></span></button>
      </div>
    `;
    brand.insertAdjacentElement("afterend", node);
    node.addEventListener("click", function (event) {
      var button = event.target.closest("[data-audience-option]");
      if (!button) return;
      applyAudience(button.dataset.audienceOption === "owner" ? "owner" : "tenant", true);
    });
    return node;
  }

  function createHeroBenefits() {
    if (document.querySelector("[data-hero-benefits]")) return;
    var heroSearch = document.querySelector(".hero-search");
    if (!heroSearch) return;
    var benefits = document.createElement("div");
    benefits.className = "hero-benefits";
    benefits.setAttribute("data-hero-benefits", "");
    heroSearch.insertAdjacentElement("beforebegin", benefits);
    updateHeroBenefits();
  }

  function updateHeroBenefits() {
    var node = document.querySelector("[data-hero-benefits]");
    if (!node) return;
    node.innerHTML = text("benefits").map(function (item) {
      return `<span class="hero-benefit">${icon(item[0])}<span>${item[1]}</span></span>`;
    }).join("");
    refreshIcons();
  }

  function createOwnerPanel() {
    if (document.querySelector("[data-owner-hero-panel]")) return;
    var heroSearch = document.querySelector(".hero-search");
    if (!heroSearch) return;
    var panel = document.createElement("div");
    panel.className = "audience-owner-panel";
    panel.setAttribute("data-owner-hero-panel", "");
    panel.innerHTML = `
      <div><span data-owner-panel-kicker></span><strong data-owner-panel-title></strong><p data-owner-panel-copy></p></div>
      <div class="audience-owner-actions"><a class="button primary" href="index.html#owner" data-owner-panel-primary></a><a class="button ghost" href="index.html#owner" data-owner-panel-secondary></a></div>
    `;
    heroSearch.insertAdjacentElement("afterend", panel);
  }

  function updateAudienceTexts(mode) {
    var node = document.querySelector("[data-audience-switch]");
    if (!node) return;
    node.dataset.audience = mode;
    setText(node.querySelector("[data-audience-label]"), text("switchLabel"));
    setText(node.querySelector("[data-audience-status]"), text(mode === "owner" ? "ownerStatus" : "tenantStatus"));
    setText(node.querySelector("[data-audience-hint]"), text(mode === "owner" ? "ownerHint" : "tenantHint"));
    setText(node.querySelector("[data-audience-tenant]"), text("tenant"));
    setText(node.querySelector("[data-audience-tenant-sub]"), text("tenantSub"));
    setText(node.querySelector("[data-audience-owner]"), text("owner"));
    setText(node.querySelector("[data-audience-owner-sub]"), text("ownerSub"));
    node.querySelectorAll("[data-audience-option]").forEach(function (button) {
      var active = button.dataset.audienceOption === mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-checked", String(active));
    });
  }

  function updateOwnerPanelTexts() {
    var panel = document.querySelector("[data-owner-hero-panel]");
    if (!panel) return;
    setText(panel.querySelector("[data-owner-panel-kicker]"), text("ownerPanelKicker"));
    setText(panel.querySelector("[data-owner-panel-title]"), text("ownerPanelTitle"));
    setText(panel.querySelector("[data-owner-panel-copy]"), text("ownerPanelCopy"));
    setText(panel.querySelector("[data-owner-panel-primary]"), text("ownerPanelPrimary"));
    setText(panel.querySelector("[data-owner-panel-secondary]"), text("ownerPanelSecondary"));
  }

  function updateHeroForAudience(mode) {
    var hero = document.querySelector(".hero");
    if (!hero) return;
    var trustItems = hero.querySelectorAll(".trust-row span");
    var cta = hero.querySelector(".hero-cta-row a");
    var ctaText = hero.querySelector(".hero-cta-row a span");
    if (mode === "owner") {
      setText(hero.querySelector(".eyebrow"), text("ownerKicker"));
      setText(hero.querySelector("h1"), text("ownerTitle"));
      setText(hero.querySelector(".hero-copy"), text("ownerCopy"));
      if (trustItems[0]) trustItems[0].innerHTML = `${icon("handshake")}<span>${text("ownerTrust1")}</span>`;
      if (trustItems[1]) trustItems[1].innerHTML = `${icon("building-2")}<span>${text("ownerTrust2")}</span>`;
      if (trustItems[2]) trustItems[2].innerHTML = `${icon("banknote")}<span>${text("ownerTrust3")}</span>`;
      if (cta) cta.href = "index.html#owner";
      if (ctaText) ctaText.textContent = text("ownerCta");
    } else {
      setText(hero.querySelector(".eyebrow"), siteText("hero.kicker"));
      setText(hero.querySelector("h1"), siteText("hero.title"));
      setText(hero.querySelector(".hero-copy"), siteText("hero.copy"));
      if (trustItems[0]) trustItems[0].innerHTML = `${icon("badge-check")}<span>${siteText("hero.trust1")}</span>`;
      if (trustItems[1]) trustItems[1].innerHTML = `${icon("receipt-text")}<span>${siteText("hero.trust2")}</span>`;
      if (trustItems[2]) trustItems[2].innerHTML = `${icon("calendar-check")}<span>${siteText("hero.trust3")}</span>`;
      if (cta) cta.href = "index.html#owner";
      if (ctaText) ctaText.textContent = siteText("hero.ownerCta");
    }
    refreshIcons();
  }

  function applyAudience(mode, persist) {
    mode = mode === "owner" ? "owner" : "tenant";
    // Owner portal pages are inherently owner-focused — never show tenant nav there.
    if (isOwnerPortalPage()) mode = "owner";
    if (persist) {
      try { localStorage.setItem(AUDIENCE_KEY, mode); } catch { /* ignore */ }
      markAudienceSeen();
    }
    document.documentElement.dataset.audience = mode;
    if (document.body) document.body.dataset.audience = mode;
    updateAudienceTexts(mode);
    updateOwnerPanelTexts();
    updateHeroBenefits();
    updateHeroForAudience(mode);
    // applyOwnerNav is the single authority for the header CTA + tenant-only nav
    // items across both audiences (supersedes the earlier KAN-15 CTA helper).
    applyOwnerNav(mode === "owner");
    var switchElement = document.querySelector("[data-audience-switch]");
    if (switchElement) switchElement.classList.toggle("is-first-visit", isFirstAudienceVisit() && mode === "tenant");
  }

  function initAudience() {
    createAudienceSwitch();
    // Hero benefit chips intentionally omitted — they duplicated the trust row below the search.
    createOwnerPanel();
    if (isFirstAudienceVisit()) {
      try { localStorage.setItem(AUDIENCE_KEY, "tenant"); } catch { /* ignore */ }
    }
    applyAudience(preferredAudience(), false);
  }

  function improveNavigation() {
    var firstNav = document.querySelector('.site-header .nav-links a[href="#search"], .site-header .nav-links a[href="index.html#search"]');
    if (firstNav) {
      firstNav.href = firstNav.getAttribute("href")?.startsWith("index") ? "index.html#top" : "#top";
      firstNav.textContent = text("homeNav");
    }
  }

  // Partner/owner portal pages have no tenant browsing context, so they should
  // always present owner-focused header navigation regardless of stored audience.
  function isOwnerPortalPage() {
    // The homepage carries an audience switch (and an in-page owner section), so
    // it is never a dedicated portal — only standalone owner pages qualify.
    if (document.querySelector("[data-audience-switch], .hero")) return false;
    return Boolean(
      document.querySelector("#partnerLoading, #partnerSignedOut, #partnerDashboard, [data-owner-portal]")
    );
  }

  // Owner-facing states must drop tenant-only header items (Find a stay,
  // My account) and surface owner-relevant actions instead (KAN-26).
  function applyOwnerNav(isOwner) {
    // Admin pages ship their own static admin nav (KAN-28); the tenant/owner
    // audience CTA must not overwrite it.
    if (isAdminPage()) return;
    var headerActions = document.querySelector(".header-actions");
    if (!headerActions) return;

    // "My account" is the tenant booking account; hide it in owner states.
    var account = headerActions.querySelector(".admin-link[href*='account.html']");
    if (account) account.hidden = isOwner;

    // Primary CTA: tenant search vs. owner onboarding/portal destination.
    // Admin pre-login pages own their CTA statically (Acceso administración).
    var cta = isAdminPage() ? null : headerActions.querySelector(".nav-cta");
    if (cta) {
      if (cta.dataset.tenantHref === undefined) cta.dataset.tenantHref = cta.getAttribute("href") || "#search";
      if (isOwner) {
        cta.removeAttribute("data-i18n");
        var onPortal = isOwnerPortalPage();
        cta.textContent = text(onPortal ? "ownerNavDashboard" : "ownerNavCta");
        // Homepage owners route to the owner lead-form anchor (shared with the
        // in-page owner CTAs); standalone portal pages go to the portal itself.
        cta.setAttribute("href", onPortal ? "partner.html" : "index.html#owner-apply");
      } else {
        cta.setAttribute("data-i18n", "nav.cta");
        cta.textContent = siteText("nav.cta");
        cta.setAttribute("href", cta.dataset.tenantHref);
      }
    }
  }

  function enhanceSearchFilters() {
    var form = document.querySelector("#availabilityFilter");
    if (!form || form.querySelector("[data-enhanced-filters]")) return;
    var block = document.createElement("div");
    block.className = "enhanced-filter-row";
    block.setAttribute("data-enhanced-filters", "");
    block.innerHTML = `
      <label><span data-extra-address-label></span><input id="addressQuery" name="addressQuery" type="search" data-extra-address-placeholder></label>
      <div class="enhanced-filter-pair">
        <label><span data-extra-bedrooms-label></span><select id="minBedrooms" name="minBedrooms"><option value="0" data-extra-any-bedrooms></option><option value="1">1+</option><option value="2">2+</option><option value="3">3+</option><option value="4">4+</option></select></label>
        <label><span data-extra-bathrooms-label></span><select id="minBathrooms" name="minBathrooms"><option value="0" data-extra-any-bathrooms></option><option value="1">1+</option><option value="2">2+</option><option value="3">3+</option></select></label>
      </div>
    `;
    var typeLabel = form.querySelector("#propertyType")?.closest("label");
    if (typeLabel) typeLabel.insertAdjacentElement("afterend", block);
    else form.prepend(block);

    var amenities = form.querySelector(".checkbox-group");
    if (amenities) {
      ["heating", "kitchen", "terrace", "dishwasher", "tv", "microwave", "oven"].forEach(function (amenity) {
        if (amenities.querySelector(`input[value="${amenity}"]`)) return;
        var label = document.createElement("label");
        label.innerHTML = `<input type="checkbox" name="amenities" value="${amenity}"> <span>${siteText(`amenity.${amenity}`)}</span>`;
        amenities.appendChild(label);
      });
    }

    var reset = form.querySelector("#resetAvailability");
    if (reset) reset.textContent = text("filtersClear");

    form.addEventListener("input", function () { window.setTimeout(applyEnhancedListingFilters, 0); });
    form.addEventListener("change", function () { window.setTimeout(applyEnhancedListingFilters, 0); });
    form.addEventListener("reset", function () {
      window.setTimeout(applyEnhancedListingFilters, 0);
    });
    updateEnhancedFilterText();
  }

  function updateEnhancedFilterText() {
    setText("[data-extra-address-label]", text("filtersAddress"));
    setText("[data-extra-bedrooms-label]", text("filtersBedrooms"));
    setText("[data-extra-bathrooms-label]", text("filtersBathrooms"));
    var address = document.querySelector("[data-extra-address-placeholder]");
    if (address) address.placeholder = text("filtersAddressPlaceholder");
    document.querySelectorAll("[data-extra-any-bedrooms], [data-extra-any-bathrooms]").forEach(function (node) { node.textContent = text("filtersAny"); });
    var reset = document.querySelector("#resetAvailability");
    if (reset) reset.textContent = text("filtersClear");
    var deposit = document.querySelector('[data-quick="deposit"]');
    if (deposit) deposit.remove();
    var mapTitle = document.querySelector(".map-copy strong");
    var mapCopy = document.querySelector(".map-copy span");
    if (mapTitle) mapTitle.textContent = text("mapTitle");
    if (mapCopy) mapCopy.textContent = text("mapCopy");
  }

  function propertyById(id) {
    try {
      if (typeof properties === "undefined") return null;
      return properties.find(function (item) { return String(item.id) === String(id); }) || null;
    } catch { return null; }
  }

  function propertySearchText(property) {
    if (!property) return "";
    var parts = [property.address, property.addressKey, property.city, siteText(property.areaKey), siteText(property.nameKey), siteText(property.copyKey), siteText(property.detailsKey)];
    return parts.filter(Boolean).join(" ").toLowerCase();
  }

  // KAN-11: enhanced/address filters no longer hide cards post-hoc.
  // They feed the SAME filtered list that site.js renderProperties uses to draw
  // cards, the result count AND the map markers — one source of truth. We just
  // re-run that single pipeline; the filter values are read back inside
  // renderProperties via getEnhancedFilters(), so no stale hidden cards remain.
  function applyEnhancedListingFilters() {
    if (!document.querySelector("#propertyGrid")) return;
    if (typeof window.renderProperties === "function") window.renderProperties();
  }

  function amenityIcon(label) {
    var lower = String(label || "").toLowerCase();
    if (lower.includes("wifi")) return "wifi";
    if (lower.includes("mesa") || lower.includes("desk")) return "briefcase-business";
    if (lower.includes("calef") || lower.includes("heating")) return "flame";
    if (lower.includes("cocina") || lower.includes("kitchen")) return "utensils";
    if (lower.includes("terra") || lower.includes("balc")) return "trees";
    if (lower.includes("lavadora") || lower.includes("washing")) return "washing-machine";
    if (lower.includes("lavava") || lower.includes("dish")) return "glass-water";
    if (lower.includes("aire") || lower.includes("air")) return "snowflake";
    if (lower.includes("ascensor") || lower.includes("lift")) return "arrow-up-down";
    if (lower.includes("parking")) return "car";
    return "check";
  }

  function decoratePropertyCards() {
    document.querySelectorAll(".amenity-list > span").forEach(function (span) {
      if (span.querySelector("svg") || span.querySelector("i")) return;
      span.innerHTML = `${icon(amenityIcon(span.textContent))}<span>${span.textContent}</span>`;
    });
    document.querySelectorAll(".property-meta > span").forEach(function (span) {
      if (span.querySelector("svg") || span.querySelector("i")) return;
      var lower = span.textContent.toLowerCase();
      var name = lower.includes("hab") || lower.includes("bed") ? "bed-double" : lower.includes("baño") || lower.includes("bath") ? "bath" : lower.includes("persona") || lower.includes("people") ? "users" : lower.includes("disp") || lower.includes("available") ? "calendar-check" : "check-circle";
      span.innerHTML = `${icon(name)}<span>${span.textContent}</span>`;
    });
    refreshIcons();
  }

  function observeListings() {
    var grid = document.querySelector("#propertyGrid");
    if (!grid || grid.dataset.enhancedObserved) return;
    grid.dataset.enhancedObserved = "true";
    // renderProperties (site.js) owns the filtered card list now; when it rewrites
    // the grid we only re-decorate (icons). We must NOT re-run the
    // filter here or we would recurse with renderProperties' own DOM writes.
    new MutationObserver(function () {
      decoratePropertyCards();
    }).observe(grid, { childList: true });
    grid.addEventListener("click", function () { window.setTimeout(function () { decoratePropertyCards(); }, 50); });
  }

  function simplifyValueAndHow() {
    var whyTitle = document.querySelector("#why h2");
    var whyLead = document.querySelector("#why .value-lead");
    if (whyTitle) whyTitle.textContent = text("whyTitle");
    if (whyLead) whyLead.textContent = text("whyLead");
    var how = document.querySelector(".how-section#how, #how.how-section");
    if (!how) return;
    how.classList.add("is-slogan");
    var kicker = how.querySelector(".section-kicker");
    var h2 = how.querySelector("h2");
    if (kicker) kicker.textContent = text("howKicker");
    if (h2) h2.textContent = text("howTitle");
    var steps = how.querySelector(".steps");
    if (steps) {
      steps.innerHTML = text("howSteps").map(function (item, idx) {
        return `<article>${icon(item[0])}<span>0${idx + 1}</span><h3>${item[1]}</h3><p>${item[2]}</p></article>`;
      }).join("");
    }
    refreshIcons();
  }

  function addFooterLegal() {
    var footer = document.querySelector(".site-footer");
    if (!footer) return;
    var yearEl = footer.querySelector("#year");
    if (yearEl && !yearEl.textContent) yearEl.textContent = new Date().getFullYear();
    var note = footer.querySelector(".footer-legal-note");
    if (!note) {
      note = document.createElement("p");
      note.className = "footer-legal-note";
      footer.appendChild(note);
    }
    note.innerHTML = `${text("legal")} <a href="privacy.html">${siteText("nav.privacy")}</a>`;
  }

  function enhanceDetailPage() {
    if (!document.querySelector(".detail-page")) return;
    // The photo carousel + lightbox are owned by gallery.js now; enhance.js only
    // adds the surrounding extras (media tabs, highlights, trust strip, share).
    addDetailMediaTabs();
    addDetailHighlights();
    addTrustStrip();
    addSocialShareButtons();
  }

  function extractBackgroundUrl(value) {
    var match = String(value || "").match(/url\(["']?([^"')]+)["']?\)/);
    return match ? match[1] : "";
  }

  function collectDetailPhotos() {
    var urls = [];
    document.querySelectorAll("#detailGallery [style]").forEach(function (button) {
      var url = extractBackgroundUrl(button.style.backgroundImage);
      if (url && !urls.includes(url)) urls.push(url);
    });
    var main = extractBackgroundUrl(document.querySelector("#detailMedia")?.style.backgroundImage || "");
    if (main && !urls.includes(main)) urls.unshift(main);
    return urls;
  }

  function addDetailMediaTabs() {
    if (document.querySelector(".detail-media-tabs")) return;
    var gallery = document.querySelector("#detailGallery");
    if (!gallery) return;
    var tabs = document.createElement("div");
    tabs.className = "detail-media-tabs";
    tabs.innerHTML = `
      <button type="button" data-media-photos>${icon("images")}<span></span></button>
      <button type="button" data-media-floorplan>${icon("layout-panel-top")}<span></span></button>
      <a href="#" data-media-video>${icon("play-circle")}<span></span></a>
      <button type="button" data-media-share aria-label="${text("mediaShare")}">${icon("share-2")}</button>
    `;
    gallery.insertAdjacentElement("afterend", tabs);
    tabs.querySelector("[data-media-photos]").addEventListener("click", function () { openGallery(0); });
    tabs.querySelector("[data-media-floorplan]").addEventListener("click", function () { document.querySelector("#floorplanSection")?.scrollIntoView({ behavior: "smooth", block: "start" }); });
    tabs.querySelector("[data-media-share]").addEventListener("click", function () { document.querySelector("#shareButton")?.click(); });
    updateDetailMediaTabs();
  }

  function updateDetailMediaTabs() {
    var tabs = document.querySelector(".detail-media-tabs");
    if (!tabs) return;
    setText(tabs.querySelector("[data-media-photos] span"), text("mediaPhotos"));
    setText(tabs.querySelector("[data-media-floorplan] span"), text("mediaFloorplan"));
    setText(tabs.querySelector("[data-media-video] span"), text("mediaVideo"));
    var shareTab = tabs.querySelector("[data-media-share]");
    if (shareTab) shareTab.setAttribute("aria-label", text("mediaShare"));
    var videoSource = document.querySelector("#detailVideoButton");
    var video = tabs.querySelector("[data-media-video]");
    if (video && videoSource) {
      // Mirror the sticky-panel CTA's visibility exactly: a real video tour exists
      // only when the source button is shown AND carries a non-anchor href.
      var rawHref = videoSource.getAttribute("href");
      var hasVideo = !videoSource.hidden && Boolean(rawHref) && rawHref !== "#" && !rawHref.endsWith("#");
      video.hidden = !hasVideo;
      if (hasVideo) {
        video.href = videoSource.href;
        video.target = "_blank";
        video.rel = "noopener";
      } else {
        video.removeAttribute("href");
        video.removeAttribute("target");
        video.removeAttribute("rel");
      }
    }
    var floorplan = tabs.querySelector("[data-media-floorplan]");
    var floorplanSection = document.querySelector("#floorplanSection");
    if (floorplan && floorplanSection) floorplan.hidden = floorplanSection.hidden;
    refreshIcons();
  }

  function addDetailHighlights() {
    var meta = document.querySelector("#detailMeta");
    if (!meta || document.querySelector(".detail-highlights")) return;
    var propertyName = document.querySelector("#detailName")?.textContent || "";
    var rows = [
      ["badge-check", siteText("badge.checked")],
      ["armchair", lang() === "es" ? "Amueblado" : "Furnished"],
      ["headphones", lang() === "es" ? "Soporte 24/7" : "24/7 support"],
      ["utensils", lang() === "es" ? "Cocina equipada" : "Equipped kitchen"]
    ];
    if (propertyName.toLowerCase().includes("movera")) rows.push(["sparkles", lang() === "es" ? "Terraza" : "Terrace"]);
    var node = document.createElement("div");
    node.className = "detail-highlights";
    node.innerHTML = rows.map(function (row) { return `<div class="detail-highlight">${icon(row[0])}<div>${row[1]}</div></div>`; }).join("");
    meta.insertAdjacentElement("afterend", node);
    refreshIcons();
  }

  function addTrustStrip() {
    var content = document.querySelector(".detail-content");
    if (!content || document.querySelector(".trust-detail-strip")) return;
    var strip = document.createElement("div");
    strip.className = "trust-detail-strip";
    strip.innerHTML = [
      ["badge-check", text("trustVerified")],
      ["shield-check", text("trustDeposit")],
      ["headphones", text("trustSupport")],
      ["receipt-text", text("trustPrice")]
    ].map(function (row) { return `<div class="trust-detail-card">${icon(row[0])}<div>${row[1]}</div></div>`; }).join("");
    var firstSection = content.querySelector(".detail-section");
    if (firstSection) firstSection.insertAdjacentElement("beforebegin", strip);
    refreshIcons();
  }

  function addSocialShareButtons() {
    var share = document.querySelector("#shareButton");
    if (!share || document.querySelector(".share-social-row")) return;
    var url = encodeURIComponent(window.location.href);
    var title = encodeURIComponent(document.title || "Ebrostay");
    var row = document.createElement("div");
    row.className = "share-social-row";
    row.innerHTML = `
      <a href="https://www.linkedin.com/sharing/share-offsite/?url=${url}" target="_blank" rel="noopener" aria-label="${text("shareLinkedin")}"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.44-2.13 2.94v5.67H9.35V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.22.79 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z"/></svg></a>
      <a href="${whatsappLink(window.location.href)}" target="_blank" rel="noopener" aria-label="${text("shareWhatsapp")}"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.05 4.91A9.82 9.82 0 0 0 12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.86 9.86 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.91-7.02zM12.05 20.15a8.23 8.23 0 0 1-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23a8.2 8.2 0 0 1 5.82 2.41 8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.39.11-.51.11-.11.25-.29.37-.43.13-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28z"/></svg></a>
      <a href="mailto:?subject=${title}&body=${url}" aria-label="${text("shareEmail")}"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 4h18a1 1 0 0 1 1 1v.4l-10 6.1L2 5.4V5a1 1 0 0 1 1-1zm-1 3.66V19a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V7.66l-9.48 5.78a1 1 0 0 1-1.04 0L2 7.66z"/></svg></a>
    `;
    share.insertAdjacentElement("afterend", row);
  }

  var lightboxIndex = 0;
  function initGalleryLightbox() {
    if (document.querySelector(".gallery-lightbox")) return;
    var box = document.createElement("div");
    box.className = "gallery-lightbox";
    box.innerHTML = `<button class="gallery-close" type="button">×</button><button class="gallery-prev" type="button">‹</button><img alt="Ebrostay gallery"><button class="gallery-next" type="button">›</button>`;
    document.body.appendChild(box);
    box.querySelector(".gallery-close").addEventListener("click", closeGallery);
    box.querySelector(".gallery-prev").addEventListener("click", function () { moveGallery(-1); });
    box.querySelector(".gallery-next").addEventListener("click", function () { moveGallery(1); });
    box.addEventListener("click", function (event) { if (event.target === box) closeGallery(); });
    document.querySelector("#detailMedia")?.addEventListener("dblclick", function () { openGallery(0); });
    document.querySelector("#detailGallery")?.addEventListener("dblclick", function (event) {
      var thumb = event.target.closest("[data-photo-index]");
      openGallery(thumb ? Number(thumb.dataset.photoIndex) : 0);
    });
    document.addEventListener("keydown", function (event) {
      if (!box.classList.contains("is-open")) return;
      if (event.key === "Escape") closeGallery();
      if (event.key === "ArrowLeft") moveGallery(-1);
      if (event.key === "ArrowRight") moveGallery(1);
    });
  }

  function openGallery(index) {
    // The detail carousel owns the lightbox; the media "Photos" tab just opens it.
    if (window.__ebroGallery) { window.__ebroGallery.openLightbox(index || 0); return; }
    var photos = collectDetailPhotos();
    if (!photos.length) return;
    lightboxIndex = Math.max(0, Math.min(index || 0, photos.length - 1));
    var box = document.querySelector(".gallery-lightbox");
    if (!box) return;
    box.querySelector("img").src = photos[lightboxIndex];
    box.classList.add("is-open");
  }

  function closeGallery() {
    document.querySelector(".gallery-lightbox")?.classList.remove("is-open");
  }

  function moveGallery(direction) {
    var photos = collectDetailPhotos();
    if (!photos.length) return;
    lightboxIndex = (lightboxIndex + direction + photos.length) % photos.length;
    document.querySelector(".gallery-lightbox img").src = photos[lightboxIndex];
  }

  function addOwnerExtras() {
    if (!document.querySelector(".owner-hero")) return;
    document.body.classList.add("owner-page");
    var featureSection = document.querySelector(".owner-features");
    if (!featureSection) return;
    var items = [
      ["sofa", "ownerExtraFurnish", "ownerExtraFurnishCopy"],
      ["clipboard-check", "ownerExtraMove", "ownerExtraMoveCopy"],
      ["bar-chart-3", "ownerExtraStats", "ownerExtraStatsCopy"]
    ];
    var existing = featureSection.querySelectorAll("[data-owner-extra]");
    if (existing.length === items.length) {
      // Re-sync text on language change (cards already injected).
      existing.forEach(function (card, i) {
        setText(card.querySelector("h3"), text(items[i][1]));
        setText(card.querySelector("p"), text(items[i][2]));
      });
    } else if (!existing.length) {
      items.forEach(function (item) {
        var card = document.createElement("div");
        card.className = "feature-card";
        card.setAttribute("data-owner-extra", "");
        card.innerHTML = `<span class="feature-icon">${icon(item[0])}</span><h3>${text(item[1])}</h3><p>${text(item[2])}</p>`;
        featureSection.appendChild(card);
      });
    }
    refreshIcons();
  }

  function addSupportAssistant() {
    if (document.querySelector(".support-fab")) return;
    var panel = document.createElement("div");
    panel.className = "support-panel";
    panel.innerHTML = `
      <h3></h3><p></p><textarea></textarea>
      <div class="support-panel-actions"><button class="button primary" type="button" data-support-send></button><button class="button ghost" type="button" data-support-close>×</button></div>
    `;
    var fab = document.createElement("button");
    fab.className = "support-fab";
    fab.type = "button";
    fab.innerHTML = `${icon("message-circle")}<span></span>`;
    document.body.appendChild(panel);
    document.body.appendChild(fab);
    fab.addEventListener("click", function () { panel.classList.toggle("is-open"); });
    panel.querySelector("[data-support-close]").addEventListener("click", function () { panel.classList.remove("is-open"); });
    panel.querySelector("[data-support-send]").addEventListener("click", function () {
      var message = panel.querySelector("textarea").value.trim() || text(supportPlaceholderKey());
      window.open(whatsappLink(message), "_blank", "noopener");
    });
    updateSupportText();
    refreshIcons();
  }

  function assistantKey(base) {
    if (!isAdminPage()) return base;
    return "admin" + base.charAt(0).toUpperCase() + base.slice(1);
  }

  function updateSupportText() {
    var panel = document.querySelector(".support-panel");
    var fab = document.querySelector(".support-fab");
    if (fab) setText(fab.querySelector("span"), text(assistantKey("assistantOpen")));
    if (panel) {
      setText(panel.querySelector("h3"), text(assistantKey("assistantTitle")));
      setText(panel.querySelector("p"), text(supportCopyKey()));
      panel.querySelector("textarea").placeholder = text(supportPlaceholderKey());
      setText(panel.querySelector("[data-support-send]"), text(assistantKey("assistantSend")));
    }
  }

  function refreshLanguageSensitiveEnhancements() {
    applyKeyedTranslations(lang());
    improveNavigation();
    updateEnhancedFilterText();
    simplifyValueAndHow();
    addFooterLegal();
    updateSupportText();
    updateDetailMediaTabs();
    addOwnerExtras();
    applyAudience(preferredAudience(), false);
  }

  function initObservers() {
    observeListings();
    var detail = document.querySelector(".detail-page");
    if (detail && !detail.dataset.enhanceObserved) {
      detail.dataset.enhanceObserved = "true";
      new MutationObserver(function () { window.setTimeout(enhanceDetailPage, 0); }).observe(detail, { childList: true, subtree: true });
      // property.js toggles the sticky video CTA via attributes (not childList),
      // so listen for its explicit signal to re-sync the media-tabs video CTA.
      document.addEventListener("ebrostay:video-cta-updated", function () {
        window.setTimeout(updateDetailMediaTabs, 0);
      });
    }
  }

  // ---- Dark mode: light-first, dark only when the visitor opts in ----
  var THEME_KEY = "ebrostay-theme";

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  function applyTheme(theme) {
    if (theme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }

  function initThemeToggle() {
    var actions = document.querySelector(".header-actions");
    if (!actions || actions.querySelector(".theme-toggle")) return;

    var active = document.querySelector(".language-option.is-active[data-lang]");
    var lang = (active && active.dataset.lang) || document.documentElement.lang || "es";
    if (lang !== "en") lang = "es";
    var labels = {
      es: { toDark: "Activar modo oscuro", toLight: "Activar modo claro" },
      en: { toDark: "Switch to dark mode", toLight: "Switch to light mode" }
    };

    var button = document.createElement("button");
    button.type = "button";
    button.className = "theme-toggle";

    function sync() {
      var dark = currentTheme() === "dark";
      button.innerHTML = '<i data-lucide="' + (dark ? "sun" : "moon") + '"></i>';
      button.setAttribute("aria-label", dark ? labels[lang].toLight : labels[lang].toDark);
    }

    button.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      applyTheme(next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
      sync();
      refreshIcons();
    });

    sync();
    actions.insertBefore(button, actions.firstChild);
  }

  // Owner lead form (lives in the in-page owner view on the homepage).
  function initOwnerForm() {
    var form = document.querySelector("#ownerForm");
    if (!form || form.dataset.bound) return;
    form.dataset.bound = "1";
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var note = document.querySelector("#ownerFormNote");
      var data = new FormData(form);
      var backend = window.EbrostayBackend;
      if (!backend || !backend.isConfigured || !backend.isConfigured()) {
        if (note) note.textContent = siteText("owners.sentFallback");
        return;
      }
      Promise.resolve(backend.submitOwnerLead({
        name: (data.get("name") || "").toString().trim(),
        email: (data.get("email") || "").toString().trim(),
        phone: (data.get("phone") || "").toString().trim(),
        units: (data.get("units") || "").toString().trim(),
        city: (data.get("city") || "").toString().trim(),
        message: (data.get("message") || "").toString().trim()
      })).then(function (res) {
        var ok = res && res.ok;
        if (note) {
          note.textContent = ok ? siteText("owners.sent") : siteText("form.errorSend");
          note.classList.toggle("is-success", !!ok);
          note.classList.toggle("is-error", !ok);
        }
        if (ok) { if (window.umami) window.umami.track("owner-lead"); form.reset(); }
      });
    });
  }

  // Deep-link / cross-page entry into owner mode via #owner.
  function checkOwnerHash() {
    if (location.hash === "#owner") applyAudience("owner", true);
  }

  // Replace native <select> popups (unstyleable in Safari) with an accessible,
  // themed custom dropdown. The native <select> stays as the source of truth so
  // form submission and existing change-listeners keep working unchanged.
  function enhanceSelects(root) {
    var scope = root || document;
    var selects = scope.querySelectorAll("select:not([data-enhanced-select])");
    Array.prototype.forEach.call(selects, function (select) {
      if (select.multiple || select.size > 1) return;
      try {
        buildCustomSelect(select);
      } catch (e) {
        /* leave native select in place on any failure */
      }
    });
  }

  // Catch selects added after load (e.g. admin forms, geocode picker).
  function observeSelects() {
    if (window.__ebrostaySelectObserver || !document.body) return;
    var mo = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var added = mutations[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (n.nodeType !== 1) continue;
          if (n.tagName === "SELECT" || (n.querySelector && n.querySelector("select:not([data-enhanced-select])"))) {
            enhanceSelects();
            return;
          }
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    window.__ebrostaySelectObserver = mo;
  }

  function buildCustomSelect(select) {
    select.setAttribute("data-enhanced-select", "");

    var wrap = document.createElement("div");
    wrap.className = "select-ui";

    var button = document.createElement("button");
    button.type = "button";
    button.className = "select-ui__button";
    button.setAttribute("aria-haspopup", "listbox");
    button.setAttribute("aria-expanded", "false");
    if (select.id) button.setAttribute("aria-labelledby", "");

    var label = document.createElement("span");
    label.className = "select-ui__label";
    button.appendChild(label);

    var list = document.createElement("ul");
    list.className = "select-ui__list";
    list.setAttribute("role", "listbox");
    list.hidden = true;

    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);
    wrap.appendChild(button);
    wrap.appendChild(list);
    select.classList.add("select-ui__native");
    select.setAttribute("tabindex", "-1");
    select.setAttribute("aria-hidden", "true");

    var open = false;
    var activeIndex = -1;

    function syncLabel() {
      var opt = select.options[select.selectedIndex];
      label.textContent = opt ? opt.textContent : "";
    }

    function renderOptions() {
      list.innerHTML = "";
      Array.prototype.forEach.call(select.options, function (opt, i) {
        var li = document.createElement("li");
        li.className = "select-ui__option";
        li.setAttribute("role", "option");
        li.textContent = opt.textContent;
        li.dataset.index = i;
        if (opt.disabled) li.setAttribute("aria-disabled", "true");
        if (i === select.selectedIndex) li.setAttribute("aria-selected", "true");
        li.addEventListener("mousedown", function (e) {
          e.preventDefault();
          if (opt.disabled) return;
          choose(i);
        });
        li.addEventListener("mousemove", function () {
          setActive(i);
        });
        list.appendChild(li);
      });
    }

    function choose(i) {
      if (i < 0 || i >= select.options.length) return;
      select.selectedIndex = i;
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
      syncLabel();
      close();
      button.focus();
    }

    function setActive(i) {
      activeIndex = i;
      Array.prototype.forEach.call(list.children, function (li) {
        var on = +li.dataset.index === i;
        li.classList.toggle("is-active", on);
        if (on && li.scrollIntoView) {
          var lr = li.getBoundingClientRect();
          var cr = list.getBoundingClientRect();
          if (lr.bottom > cr.bottom || lr.top < cr.top) li.scrollIntoView({ block: "nearest" });
        }
      });
    }

    function position() {
      wrap.classList.remove("is-up");
      var rect = button.getBoundingClientRect();
      var spaceBelow = window.innerHeight - rect.bottom;
      var needed = Math.min(list.scrollHeight, 260) + 8;
      if (spaceBelow < needed && rect.top > spaceBelow) wrap.classList.add("is-up");
    }

    function openList() {
      if (open || select.disabled) return;
      renderOptions();
      list.hidden = false;
      open = true;
      button.setAttribute("aria-expanded", "true");
      wrap.classList.add("is-open");
      position();
      setActive(select.selectedIndex >= 0 ? select.selectedIndex : 0);
      document.addEventListener("mousedown", onDocClick, true);
      window.addEventListener("resize", close);
      window.addEventListener("scroll", close, true);
    }

    function close() {
      if (!open) return;
      list.hidden = true;
      open = false;
      button.setAttribute("aria-expanded", "false");
      wrap.classList.remove("is-open", "is-up");
      document.removeEventListener("mousedown", onDocClick, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    }

    function onDocClick(e) {
      if (!wrap.contains(e.target)) close();
    }

    button.addEventListener("click", function () {
      if (open) close();
      else openList();
    });

    button.addEventListener("keydown", function (e) {
      var key = e.key;
      if (!open) {
        if (key === "ArrowDown" || key === "ArrowUp" || key === "Enter" || key === " ") {
          e.preventDefault();
          openList();
        }
        return;
      }
      if (key === "ArrowDown") {
        e.preventDefault();
        setActive(Math.min(activeIndex + 1, select.options.length - 1));
      } else if (key === "ArrowUp") {
        e.preventDefault();
        setActive(Math.max(activeIndex - 1, 0));
      } else if (key === "Home") {
        e.preventDefault();
        setActive(0);
      } else if (key === "End") {
        e.preventDefault();
        setActive(select.options.length - 1);
      } else if (key === "Enter" || key === " ") {
        e.preventDefault();
        choose(activeIndex);
      } else if (key === "Escape") {
        e.preventDefault();
        close();
      }
    });

    // Keep label in sync when other code changes the value or translates options.
    select.addEventListener("change", syncLabel);
    var mo = new MutationObserver(syncLabel);
    mo.observe(select, { childList: true, subtree: true, characterData: true });

    syncLabel();
  }

  function boot() {
    addGlobalStyles();
    applyKeyedTranslations(lang());
    improveNavigation();
    initAudience();
    initThemeToggle();
    initOwnerForm();
    checkOwnerHash();
    enhanceSearchFilters();
    observeListings();
    decoratePropertyCards();
    simplifyValueAndHow();
    addFooterLegal();
    addSupportAssistant();
    enhanceDetailPage();
    addOwnerExtras();
    initObservers();
    enhanceSelects();
    observeSelects();
    refreshIcons();
    window.addEventListener("hashchange", checkOwnerHash);

    document.querySelectorAll("[data-lang]").forEach(function (button) {
      button.addEventListener("click", function () {
        applyKeyedTranslations(button.dataset.lang);
        window.setTimeout(refreshLanguageSensitiveEnhancements, 20);
      });
    });
    [120, 450, 1000, 1800].forEach(function (delay) {
      window.setTimeout(function () {
        enhanceSearchFilters();
        decoratePropertyCards();
        applyEnhancedListingFilters();
        enhanceDetailPage();
        addOwnerExtras();
        enhanceSelects();
        refreshIcons();
      }, delay);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

(function () {
  if (typeof SUPABASE_URL === "undefined" || !SUPABASE_URL.includes("iwxearkwuxzrlikmblxl")) return;
  var banner = document.createElement("div");
  banner.className = "staging-banner";
  banner.textContent = "STAGING";
  document.body.appendChild(banner);
})();
