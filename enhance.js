// Ebrostay — progressive enhancement: brand icons + soft scroll reveals.
// Self-contained, dependency-light, and respects reduced-motion.
(function () {
  "use strict";

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
