// Long-form copy for /privacy — colocated per the long-form content rule
// (docs/spec-v2/06 §6.7 exception). Ported faithfully from v1
// (main:privacy.html, hardcoded ES + EN blocks) with the stack updated for
// v2: Microsoft Azure (Static Web Apps, Cosmos DB, Blob Storage — data in the
// EU, Spain Central region) instead of Supabase/GitHub Pages; sign-in via an
// Ebrostay account (email + password) or a Microsoft account, brokered by
// Microsoft Entra
// External ID in an EU-located external tenant (ADR-027); Umami (cookieless)
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
            text: "creas una cuenta de Ebrostay con tu correo y una contraseña, o entras con tu cuenta de Microsoft. La identidad la gestiona Microsoft Entra External ID por nuestra cuenta, en un directorio alojado en la Unión Europea; nosotros nunca vemos ni almacenamos tu contraseña. Conservamos tu identificador de usuario, el método de acceso y tu nombre para vincular tus solicitudes, estancias y anuncios.",
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
            text: "No usamos cookies de seguimiento ni publicidad, por eso no verás un banner de consentimiento. Al iniciar sesión, la plataforma establece una cookie técnica imprescindible para mantener tu sesión: es estrictamente necesaria para un servicio que has solicitado tú, y por eso no requiere consentimiento (art. 22.2 LSSI-CE). Tu navegador guarda localmente el idioma, el tema y los lugares que hayas añadido a «Tus lugares».",
          },
        ],
      },
      {
        title: "Conservación y destinatarios",
        paragraphs: [
          {
            text: "Conservamos los datos de reservas el tiempo exigido por las obligaciones fiscales y contractuales. La web funciona sobre Microsoft Azure (Static Web Apps, Cosmos DB y Blob Storage); la base de datos y las fotos se almacenan en la Unión Europea (región Spain Central, España). El registro y el inicio de sesión los presta Microsoft Entra External ID como encargado del tratamiento, en un directorio ubicado en la Unión Europea. Si eliges entrar con una cuenta de Microsoft, compartes con Microsoft los datos de esa autenticación.",
          },
        ],
      },
      {
        title: "Tus derechos",
        paragraphs: [
          {
            text: "Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición y portabilidad escribiendo a info@ebrostay.com. Si entraste con una cuenta de Microsoft, también puedes revocar en cualquier momento el acceso concedido a Ebrostay desde esa cuenta. Si lo consideras necesario, puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).",
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
            text: "you create an Ebrostay account with your email address and a password, or sign in with your Microsoft account. Identity is handled on our behalf by Microsoft Entra External ID, in a directory hosted in the European Union; we never see or store your password. We keep your user identifier, sign-in method and name to link your requests, stays and listings.",
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
            text: "We use no tracking or advertising cookies, which is why you will not see a consent banner. When you sign in, the platform sets a technical cookie that is essential to keep your session: it is strictly necessary for a service you asked for, and so requires no consent (art. 22.2 LSSI-CE). Your browser locally stores your language, your theme and any places you added to “Your places”.",
          },
        ],
      },
      {
        title: "Retention and recipients",
        paragraphs: [
          {
            text: "We keep booking data for as long as required by tax and contractual obligations. The site runs on Microsoft Azure (Static Web Apps, Cosmos DB and Blob Storage); the database and photos are stored in the European Union (Spain Central region, Spain). Sign-up and sign-in are provided by Microsoft Entra External ID as a data processor, in a directory located in the European Union. If you choose to sign in with a Microsoft account, you share that authentication data with Microsoft.",
          },
        ],
      },
      {
        title: "Your rights",
        paragraphs: [
          {
            text: "You can exercise your rights of access, rectification, erasure, objection and portability by writing to info@ebrostay.com. If you signed in with a Microsoft account, you can also revoke the access granted to Ebrostay from that account at any time. If you consider it necessary, you can lodge a complaint with the Spanish Data Protection Agency (aepd.es).",
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
