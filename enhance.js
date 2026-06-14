// Ebrostay — progressive enhancement: brand icons + soft scroll reveals.
// Self-contained, dependency-light, and respects reduced-motion.
(function () {
  "use strict";

  var AUDIENCE_KEY = "ebrostay-audience";
  var AUDIENCES = ["tenant", "owner"];
  var AUDIENCE_COPY = {
    es: {
      label: "Versión del sitio",
      chooser: "Elige cómo quieres usar Ebrostay",
      tenant: "Inquilino",
      tenantHint: "Busco vivienda",
      owner: "Propietario",
      ownerHint: "Quiero alquilar",
      tenantChip: "Versión inquilino activa",
      ownerChip: "Versión propietario seleccionada",
      tenantStatus: "Estás viendo la versión para inquilinos.",
      tenantCopy: "Busca viviendas verificadas, compara condiciones y solicita tu estancia en Zaragoza.",
      tenantCta: "Empezar búsqueda",
      ownerStatus: "Has cambiado a la ruta para propietarios.",
      ownerCopy: "Descubre cómo Ebrostay gestiona tu vivienda de principio a fin y te paga en tu cuenta.",
      ownerCta: "Abrir página para propietarios"
    },
    en: {
      label: "Website version",
      chooser: "Choose how you want to use Ebrostay",
      tenant: "Tenant",
      tenantHint: "I need a home",
      owner: "Owner",
      ownerHint: "I want to rent out",
      tenantChip: "Tenant version active",
      ownerChip: "Owner version selected",
      tenantStatus: "You are viewing the tenant version.",
      tenantCopy: "Search verified homes, compare conditions, and request your stay in Zaragoza.",
      tenantCta: "Start searching",
      ownerStatus: "You switched to the owner path.",
      ownerCopy: "See how Ebrostay manages your property end to end and pays you directly.",
      ownerCta: "Open owner page"
    }
  };

  function getLanguage() {
    var activeButton = document.querySelector(".language-option.is-active[data-lang]");
    var language = activeButton?.dataset.lang || document.documentElement.lang || localStorage.getItem("ebrostay-language") || "es";
    return AUDIENCE_COPY[language] ? language : "es";
  }

  function getStoredAudience() {
    var stored = localStorage.getItem(AUDIENCE_KEY);
    return AUDIENCES.indexOf(stored) >= 0 ? stored : "tenant";
  }

  function initHeroReadability() {
    if (document.getElementById("hero-readability-styles")) return;

    var style = document.createElement("style");
    style.id = "hero-readability-styles";
    style.textContent = `
      /* Homepage hero readability: keep the Mediterranean palette, but avoid
         low-contrast terracotta text directly over photography. */
      .hero-overlay {
        background:
          linear-gradient(90deg, rgba(10, 51, 36, 0.92), rgba(13, 29, 24, 0.58) 52%, rgba(13, 29, 24, 0.18)),
          linear-gradient(0deg, rgba(10, 20, 17, 0.82), rgba(10, 20, 17, 0.16) 54%);
      }

      .hero .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 9px;
        width: fit-content;
        max-width: 100%;
        margin-bottom: 14px;
        border: 1px solid rgba(250, 249, 246, 0.72);
        border-radius: var(--radius-pill);
        padding: 9px 14px;
        background: rgba(250, 249, 246, 0.93);
        color: var(--green-900);
        font-size: clamp(0.88rem, 1.1vw, 1rem);
        line-height: 1.08;
        letter-spacing: 0.045em;
        box-shadow: 0 10px 28px rgba(10, 20, 17, 0.20);
        text-shadow: none;
      }

      .hero .eyebrow::before {
        content: "";
        flex: 0 0 auto;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--clay);
        box-shadow: 0 0 0 4px rgba(217, 99, 42, 0.16);
      }

      .hero h1,
      .hero-copy {
        text-shadow: 0 2px 18px rgba(10, 20, 17, 0.38);
      }

      .hero-copy {
        color: rgba(255, 255, 255, 0.94);
      }

      .audience-selector {
        width: min(740px, 100%);
        margin: 0 0 22px;
        border: 1px solid rgba(250, 249, 246, 0.58);
        border-radius: var(--radius-lg);
        padding: 12px;
        background: rgba(250, 249, 246, 0.94);
        color: var(--ink);
        box-shadow: 0 18px 45px rgba(10, 20, 17, 0.22);
        backdrop-filter: blur(16px);
      }

      .audience-selector-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 10px;
      }

      .audience-selector-label {
        color: var(--muted);
        font-size: 0.78rem;
        font-weight: 900;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .audience-active-chip {
        border-radius: var(--radius-pill);
        padding: 5px 10px;
        background: rgba(31, 138, 87, 0.12);
        color: var(--green-700);
        font-size: 0.8rem;
        font-weight: 900;
        white-space: nowrap;
      }

      .audience-toggle {
        position: relative;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0;
        overflow: hidden;
        border: 1px solid rgba(10, 51, 36, 0.12);
        border-radius: var(--radius-pill);
        padding: 4px;
        background: rgba(10, 51, 36, 0.08);
      }

      .audience-toggle::before {
        content: "";
        position: absolute;
        top: 4px;
        bottom: 4px;
        left: 4px;
        width: calc(50% - 4px);
        border-radius: var(--radius-pill);
        background: var(--grad-primary);
        box-shadow: var(--shadow-brand);
        transform: translateX(0);
        transition: transform 360ms var(--ease-spring), box-shadow 240ms var(--ease-out);
      }

      .audience-toggle.is-owner::before {
        transform: translateX(100%);
      }

      .audience-toggle-button {
        position: relative;
        z-index: 1;
        display: grid;
        gap: 1px;
        min-height: 58px;
        border: 0;
        border-radius: var(--radius-pill);
        padding: 9px 14px;
        color: var(--ink-soft);
        background: transparent;
        text-align: center;
        cursor: pointer;
        transition: color 200ms var(--ease-out), transform 200ms var(--ease-out);
      }

      .audience-toggle-button:hover {
        transform: translateY(-1px);
      }

      .audience-toggle-button.is-active {
        color: #fff;
      }

      .audience-role {
        font-size: clamp(0.98rem, 1.3vw, 1.14rem);
        font-weight: 950;
        line-height: 1.1;
      }

      .audience-role-hint {
        color: var(--muted);
        font-size: 0.78rem;
        font-weight: 800;
        line-height: 1.15;
      }

      .audience-toggle-button.is-active .audience-role-hint {
        color: rgba(255, 255, 255, 0.82);
      }

      .audience-status {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 5px 9px;
        margin: 10px 2px 0;
        color: var(--muted);
        font-size: 0.94rem;
        font-weight: 700;
      }

      .audience-status strong {
        color: var(--ink);
        font-weight: 950;
      }

      .audience-link {
        color: var(--green-700);
        font-weight: 950;
        text-decoration: none;
      }

      .audience-link:hover {
        text-decoration: underline;
      }

      body[data-ebrostay-audience="tenant"] .hero-search {
        box-shadow: 0 14px 40px rgba(10, 20, 17, 0.22), 0 0 0 1px rgba(250, 249, 246, 0.15) inset;
      }

      body[data-ebrostay-audience="owner"] .hero-cta-row .button {
        box-shadow: 0 0 0 3px rgba(250, 249, 246, 0.20), var(--shadow-brand);
      }

      .audience-selector.is-first-visit .audience-toggle-button.is-active {
        animation: audience-active-pulse 2.2s var(--ease-out) 3;
      }

      @keyframes audience-active-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(31, 138, 87, 0); }
        35% { box-shadow: 0 0 0 7px rgba(31, 138, 87, 0.16); }
      }

      @media (max-width: 820px) {
        .hero .eyebrow {
          white-space: normal;
          font-size: clamp(0.82rem, 3.4vw, 0.95rem);
          padding: 8px 12px;
        }

        .audience-selector {
          margin-bottom: 18px;
          padding: 10px;
        }

        .audience-selector-head,
        .audience-status {
          align-items: flex-start;
          flex-direction: column;
        }

        .audience-active-chip {
          white-space: normal;
        }

        .audience-toggle-button {
          min-height: 54px;
          padding: 8px 10px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function initAudienceSwitch() {
    var heroContent = document.querySelector(".hero-content");
    var anchor = heroContent?.querySelector(".eyebrow");
    if (!heroContent || !anchor || document.querySelector("[data-audience-selector]")) return;

    var firstVisit = !localStorage.getItem(AUDIENCE_KEY);
    var mode = getStoredAudience();
    var selector = document.createElement("div");
    selector.className = "audience-selector";
    selector.setAttribute("data-audience-selector", "");
    selector.innerHTML = `
      <div class="audience-selector-head">
        <span class="audience-selector-label"></span>
        <span class="audience-active-chip"></span>
      </div>
      <div class="audience-toggle" role="group">
        <button class="audience-toggle-button" type="button" data-audience-value="tenant" aria-pressed="false">
          <span class="audience-role"></span>
          <span class="audience-role-hint"></span>
        </button>
        <button class="audience-toggle-button" type="button" data-audience-value="owner" aria-pressed="false">
          <span class="audience-role"></span>
          <span class="audience-role-hint"></span>
        </button>
      </div>
      <p class="audience-status" role="status">
        <strong></strong>
        <span></span>
        <a class="audience-link"></a>
      </p>
    `;
    anchor.insertAdjacentElement("afterend", selector);

    var toggle = selector.querySelector(".audience-toggle");
    var buttons = selector.querySelectorAll("[data-audience-value]");
    var label = selector.querySelector(".audience-selector-label");
    var chip = selector.querySelector(".audience-active-chip");
    var statusStrong = selector.querySelector(".audience-status strong");
    var statusCopy = selector.querySelector(".audience-status span");
    var statusLink = selector.querySelector(".audience-link");

    function render() {
      var language = getLanguage();
      var copy = AUDIENCE_COPY[language];
      var isOwner = mode === "owner";

      document.body.dataset.ebrostayAudience = mode;
      selector.classList.toggle("is-first-visit", firstVisit && mode === "tenant");
      toggle.classList.toggle("is-owner", isOwner);
      toggle.setAttribute("aria-label", copy.chooser);
      label.textContent = copy.label;
      chip.textContent = isOwner ? copy.ownerChip : copy.tenantChip;
      statusStrong.textContent = isOwner ? copy.ownerStatus : copy.tenantStatus;
      statusCopy.textContent = isOwner ? copy.ownerCopy : copy.tenantCopy;
      statusLink.textContent = isOwner ? copy.ownerCta : copy.tenantCta;
      statusLink.href = isOwner ? "owners.html" : "#search";

      buttons.forEach(function (button) {
        var value = button.dataset.audienceValue;
        var active = value === mode;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
        button.querySelector(".audience-role").textContent = value === "owner" ? copy.owner : copy.tenant;
        button.querySelector(".audience-role-hint").textContent = value === "owner" ? copy.ownerHint : copy.tenantHint;
      });
    }

    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        mode = AUDIENCES.indexOf(button.dataset.audienceValue) >= 0 ? button.dataset.audienceValue : "tenant";
        firstVisit = false;
        localStorage.setItem(AUDIENCE_KEY, mode);
        render();
      });
    });

    document.querySelectorAll("[data-lang]").forEach(function (button) {
      button.addEventListener("click", function () {
        window.setTimeout(render, 0);
      });
    });

    render();
  }

  function initIcons() {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
  }

  function initReveals() {
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Elements that gently rise into view as you scroll.
    var selectors = [
      ".audience-selector",
      ".value-band > *",
      ".split-card",
      ".feature-card",
      ".steps article",
      ".compare-wrap",
      ".stat",
      ".partner-metric",
      ".how-section > div",
      ".contact-copy",
      ".inquiry-form",
      ".about-intro > *",
      ".about-cta > *",
      ".value-grid",
      ".marketplace-toolbar"
    ];
    var nodes = document.querySelectorAll(selectors.join(","));
    if (!nodes.length) return;

    if (reduce || !("IntersectionObserver" in window)) {
      nodes.forEach(function (el) { el.classList.add("reveal", "is-in"); });
      return;
    }

    nodes.forEach(function (el) { el.classList.add("reveal"); });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var el = entry.target;
          var sibs = Array.prototype.slice.call(el.parentElement ? el.parentElement.children : []);
          var idx = Math.max(0, sibs.indexOf(el));
          el.style.transitionDelay = Math.min(idx * 70, 350) + "ms";
          el.classList.add("is-in");
          io.unobserve(el);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });

    nodes.forEach(function (el) { io.observe(el); });
  }

  initHeroReadability();

  function boot() {
    initAudienceSwitch();
    initIcons();
    initReveals();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();