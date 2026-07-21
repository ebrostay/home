// Long-form copy for /privacy — colocated per the long-form content rule
// (docs/spec-v2/06 §6.7 exception). Ported faithfully from v1
// (main:privacy.html, hardcoded ES + EN blocks) with the stack updated for
// v2: Microsoft Azure (Static Web Apps, Cosmos DB, Blob Storage — data in the
// EU, Spain Central region) instead of Supabase/GitHub Pages; sign-in via
// GitHub/Microsoft accounts instead of email+password; Umami (cookieless)
// analytics unchanged.

interface PrivacyParagraph {
  // Optional bold lead-in ("Cuenta:" / "Account:"), rendered as <strong>.
  strong?: string;
  text: string;
}

interface PrivacySection {
  title: string;
  paragraphs: PrivacyParagraph[];
}

export interface PrivacyContent {
  metaTitle: string;
  metaDescription: string;
  kicker: string;
  title: string;
  updated: string;
  sections: PrivacySection[];
  backHome: string;
}

export const privacyContent: Record<"es" | "en", PrivacyContent> = {
  es: {
    metaTitle: "Ebrostay — Privacidad y aviso legal",
    metaDescription: "Política de privacidad y aviso legal de Ebrostay.",
    kicker: "Privacidad y aviso legal",
    title: "Cómo tratamos tus datos.",
    updated: "Última actualización: julio de 2026",
    sections: [
      {
        title: "Responsable",
        paragraphs: [
          { text: "Ebrostay, Zaragoza (España). Contacto: info@ebrostay.com." },
        ],
      },
      {
        title: "Qué datos tratamos y para qué",
        paragraphs: [
          {
            strong: "Cuenta:",
            text: "inicias sesión con tu cuenta de GitHub o de Microsoft; no guardamos ninguna contraseña. Conservamos tu identificador de usuario, el proveedor de acceso y tu nombre para vincular tus solicitudes, estancias y anuncios.",
          },
          {
            strong: "Solicitudes de reserva:",
            text: "cuando solicitas una reserva guardamos sus datos (vivienda, fechas, importe estimado, nombre de los inquilinos y tu cuenta) para gestionarla y responderte. No se realiza ningún pago online; el cobro se acuerda contigo de forma separada.",
          },
          {
            strong: "Anuncios:",
            text: "si publicas una vivienda, guardamos los datos del anuncio y sus fotos para mostrarlos en la web una vez aprobados.",
          },
          {
            strong: "Formulario de contacto:",
            text: "nombre, email y mensaje, solo para responder a tu consulta.",
          },
          {
            strong: "Analítica:",
            text: "usamos Umami, una analítica sin cookies que no identifica personas ni guarda datos personales.",
          },
        ],
      },
      {
        title: "Cookies y almacenamiento local",
        paragraphs: [
          {
            text: "No usamos cookies de seguimiento ni publicidad. Al iniciar sesión, la plataforma establece una cookie técnica imprescindible para mantener tu sesión. Tu navegador guarda localmente el idioma y el tema elegidos.",
          },
        ],
      },
      {
        title: "Conservación y destinatarios",
        paragraphs: [
          {
            text: "Conservamos los datos de reservas el tiempo exigido por las obligaciones fiscales y contractuales. La web funciona sobre Microsoft Azure (Static Web Apps, Cosmos DB y Blob Storage); la base de datos y las fotos se almacenan en la Unión Europea (región Spain Central, España). El inicio de sesión lo prestan GitHub y Microsoft como proveedores de identidad.",
          },
        ],
      },
      {
        title: "Tus derechos",
        paragraphs: [
          {
            text: "Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición y portabilidad escribiendo a info@ebrostay.com. También puedes retirar en cualquier momento el acceso concedido a Ebrostay desde tu cuenta de GitHub o Microsoft. Si lo consideras necesario, puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).",
          },
        ],
      },
      {
        title: "Aviso legal",
        paragraphs: [
          {
            text: "Este sitio web y sus contenidos pertenecen a Ebrostay. Los precios mostrados incluyen la renta mensual; la fianza es reembolsable al finalizar la estancia conforme a las condiciones de cada vivienda. Para cualquier cuestión legal, escríbenos a info@ebrostay.com.",
          },
        ],
      },
    ],
    backHome: "Volver al inicio",
  },
  en: {
    metaTitle: "Ebrostay — Privacy & legal notice",
    metaDescription: "Ebrostay's privacy policy and legal notice.",
    kicker: "Privacy & legal notice",
    title: "How we handle your data.",
    updated: "Last updated: July 2026",
    sections: [
      {
        title: "Controller",
        paragraphs: [
          { text: "Ebrostay, Zaragoza (Spain). Contact: info@ebrostay.com." },
        ],
      },
      {
        title: "What data we process and why",
        paragraphs: [
          {
            strong: "Account:",
            text: "you sign in with your GitHub or Microsoft account; we never store a password. We keep your user identifier, sign-in provider and name to link your requests, stays and listings.",
          },
          {
            strong: "Booking requests:",
            text: "when you request a booking we store its details (property, dates, estimated amount, tenant names and your account) to manage it and reply to you. No payment is taken online; payment is agreed with you separately.",
          },
          {
            strong: "Listings:",
            text: "if you list a home, we store the listing details and its photos to show them on the site once approved.",
          },
          {
            strong: "Contact form:",
            text: "name, email and message, only to answer your enquiry.",
          },
          {
            strong: "Analytics:",
            text: "we use Umami, a cookie-less analytics tool that does not identify people or store personal data.",
          },
        ],
      },
      {
        title: "Cookies and local storage",
        paragraphs: [
          {
            text: "We do not use tracking or advertising cookies. When you sign in, the platform sets a strictly necessary cookie to keep your session. Your browser stores your chosen language and theme locally.",
          },
        ],
      },
      {
        title: "Retention and recipients",
        paragraphs: [
          {
            text: "We keep booking data for as long as required by tax and contractual obligations. The site runs on Microsoft Azure (Static Web Apps, Cosmos DB and Blob Storage); the database and photos are stored in the European Union (Spain Central region, Spain). Sign-in is provided by GitHub and Microsoft as identity providers.",
          },
        ],
      },
      {
        title: "Your rights",
        paragraphs: [
          {
            text: "You can exercise your rights of access, rectification, erasure, objection and portability by writing to info@ebrostay.com. You can also withdraw the access granted to Ebrostay from your GitHub or Microsoft account at any time. If you consider it necessary, you can lodge a complaint with the Spanish Data Protection Agency (aepd.es).",
          },
        ],
      },
      {
        title: "Legal notice",
        paragraphs: [
          {
            text: "This website and its contents belong to Ebrostay. Prices shown include the monthly rent; the deposit is refundable at the end of the stay according to each property's conditions. For any legal matter, write to us at info@ebrostay.com.",
          },
        ],
      },
    ],
    backHome: "Back to home",
  },
};
