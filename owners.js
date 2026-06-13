// Owners marketing page: language switch, mobile nav, and lead capture.
const languageButtons = document.querySelectorAll("[data-lang]");
let currentLanguage = localStorage.getItem("ebrostay-language") || "es";

const t = (key) => translations[currentLanguage][key] || translations.es[key] || key;

function applyLanguage(language) {
  currentLanguage = translations[language] ? language : "es";
  localStorage.setItem("ebrostay-language", currentLanguage);
  document.documentElement.lang = currentLanguage;
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-attr]").forEach((element) => {
    element.dataset.i18nAttr.split(";").forEach((pair) => {
      const [attribute, key] = pair.split(":");
      if (attribute && key) element.setAttribute(attribute, t(key));
    });
  });
  if (document.title && translations[currentLanguage]["owners.metaTitle"]) {
    document.title = t("owners.metaTitle");
  }
  languageButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.lang === currentLanguage);
  });
}

languageButtons.forEach((button) => {
  button.addEventListener("click", () => applyLanguage(button.dataset.lang));
});

const ownerForm = document.querySelector("#ownerForm");
ownerForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const note = document.querySelector("#ownerFormNote");
  const data = new FormData(ownerForm);
  if (!window.EbrostayBackend?.isConfigured()) {
    if (note) note.textContent = t("owners.sentFallback");
    return;
  }
  const { ok } = await EbrostayBackend.submitOwnerLead({
    name: data.get("name")?.toString().trim(),
    email: data.get("email")?.toString().trim(),
    phone: data.get("phone")?.toString().trim(),
    units: data.get("units")?.toString().trim(),
    city: data.get("city")?.toString().trim(),
    message: data.get("message")?.toString().trim()
  });
  if (note) {
    note.textContent = ok ? t("owners.sent") : t("form.errorSend");
    note.classList.toggle("is-success", ok);
    note.classList.toggle("is-error", !ok);
  }
  if (ok) {
    window.umami?.track("owner-lead");
    ownerForm.reset();
  }
});

document.querySelector("#year").textContent = new Date().getFullYear();
applyLanguage(currentLanguage);

if (window.EbrostayBackend?.isConfigured()) {
  EbrostayBackend.init({});
}
