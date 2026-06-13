// Mobile menu toggle for the site header
document.querySelectorAll(".nav-toggle").forEach((button) => {
  button.addEventListener("click", () => {
    const open = button.closest(".site-header")?.classList.toggle("nav-open");
    button.setAttribute("aria-expanded", String(Boolean(open)));
  });
});
