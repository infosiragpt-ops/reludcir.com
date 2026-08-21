export type District = {
  id: number;
  name: string;
  slug: string;
};

export type ServicePlan = {
  id: number;
  name: string;
  kind: "single" | "recurring";
  rating: number;
  startingPrice: number;
  image: string;
  description: string;
};

export type StaffMember = {
  id: number;
  name: string;
  rating: number | null;
  profession: string;
  image: string;
};

export const districts: District[] = [
  { id: 1, name: "Miraflores", slug: "miraflores" },
  { id: 2, name: "San Borja", slug: "san-borja" },
  { id: 3, name: "San Isidro", slug: "san-isidro" },
  { id: 4, name: "Surco", slug: "surco" },
  { id: 5, name: "Surquillo", slug: "surquillo" },
  { id: 6, name: "Jesús María", slug: "jesus-maria" },
  { id: 7, name: "San Miguel", slug: "san-miguel" },
  { id: 8, name: "Barranco", slug: "barranco" },
  { id: 9, name: "Magdalena", slug: "magdalena" },
];

export const servicePlans: ServicePlan[] = [
  {
    id: 5,
    name: "Limpieza por horas [único]",
    kind: "single",
    rating: 4.8,
    startingPrice: 67,
    image: "/booking/service-single.webp",
    description:
      "Contrata de 4 a 8 horas por día. Elige la cantidad de horas en el siguiente paso.",
  },
  {
    id: 7,
    name: "Limpieza por horas [recurrente]",
    kind: "recurring",
    rating: 4.6,
    startingPrice: 61,
    image: "/booking/service-recurring.webp",
    description:
      "Contrata varias horas a la semana o al mes. Elige la cantidad de horas en el siguiente paso.",
  },
];

export const packages = [
  { id: 1, hours: 4, singlePrice: 67, recurringPrice: 61 },
  { id: 2, hours: 6, singlePrice: 99, recurringPrice: 91 },
  { id: 3, hours: 8, singlePrice: 127, recurringPrice: 116 },
] as const;

export const staffMembers: StaffMember[] = [
  {
    id: 1,
    name: "Juan",
    rating: 4.5,
    profession: "Agente de Limpieza",
    image: "/booking/staff-juan.webp",
  },
  {
    id: 2,
    name: "Alex Reategui",
    rating: 5,
    profession: "Agente de Limpieza",
    image: "/booking/staff-alex.webp",
  },
  {
    id: 3,
    name: "Alan",
    rating: null,
    profession: "Agente de Limpieza",
    image: "/booking/staff-alan.webp",
  },
];

export const testimonials = [
  {
    quote:
      "Buscaba un buen servicio de limpieza, pero siempre tenía cierta desconfianza. Con Reludcir estoy más tranquila porque hacen un buen trabajo y además son cuidadosos con mis cosas.",
    name: "Maria Muñoz",
    role: "Abogada",
    image: "/assets/testimonial-alicia.webp",
    social: "facebook",
    socialUrl: "https://www.facebook.com/reludcir",
  },
  {
    quote:
      "Atender reuniones y limpiar el departamento era un problema. Contraté a Reludcir porque es muy fácil hacerlo y son responsables.",
    name: "William Salas",
    role: "Empresario",
    image: "/assets/testimonial-william.webp",
    social: "twitter",
    socialUrl: "https://twitter.com/reludcir",
  },
  {
    quote:
      "Los dos hacemos trabajo remoto y casi siempre estamos muy ocupados; hacen un excelente trabajo, los recomiendo totalmente.",
    name: "Alicia Alcantara",
    role: "Traductora",
    image: "/assets/testimonial-maria.webp",
    social: "facebook",
    socialUrl: "https://www.facebook.com/reludcir",
  },
] as const;

export const serviceFaq = [
  {
    question: "¿Qué es Reludcir?",
    answer:
      "Reludcir es una plataforma de Lima que conecta hogares que necesitan limpieza por horas con agentes previamente verificados.",
  },
  {
    question: "¿Cómo funciona?",
    answer:
      "Selecciona tu distrito, el tipo de servicio, la fecha, la hora y el personal disponible. Después completa tus datos y el medio de pago para registrar la reserva.",
  },
  {
    question: "¿Cuál es el precio?",
    answer:
      "El total depende de la duración y de si reservas una visita única o recurrente. Ofrecemos paquetes de 4, 6 y 8 horas y mostramos el importe antes de confirmar.",
  },
  {
    question: "¿Cómo contrato un servicio?",
    answer:
      "Puedes reservar desde el formulario de la web. Al finalizar recibirás el estado del pedido y podrás administrarlo desde la sección Mis reservas.",
  },
  {
    question: "¿Cómo pago el servicio?",
    answer:
      "Aceptamos Yape, transferencia bancaria y tarjeta de crédito o débito. Los pagos manuales quedan pendientes hasta su conciliación.",
  },
  {
    question: "¿En qué distritos atienden?",
    answer:
      "Atendemos en Miraflores, San Isidro, Surco, San Borja, Magdalena del Mar, Barranco, San Miguel, Jesús María y Surquillo.",
  },
  {
    question: "¿Cuál es el horario de atención?",
    answer:
      "Las visitas se programan de lunes a domingo entre las 7:00 a. m. y las 7:00 p. m., según la disponibilidad real del personal.",
  },
  {
    question: "¿Con cuánto tiempo debo reservar?",
    answer:
      "El sistema exige al menos 10 horas de anticipación para comprobar la agenda y confirmar al agente seleccionado.",
  },
  {
    question: "¿Puedo cancelar un servicio?",
    answer:
      "Sí. Si cancelas con al menos 24 horas de anticipación, el pago elegible se devuelve; después de ese plazo puede aplicarse el costo total.",
  },
  {
    question: "¿Puedo reprogramar un servicio?",
    answer:
      "Sí. Desde tu panel puedes elegir otra fecha y hora disponible hasta 12 horas antes. Cada reserva admite un máximo de tres reprogramaciones.",
  },
  {
    question: "¿Quién proporciona los materiales de limpieza?",
    answer:
      "El cliente proporciona productos y herramientas: detergente, desinfectante, paños, esponjas, escoba, recogedor, balde, trapeador y acceso a agua.",
  },
  {
    question: "¿Qué ocurre si el agente llega tarde?",
    answer:
      "Puedes reportar la tardanza desde la reserva. El equipo revisará el caso con ambas partes y coordinará la solución correspondiente.",
  },
  {
    question: "¿Qué ocurre si el agente no llega?",
    answer:
      "Repórtalo como inasistencia desde tu panel. Nos comunicaremos contigo para reprogramar la visita o gestionar la devolución aplicable.",
  },
  {
    question: "¿Qué ocurre si se produce un daño material?",
    answer:
      "Registra el incidente con una descripción desde Mis reservas. Reludcir contactará al cliente y al agente para investigar y acordar la atención del caso.",
  },
] as const;
