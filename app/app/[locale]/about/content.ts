// Long-form copy for /about — colocated per the long-form content rule
// (docs/spec/06 §6.7 exception): prose lives next to the page, not in the
// central messages dictionary. Condensed from v1 (main:about.html, about.* /
// how.* keys), updated for the v2 marketplace model: any signed-in user can
// list a home; the Ebrostay team reviews every listing before publication.

interface AboutStep {
  title: string;
  copy: string;
}

export interface AboutContent {
  metaTitle: string;
  metaDescription: string;
  kicker: string;
  title: string;
  lead: string;
  missionLabel: string; // ledger-rule label
  missionTitle: string;
  mission: { label: string; copy: string };
  vision: { label: string; copy: string };
  bridgeLabel: string;
  bridgeTitle: string;
  bridgeCopy: [string, string];
  howLabel: string;
  howTitle: string;
  steps: [AboutStep, AboutStep, AboutStep];
  hostsLabel: string;
  hostsTitle: string;
  hostsLead: string;
  hostsPoints: [string, string, string];
  rootsLabel: string;
  rootsTitle: string;
  rootsCopy: string;
  ctaFind: string;
  ctaList: string;
}

export const aboutContent: Record<"es" | "en", AboutContent> = {
  es: {
    metaTitle: "Sobre Ebrostay — El puente entre empresas y propietarios",
    metaDescription:
      "Misión e historia de Ebrostay: marketplace de alquiler corporativo de media estancia en Zaragoza. Estancias de 1 a 12 meses, todo online.",
    kicker: "Sobre Ebrostay",
    title: "El puente entre empresas y propietarios.",
    lead:
      "Ebrostay conecta a las empresas que alojan a su gente con los propietarios que publican su vivienda: estancias de 1 a 12 meses en Zaragoza, con precio mensual claro y todo el proceso online.",
    missionLabel: "misión y visión",
    missionTitle: "A dónde vamos y qué hacemos cada día.",
    mission: {
      label: "Nuestra misión",
      copy:
        "Ser el puente entre empresas y propietarios, con un servicio de primer nivel para ambos lados: una vivienda que simplemente funciona para el inquilino y rentabilidad sin complicaciones para el propietario.",
    },
    vision: {
      label: "Nuestra visión",
      copy:
        "Convertirnos en la plataforma número uno de Europa de alquiler corporativo de media estancia: primero en Zaragoza y, después, ciudad a ciudad por todo el continente.",
    },
    bridgeLabel: "el puente",
    bridgeTitle: "Un puente, en todos los sentidos.",
    bridgeCopy: [
      "Nuestro logo es un puente, y encierra dos significados. El primero es puro Zaragoza: los puentes que cruzan el Ebro —el río que da nombre a Ebrostay—, como el emblemático Puente de Piedra que une las dos orillas de la ciudad desde hace siglos.",
      "El segundo es lo que hacemos cada día: a un lado, las empresas y las personas que trasladan; al otro, los propietarios y sus viviendas. Ebrostay es el puente entre ambos, y se ocupa de todo lo que hay en medio para que ninguno tenga que hacerlo.",
    ],
    howLabel: "cómo funciona",
    howTitle: "Busca, solicita y llega con todo claro.",
    steps: [
      {
        title: "Filtra",
        copy: "Elige fechas, presupuesto y capacidad para reducir la búsqueda.",
      },
      {
        title: "Revisa",
        copy: "Compara viviendas verificadas: detalles, ubicación, precio mensual y disponibilidad mes a mes.",
      },
      {
        title: "Solicita",
        copy: "Envía tu solicitud sin pagar nada ahora. Revisamos la disponibilidad y te confirmamos la reserva; el cobro y la fianza reembolsable se acuerdan contigo por separado.",
      },
    ],
    hostsLabel: "para propietarios",
    hostsTitle: "Publica tu vivienda.",
    hostsLead:
      "Cualquier persona con cuenta puede publicar en Ebrostay. Tú pones la vivienda; nosotros, el puente hasta las empresas que la necesitan.",
    hostsPoints: [
      "Inicia sesión y crea tu anuncio: fotos, precio mensual y disponibilidad.",
      "Nuestro equipo revisa cada anuncio antes de publicarlo.",
      "Gestiona la disponibilidad y las solicitudes de reserva desde tu panel.",
    ],
    rootsLabel: "zaragoza → europa",
    rootsTitle: "Con raíces en Zaragoza. Pensado para Europa.",
    rootsCopy:
      "Empezamos donde conocemos cada calle y cada trayecto, y luego llevamos el mismo método a la siguiente ciudad. Tanto si alojas a un equipo como si publicas tu vivienda, hablas con el mismo puente.",
    ctaFind: "Buscar vivienda",
    ctaList: "Publicar mi vivienda",
  },
  en: {
    metaTitle: "About Ebrostay — The bridge between companies and owners",
    metaDescription:
      "Ebrostay's mission and story: a mid-term corporate rental marketplace in Zaragoza. Stays of 1 to 12 months, fully online.",
    kicker: "About Ebrostay",
    title: "The bridge between companies and property owners.",
    lead:
      "Ebrostay connects the companies that house their people with the owners who list their homes: stays of 1 to 12 months in Zaragoza, with one clear monthly price and the whole process online.",
    missionLabel: "mission & vision",
    missionTitle: "Where we're going, and what we do every day.",
    mission: {
      label: "Our mission",
      copy:
        "To be the bridge between companies and property owners, delivering best-in-class service to both sides — a home that just works for tenants, and returns without the hassle for owners.",
    },
    vision: {
      label: "Our vision",
      copy:
        "To become Europe's number one platform for mid-term corporate rentals — proven first in Zaragoza, then city by city across the continent.",
    },
    bridgeLabel: "the bridge",
    bridgeTitle: "A bridge, in every sense.",
    bridgeCopy: [
      "Our logo is a bridge, and it carries two meanings. The first is pure Zaragoza: the bridges that cross the Ebro — the river in our name — like the landmark Puente de Piedra that has linked the two banks of the city for centuries.",
      "The second is what we do every day: on one side, companies and the people they relocate; on the other, owners and their homes. Ebrostay is the bridge between them, carrying everything in between so neither side has to.",
    ],
    howLabel: "how it works",
    howTitle: "Search, request, and arrive with everything clear.",
    steps: [
      {
        title: "Filter",
        copy: "Choose dates, budget, and capacity to narrow the search.",
      },
      {
        title: "Review",
        copy: "Compare verified homes: details, location, monthly price, and month-by-month availability.",
      },
      {
        title: "Request",
        copy: "Send your request with no payment now. We check availability and confirm your booking; payment and the refundable deposit are agreed with you separately.",
      },
    ],
    hostsLabel: "for hosts",
    hostsTitle: "List your home.",
    hostsLead:
      "Anyone with an account can list on Ebrostay. You bring the home; we bring the bridge to the companies that need it.",
    hostsPoints: [
      "Sign in and create your listing: photos, monthly price, and availability.",
      "Our team reviews every listing before it goes live.",
      "Manage availability and booking requests from your dashboard.",
    ],
    rootsLabel: "zaragoza → europe",
    rootsTitle: "Rooted in Zaragoza. Built for Europe.",
    rootsCopy:
      "We start where we know every street and every commute, then take the same playbook to the next city. Whether you're placing a team or listing a home, you're talking to the same bridge.",
    ctaFind: "Find a home",
    ctaList: "List my home",
  },
};
