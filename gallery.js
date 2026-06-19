// Swipeable photo carousel with a click-to-zoom lightbox, used on the property
// detail page. Self-contained: build it with EbrostayGallery.create({...}) and
// it wires its own pointer/keyboard handlers. The pure index helpers are split
// out so the swipe math can be unit-tested. CSS classes are "ebro-" prefixed to
// stay clear of the legacy ".gallery-*" styles injected by enhance.js.
(function (global) {
  const ZOOM = 2;

  function clampIndex(index, count) {
    if (!count || count < 1) return 0;
    return Math.max(0, Math.min(index, count - 1));
  }

  // Which slide to settle on after a horizontal drag of dx pixels: past ~20% of
  // the viewport (min 40px) moves one slide, otherwise it snaps back.
  function settleIndex(index, dx, width, count) {
    const threshold = Math.max(40, (width || 0) * 0.2);
    let next = index;
    if (dx <= -threshold) next = index + 1;
    else if (dx >= threshold) next = index - 1;
    return clampIndex(next, count);
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
      <div class="ebro-viewport" data-viewport>
        <div class="ebro-track" data-track>
          ${photos.map((url, i) => `
            <figure class="ebro-slide">
              <img src="${esc(url)}" alt="${esc(altBase)} ${i + 1}" draggable="false" loading="${i < 2 ? "eager" : "lazy"}">
            </figure>`).join("")}
        </div>
      </div>
      ${many ? `
        <button class="ebro-nav ebro-prev" type="button" data-prev aria-label="${esc(t("gallery.prev"))}">&#8249;</button>
        <button class="ebro-nav ebro-next" type="button" data-next aria-label="${esc(t("gallery.next"))}">&#8250;</button>
        <span class="ebro-counter" data-counter aria-hidden="true"></span>` : ""}
    `;
    keep.forEach((node) => media.appendChild(node));

    const viewport = media.querySelector("[data-viewport]");
    const track = media.querySelector("[data-track]");
    const counter = media.querySelector("[data-counter]");
    const prevBtn = media.querySelector("[data-prev]");
    const nextBtn = media.querySelector("[data-next]");

    if (thumbs) {
      thumbs.hidden = !many;
      thumbs.innerHTML = photos.map((url, i) => `
        <button class="gallery-thumb${i === 0 ? " is-active" : ""}" type="button"
          data-thumb="${i}" style="background-image: url('${esc(url)}')"
          aria-label="${esc(altBase)} ${i + 1}"></button>`).join("");
    }

    let index = 0;

    function update() {
      track.style.transform = `translate3d(${-index * 100}%, 0, 0)`;
      if (counter) counter.textContent = `${index + 1} / ${photos.length}`;
      if (prevBtn) prevBtn.disabled = index === 0;
      if (nextBtn) nextBtn.disabled = index === photos.length - 1;
      if (thumbs) {
        thumbs.querySelectorAll("[data-thumb]").forEach((button) => {
          const active = Number(button.dataset.thumb) === index;
          button.classList.toggle("is-active", active);
          if (active) button.scrollIntoView({ block: "nearest", inline: "nearest" });
        });
      }
    }

    function go(target) {
      index = clampIndex(target, photos.length);
      track.style.transition = "";
      update();
    }

    // --- swipe / drag (tap with no movement opens the lightbox) ---
    let drag = null;
    viewport.addEventListener("pointerdown", (event) => {
      if (event.button != null && event.button !== 0) return;
      drag = { x: event.clientX, width: viewport.clientWidth, dx: 0, moved: false };
      track.style.transition = "none";
      try { viewport.setPointerCapture(event.pointerId); } catch { /* not capturable */ }
    });
    viewport.addEventListener("pointermove", (event) => {
      if (!drag) return;
      drag.dx = event.clientX - drag.x;
      if (Math.abs(drag.dx) > 8) drag.moved = true;
      track.style.transform = `translate3d(calc(${-index * 100}% + ${drag.dx}px), 0, 0)`;
    });
    viewport.addEventListener("pointerup", () => {
      if (!drag) return;
      const finished = drag;
      drag = null;
      track.style.transition = "";
      if (finished.moved) go(settleIndex(index, finished.dx, finished.width, photos.length));
      else { update(); openLightbox(index); }
    });
    viewport.addEventListener("pointercancel", () => { if (drag) { drag = null; update(); } });

    prevBtn?.addEventListener("click", () => go(index - 1));
    nextBtn?.addEventListener("click", () => go(index + 1));
    thumbs?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-thumb]");
      if (button) go(Number(button.dataset.thumb));
    });

    // --- lightbox ---
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
        go(view); // leave the carousel on the photo the user ended on
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
      stage.addEventListener("pointerup", (event) => {
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

    update();
    return { go, openLightbox, getIndex: () => index };
  }

  const api = { clampIndex, settleIndex, create };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.EbrostayGallery = api;
})(typeof window !== "undefined" ? window : globalThis);
