// Property photo gallery: a horizontal strip of full (uncropped) photos shown
// side by side and scrolled left-to-right. Hovering a photo zooms it slightly;
// clicking one opens it enlarged in a lightbox. Build with
// EbrostayGallery.create({...}); it wires its own pointer/keyboard handlers.
// CSS classes are "ebro-" prefixed to stay clear of the legacy ".gallery-*"
// styles injected by enhance.js.
(function (global) {
  const ZOOM = 2;

  function clampIndex(index, count) {
    if (!count || count < 1) return 0;
    return Math.max(0, Math.min(index, count - 1));
  }

  const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");

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
      <div class="ebro-strip" data-strip>
        ${photos.map((url, i) => `
          <figure class="ebro-photo" data-photo="${i}" tabindex="0" role="button" aria-label="${esc(t("gallery.open"))} ${i + 1}">
            <img src="${esc(url)}" alt="${esc(altBase)} ${i + 1}" draggable="false">
          </figure>`).join("")}
      </div>
    `;
    keep.forEach((node) => media.appendChild(node));
    // The strip itself shows every photo, so the separate thumbnail row is no
    // longer needed.
    if (thumbs) { thumbs.hidden = true; thumbs.innerHTML = ""; }

    const strip = media.querySelector("[data-strip]");

    // Mouse drag-to-scroll (touch/trackpad use native horizontal scroll). A drag
    // suppresses the click that follows so it doesn't also open the lightbox.
    let down = null;
    let suppressClick = false;
    strip.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      down = { x: event.clientX, scroll: strip.scrollLeft, moved: false };
      try { strip.setPointerCapture(event.pointerId); } catch { /* not capturable */ }
    });
    strip.addEventListener("pointermove", (event) => {
      if (!down) return;
      const dx = event.clientX - down.x;
      if (Math.abs(dx) > 5) down.moved = true;
      strip.scrollLeft = down.scroll - dx;
    });
    strip.addEventListener("pointerup", () => {
      if (!down) return;
      if (down.moved) { suppressClick = true; setTimeout(() => { suppressClick = false; }, 0); }
      down = null;
    });
    strip.addEventListener("pointercancel", () => { down = null; });

    strip.addEventListener("click", (event) => {
      if (suppressClick) return;
      const figure = event.target.closest(".ebro-photo");
      if (figure) openLightbox(Number(figure.dataset.photo));
    });
    strip.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const figure = event.target.closest(".ebro-photo");
      if (figure) { event.preventDefault(); openLightbox(Number(figure.dataset.photo)); }
    });

    // --- lightbox (the enlarged view shown on click) ---
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

    return { openLightbox };
  }

  const api = { clampIndex, create };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.EbrostayGallery = api;
})(typeof window !== "undefined" ? window : globalThis);
