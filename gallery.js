// Property photo gallery: a coverflow carousel — one large centred photo with
// its neighbours peeking (scaled down + faded) on either side, prev/next arrows,
// a thumbnail strip that doubles as navigation, and a button on the centre slide
// that opens the full (uncropped) photo in a zoomable lightbox. Build with
// EbrostayGallery.create({...}); it wires its own pointer/keyboard handlers.
// CSS classes are "ebro-" prefixed to stay clear of the legacy ".gallery-*"
// styles injected by enhance.js.
(function (global) {
  const ZOOM = 2;

  // Per-tier placement, indexed by distance from the active slide: how far the
  // neighbour sits from centre (% of its own width), how much it shrinks, and how
  // much it fades. Anything further out uses HIDDEN (fully transparent).
  const TIERS = [
    { x: 0,   scale: 1,    opacity: 1 },
    { x: 60,  scale: 0.8,  opacity: 0.72 },
    { x: 106, scale: 0.62, opacity: 0.36 }
  ];
  const HIDDEN = { x: 150, scale: 0.5, opacity: 0 };

  function clampIndex(index, count) {
    if (!count || count < 1) return 0;
    return Math.max(0, Math.min(index, count - 1));
  }

  const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");

  // Inline SVGs (Lucide chevron-left / chevron-right / maximize-2) so the carousel
  // never depends on lucide.js being loaded before it runs.
  const ICON_PREV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
  const ICON_NEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
  const ICON_EXPAND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>';

  function create(options) {
    const media = options.media;
    const thumbs = options.thumbs || null;
    const photos = (options.photos || []).filter(Boolean);
    const t = options.t || ((key) => key);
    const altBase = options.alt || "Foto";
    if (!media || photos.length === 0) return null;

    const many = photos.length > 1;
    // Keep any existing overlay children (e.g. the availability pill).
    const keep = [...media.children];

    media.classList.add("ebro-gallery");
    media.innerHTML = `
      <div class="ebro-cf" data-cf role="group" aria-roledescription="carousel" aria-label="${esc(t("gallery.carousel"))}">
        <div class="ebro-cf-track" data-cf-track>
          ${photos.map((url, i) => `
            <figure class="ebro-cf-slide" data-cf-slide="${i}" role="group" aria-roledescription="slide" aria-label="${i + 1} / ${photos.length}">
              <img src="${esc(url)}" alt="${esc(altBase)} ${i + 1}" draggable="false" loading="${i === 0 ? "eager" : "lazy"}">
            </figure>`).join("")}
        </div>
        ${many ? `<button class="ebro-cf-arrow ebro-cf-prev" type="button" data-cf-prev aria-label="${esc(t("gallery.prev"))}">${ICON_PREV}</button>` : ""}
        ${many ? `<button class="ebro-cf-arrow ebro-cf-next" type="button" data-cf-next aria-label="${esc(t("gallery.next"))}">${ICON_NEXT}</button>` : ""}
        <button class="ebro-cf-cta" type="button" data-cf-cta>${ICON_EXPAND}<span>${esc(t("gallery.open"))}</span></button>
      </div>
    `;
    keep.forEach((node) => media.appendChild(node));

    const root = media.querySelector("[data-cf]");
    const track = media.querySelector("[data-cf-track]");
    const slides = [...media.querySelectorAll(".ebro-cf-slide")];
    const prevBtn = media.querySelector("[data-cf-prev]");
    const nextBtn = media.querySelector("[data-cf-next]");
    const cta = media.querySelector("[data-cf-cta]");

    // The thumbnail strip below the stage doubles as carousel navigation.
    let thumbEls = [];
    if (thumbs) {
      thumbs.hidden = !many;
      thumbs.classList.add("ebro-cf-thumbs");
      thumbs.innerHTML = many ? photos.map((url, i) => `
        <button class="ebro-cf-thumb" type="button" data-cf-thumb="${i}" aria-label="${esc(t("gallery.goTo"))} ${i + 1}">
          <img src="${esc(url)}" alt="" draggable="false" loading="lazy">
        </button>`).join("") : "";
      thumbEls = [...thumbs.querySelectorAll("[data-cf-thumb]")];
    }

    let active = 0;

    // Place every slide relative to the active one and sync arrows + thumbs.
    function render() {
      slides.forEach((el, i) => {
        const off = i - active;
        const abs = Math.abs(off);
        const tier = abs < TIERS.length ? TIERS[abs] : HIDDEN;
        const dir = Math.sign(off);
        el.style.transform = `translate(-50%, -50%) translateX(${dir * tier.x}%) scale(${tier.scale})`;
        el.style.opacity = String(tier.opacity);
        el.style.zIndex = String(20 - abs);
        el.style.pointerEvents = tier.opacity > 0 ? "auto" : "none";
        el.classList.toggle("is-active", abs === 0);
        el.setAttribute("aria-hidden", abs === 0 ? "false" : "true");
      });
      if (prevBtn) prevBtn.disabled = active === 0;
      if (nextBtn) nextBtn.disabled = active === photos.length - 1;
      thumbEls.forEach((el, i) => {
        const on = i === active;
        el.classList.toggle("is-active", on);
        if (on) {
          el.setAttribute("aria-current", "true");
          el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
        } else {
          el.removeAttribute("aria-current");
        }
      });
    }

    function goTo(target) {
      active = clampIndex(target, photos.length);
      render();
    }

    render();

    // --- navigation wiring ---
    prevBtn?.addEventListener("click", () => goTo(active - 1));
    nextBtn?.addEventListener("click", () => goTo(active + 1));
    cta?.addEventListener("click", () => openLightbox(active));
    thumbEls.forEach((el) => el.addEventListener("click", () => goTo(Number(el.dataset.cfThumb))));

    // Clicking a side photo brings it to the centre; clicking the centre opens
    // the lightbox. A drag/swipe steps through slides and suppresses the click
    // that follows so it doesn't also open the lightbox.
    let down = null;
    let suppressClick = false;
    track.addEventListener("pointerdown", (event) => {
      if (event.button != null && event.button !== 0) return;
      down = { x: event.clientX, moved: false };
      try { track.setPointerCapture(event.pointerId); } catch { /* not capturable */ }
    });
    track.addEventListener("pointermove", (event) => {
      if (!down) return;
      if (Math.abs(event.clientX - down.x) > 6) down.moved = true;
    });
    track.addEventListener("pointerup", (event) => {
      if (!down) return;
      const { moved } = down;
      const dx = event.clientX - down.x;
      down = null;
      if (moved) {
        suppressClick = true;
        setTimeout(() => { suppressClick = false; }, 0);
        if (dx <= -40) goTo(active + 1);
        else if (dx >= 40) goTo(active - 1);
      }
    });
    track.addEventListener("pointercancel", () => { down = null; });

    track.addEventListener("click", (event) => {
      if (suppressClick) return;
      const slide = event.target.closest(".ebro-cf-slide");
      if (!slide) return;
      const i = Number(slide.dataset.cfSlide);
      if (i === active) openLightbox(active);
      else goTo(i);
    });

    // Keyboard: when the stage is focused, arrows move the carousel and
    // Enter/Space opens the active photo.
    root.tabIndex = 0;
    root.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight") { event.preventDefault(); goTo(active + 1); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); goTo(active - 1); }
      else if ((event.key === "Enter" || event.key === " ") && event.target === root) {
        event.preventDefault();
        openLightbox(active);
      }
    });

    // --- lightbox (the enlarged, uncropped view shown on click) ---
    let lightbox = null;
    function openLightbox(start) {
      if (lightbox) return;
      let view = clampIndex(start, photos.length);
      let zoom = false;
      let panX = 0;
      let panY = 0;
      let maxPanX = 0;
      let maxPanY = 0;

      const overlay = document.createElement("div");
      overlay.className = "ebro-lightbox";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.innerHTML = `
        <button class="ebro-lightbox-close" type="button" data-close aria-label="${esc(t("gallery.close"))}">&times;</button>
        ${many ? `<button class="ebro-nav ebro-prev" type="button" data-lprev aria-label="${esc(t("gallery.prev"))}">&#8249;</button>` : ""}
        <figure class="ebro-lightbox-stage" data-stage>
          <img class="ebro-lightbox-img" data-limg src="${esc(photos[view])}" alt="${esc(altBase)} ${view + 1}" draggable="false">
        </figure>
        ${many ? `<button class="ebro-nav ebro-next" type="button" data-lnext aria-label="${esc(t("gallery.next"))}">&#8250;</button>` : ""}
        ${many ? `<span class="ebro-counter" data-lcounter aria-hidden="true"></span>` : ""}
      `;
      document.body.appendChild(overlay);
      document.body.classList.add("gallery-lock");
      void overlay.offsetWidth; // force reflow so the fade/scale-in transition runs
      overlay.classList.add("is-open");

      const image = overlay.querySelector("[data-limg]");
      const stage = overlay.querySelector("[data-stage]");
      const lcounter = overlay.querySelector("[data-lcounter]");

      const applyTransform = () => {
        image.style.transform = zoom ? `translate(${panX}px, ${panY}px) scale(${ZOOM})` : "";
      };
      const resetZoom = () => { zoom = false; panX = panY = 0; image.classList.remove("is-zoomed"); applyTransform(); };
      const enableZoom = () => {
        zoom = true;
        panX = panY = 0;
        const rect = image.getBoundingClientRect();
        maxPanX = (rect.width * (ZOOM - 1)) / 2;
        maxPanY = (rect.height * (ZOOM - 1)) / 2;
        image.classList.add("is-zoomed");
        applyTransform();
      };
      const clampPan = () => {
        panX = Math.max(-maxPanX, Math.min(maxPanX, panX));
        panY = Math.max(-maxPanY, Math.min(maxPanY, panY));
      };

      function show(target, dir) {
        view = clampIndex(target, photos.length);
        resetZoom();
        image.src = photos[view];
        image.alt = `${altBase} ${view + 1}`;
        if (lcounter) lcounter.textContent = `${view + 1} / ${photos.length}`;
        // Keep the carousel in sync with the lightbox.
        goTo(view);
        image.animate?.(
          [{ opacity: 0, transform: `translateX(${(dir || 0) * 28}px)` }, { opacity: 1, transform: "none" }],
          { duration: 170, easing: "ease-out" }
        );
      }
      function close() {
        overlay.classList.remove("is-open");
        document.body.classList.remove("gallery-lock");
        document.removeEventListener("keydown", onKey);
        setTimeout(() => overlay.remove(), 200);
        lightbox = null;
      }
      function onKey(event) {
        if (event.key === "Escape") close();
        else if (event.key === "ArrowRight") show(view + 1, 1);
        else if (event.key === "ArrowLeft") show(view - 1, -1);
      }
      if (lcounter) lcounter.textContent = `${view + 1} / ${photos.length}`;

      overlay.addEventListener("click", (event) => {
        if (event.target.closest("[data-close]")) return close();
        if (event.target.closest("[data-lprev]")) return show(view - 1, -1);
        if (event.target.closest("[data-lnext]")) return show(view + 1, 1);
        // a click on the backdrop (not the image) closes
        if (!event.target.closest("[data-limg]")) close();
      });

      // image gestures: tap toggles zoom; drag pans when zoomed, swipes when not
      let lp = null;
      stage.addEventListener("pointerdown", (event) => {
        if (event.button != null && event.button !== 0) return;
        lp = { x: event.clientX, y: event.clientY, dx: 0, dy: 0, panX, panY, moved: false };
        try { stage.setPointerCapture(event.pointerId); } catch { /* not capturable */ }
      });
      stage.addEventListener("pointermove", (event) => {
        if (!lp) return;
        lp.dx = event.clientX - lp.x;
        lp.dy = event.clientY - lp.y;
        if (Math.abs(lp.dx) + Math.abs(lp.dy) > 8) lp.moved = true;
        if (zoom) { panX = lp.panX + lp.dx; panY = lp.panY + lp.dy; clampPan(); applyTransform(); }
      });
      stage.addEventListener("pointerup", () => {
        if (!lp) return;
        const finished = lp;
        lp = null;
        if (!finished.moved) {
          if (zoom) resetZoom();
          else enableZoom();
          return;
        }
        if (!zoom) {
          if (finished.dx <= -40) show(view + 1, 1);
          else if (finished.dx >= 40) show(view - 1, -1);
        }
      });
      stage.addEventListener("pointercancel", () => { lp = null; });

      document.addEventListener("keydown", onKey);
      lightbox = { close, show: (i) => show(i, 0) };
    }

    return { openLightbox, goTo };
  }

  const api = { clampIndex, create };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.EbrostayGallery = api;
})(typeof window !== "undefined" ? window : globalThis);
