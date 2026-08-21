export const districtLandingPageSlugs = [
  "san-borja",
  "surco",
  "san-isidro",
  "miraflores",
  "barranco",
  "surquillo",
  "jesus-maria",
  "san-miguel",
  "magdalena",
] as const;

export type DistrictLandingPageSlug = (typeof districtLandingPageSlugs)[number];

export type DistrictLandingPage = {
  name: string;
  heading: string;
  metadataTitle: string;
  description: string;
  introduction: string;
};

export const districtLandingPages = {
  "san-borja": {
    name: "San Borja",
    heading: "Servicio de limpieza en San Borja",
    metadataTitle: "Servicio de limpieza en San Borja",
    description:
      "Reserva un servicio de limpieza para casas y departamentos en San Borja. Elige la duración, fecha y personal disponible en línea.",
    introduction:
      "Nuestros agentes de limpieza irán a tu casa o departamento cuando lo necesites. Solicitar un servicio de limpieza en San Borja es muy fácil: revisa los detalles, elige la duración y reserva en línea.",
  },
  surco: {
    name: "Surco",
    heading: "Servicio de limpieza en Surco",
    metadataTitle: "Servicio de limpieza en Surco",
    description:
      "Solicita limpieza profesional para casas y departamentos en Santiago de Surco, con horarios y duraciones que se adaptan a tu hogar.",
    introduction:
      "Nuestro equipo de agentes de limpieza está listo para ir a tu casa o departamento cuando lo necesites. Ya sea una limpieza profunda, un mantenimiento recurrente o una visita puntual, nos adaptamos a tus horarios y necesidades.",
  },
  "san-isidro": {
    name: "San Isidro",
    heading: "Servicio de limpieza en San Isidro",
    metadataTitle: "Servicio de limpieza en San Isidro",
    description:
      "Reserva servicios de limpieza por horas para casas y departamentos en San Isidro de forma rápida, segura y completamente en línea.",
    introduction:
      "Nuestros agentes de limpieza irán a tu casa o departamento cuando lo necesites. Solicitar un servicio de limpieza en San Isidro es muy fácil: mira los detalles y elige la opción adecuada para tu hogar.",
  },
  miraflores: {
    name: "Miraflores",
    heading: "Servicio de limpieza en Miraflores",
    metadataTitle: "Servicio de limpieza en Miraflores",
    description:
      "Contrata servicios de limpieza para cualquier zona de Miraflores y elige en línea la duración, fecha y agente para tu hogar.",
    introduction:
      "Solicita un servicio para cualquier zona de Miraflores. Nuestro equipo de agentes de limpieza está listo para ir a tu casa o departamento, con visitas puntuales o recurrentes que se adaptan a tus horarios y necesidades.",
  },
  barranco: {
    name: "Barranco",
    heading: "Servicio de limpieza en Barranco",
    metadataTitle:
      "Servicio de limpieza en Barranco - Casas, departamentos y Airbnb",
    description:
      "Servicios de limpieza para casas, departamentos y alojamientos Airbnb en Barranco. Reserva personal por horas desde la web.",
    introduction:
      "Atendemos casas, departamentos y alojamientos Airbnb en todo Barranco. Puedes solicitar la limpieza de espacios pequeños o de viviendas con ambientes complementarios, como jardines y terrazas.",
  },
  surquillo: {
    name: "Surquillo",
    heading: "Servicio de limpieza en Surquillo",
    metadataTitle: "Servicio de limpieza en Surquillo",
    description:
      "Solicita uno o varios servicios de limpieza para casas y departamentos en Surquillo. Reserva por horas de manera sencilla y segura.",
    introduction:
      "Haremos la limpieza de tu casa o departamento cuando la necesites. Solicitar uno o varios servicios de limpieza en Surquillo es muy fácil: revisa lo que incluye cada visita y reserva desde la web.",
  },
  "jesus-maria": {
    name: "Jesús María",
    heading: "Servicio de limpieza en Jesús María",
    metadataTitle: "Servicio de limpieza en Jesús María",
    description:
      "Reserva limpieza por horas para casas y departamentos en Jesús María. Elige duración, fecha y personal disponible en línea.",
    introduction:
      "Nuestros agentes atienden casas y departamentos en Jesús María. Revisa lo que incluye cada visita, elige 4, 6 u 8 horas y confirma el turno desde la web.",
  },
  "san-miguel": {
    name: "San Miguel",
    heading: "Servicio de limpieza en San Miguel",
    metadataTitle: "Servicio de limpieza en San Miguel",
    description:
      "Contrata un servicio de limpieza a domicilio en San Miguel, con horarios de 07:00 a 19:00 y reserva inmediata.",
    introduction:
      "Solicita una visita puntual o recurrente en San Miguel. El proceso es el mismo: distrito, duración, fecha, personal y pago en línea.",
  },
  magdalena: {
    name: "Magdalena del Mar",
    heading: "Servicio de limpieza en Magdalena del Mar",
    metadataTitle: "Servicio de limpieza en Magdalena del Mar",
    description:
      "Agenda limpieza para casas y departamentos en Magdalena del Mar. Precios publicados y disponibilidad real por agente.",
    introduction:
      "Atendemos Magdalena del Mar con el mismo flujo de reserva: eliges el horario, revisas el total y pagas con Yape, transferencia o tarjeta.",
  },
} satisfies Record<DistrictLandingPageSlug, DistrictLandingPage>;

export function isDistrictLandingPageSlug(
  value: string,
): value is DistrictLandingPageSlug {
  return districtLandingPageSlugs.some((slug) => slug === value);
}
