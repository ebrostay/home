// Ebrostay — progressive enhancement: brand icons + soft scroll reveals.
// Self-contained, dependency-light, and respects reduced-motion.
(function () {
  "use strict";

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

      @media (max-width: 820px) {
        .hero .eyebrow {
          white-space: normal;
          font-size: clamp(0.82rem, 3.4vw, 0.95rem);
          padding: 8px 12px;
        }
      }
    `;
    document.head.appendChild(style);
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
    initIcons();
    initReveals();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();