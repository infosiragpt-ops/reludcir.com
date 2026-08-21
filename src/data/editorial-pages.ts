export type EditorialPage = {
  path: string;
  title: string;
  description: string;
  kind: "article" | "archive" | "author";
};

const articles: EditorialPage[] = [
  [
    "consejos-para-limpiar-su-casa-de-manera-rapida-y-eficiente",
    "Consejos para limpiar su casa de manera rápida y eficiente",
    "Una rutina práctica para ordenar las tareas, ahorrar tiempo y conseguir una limpieza uniforme en casa.",
  ],
  [
    "consejos-para-mantener-limpio-el-hogar-y-eliminar-los-acaros",
    "Consejos para mantener limpio el hogar y eliminar los ácaros",
    "Hábitos de ventilación, lavado y aspirado que ayudan a reducir el polvo y los ácaros del hogar.",
  ],
  [
    "como-mantener-la-casa-limpia-y-ordenada-con-ninos",
    "Cómo mantener la casa limpia y ordenada con niños",
    "Ideas realistas para repartir tareas, guardar juguetes y sostener el orden en una casa con niños.",
  ],
  [
    "como-mantener-la-casa-fresca",
    "Cómo mantener la casa fresca",
    "Recomendaciones de ventilación, textiles y limpieza para conservar ambientes agradables durante el verano.",
  ],
  [
    "como-eliminar-las-pulgas-de-la-casa",
    "Cómo eliminar las pulgas de la casa",
    "Pasos para tratar textiles, pisos y zonas de mascotas y evitar que las pulgas vuelvan a aparecer.",
  ],
  [
    "limpieza-del-hogar-cuando-hay-bebes",
    "Limpieza del hogar cuando hay bebés",
    "Cómo priorizar superficies, textiles y productos seguros en los espacios que comparte un bebé.",
  ],
  [
    "como-desinfectar-juguetes-de-bebe",
    "Cómo desinfectar juguetes de bebé",
    "Métodos de limpieza según el material del juguete, con secado completo y productos adecuados.",
  ],
  [
    "necesitas-un-servicio-de-limpieza-a-domicilio",
    "¿Necesitas un servicio de limpieza a domicilio?",
    "Señales para decidir cuándo contratar ayuda y cómo preparar la visita para aprovechar mejor el tiempo.",
  ],
  [
    "mamas-obsesionadas-por-la-limpieza",
    "Mamás obsesionadas por la limpieza",
    "Una mirada práctica al equilibrio entre higiene, orden, descanso y expectativas realistas en el hogar.",
  ],
  [
    "consejos-efectivos-para-limpiar-y-eliminar-los-malos-olores-del-bano",
    "Consejos para limpiar y eliminar los malos olores del baño",
    "Una secuencia eficaz para desinfectar el baño, controlar la humedad y neutralizar olores persistentes.",
  ],
  [
    "quitar-manchas-de-grasa-de-la-cocina",
    "Cómo quitar manchas de grasa de la cocina",
    "Técnicas para ablandar y retirar grasa de muebles, paredes y electrodomésticos sin dañar los acabados.",
  ],
  [
    "como-se-hace-la-limpieza-de-una-casa",
    "Cómo se hace la limpieza de una casa",
    "Orden recomendado, herramientas básicas y puntos de control para limpiar una vivienda de principio a fin.",
  ],
  [
    "fluffy-pancakes-una-deliciosa-receta-japonesa",
    "Fluffy pancakes: una deliciosa receta japonesa",
    "Una receta casera de pancakes japoneses suaves y altos, con consejos para cocinar y dejar la cocina lista.",
  ],
  [
    "como-organizarse-para-limpiar-la-casa-y-trabajar",
    "Cómo organizarse para limpiar la casa y trabajar",
    "Bloques de tiempo y rutinas breves para combinar el trabajo con el cuidado cotidiano del hogar.",
  ],
  [
    "5-consejos-para-mantener-tu-casa-limpia-sin-perder-la-cordura",
    "5 consejos para mantener tu casa limpia sin perder la cordura",
    "Cinco hábitos sostenibles para evitar que las tareas domésticas se acumulen durante la semana.",
  ],
  [
    "como-puedo-eliminar-las-manchas-dificiles-de-cafe-de-la-alfombra",
    "Cómo eliminar manchas difíciles de café de la alfombra",
    "Qué hacer desde el primer minuto y cómo tratar una mancha de café sin extenderla ni dañar la fibra.",
  ],
  [
    "guia-completa-2025-cuanto-cuesta-y-como-contratar-un-servicio-de-limpieza-en-lima",
    "Guía completa: cuánto cuesta y cómo contratar limpieza en Lima",
    "Precios, duraciones, medios de pago y criterios para reservar un servicio de limpieza confiable en Lima.",
  ],
  [
    "los-mejores-servicios-de-limpieza-en-lima",
    "Los mejores servicios de limpieza en Lima",
    "Qué comparar en cobertura, personal, horarios, soporte y políticas antes de contratar una empresa de limpieza.",
  ],
].map(([path, title, description]) => ({
  path,
  title,
  description,
  kind: "article" as const,
}));

const archives: EditorialPage[] = [
  ["category/blog", "Blog", "Consejos de limpieza, organización y cuidado del hogar."],
  ["category/blog/cocina-y-gustitos", "Cocina y gustitos", "Ideas para disfrutar la cocina y dejarla limpia y ordenada."],
  ["category/blog/limpieza-en-el-hogar", "Limpieza en el hogar", "Guías prácticas para cuidar cada ambiente de casa."],
  ["category/blog/productos-de-limpieza", "Productos de limpieza", "Cómo elegir y utilizar productos de limpieza con seguridad."],
  ["category/sin-categoria", "Publicaciones de Reludcir", "Novedades y contenidos generales de Reludcir."],
  ...[
    ["bano", "Baño"],
    ["bebes", "Bebés"],
    ["casa", "Casa"],
    ["cocina", "Cocina"],
    ["departamento", "Departamento"],
    ["hogar", "Hogar"],
    ["limpieza", "Limpieza"],
    ["limpieza-de-casas", "Limpieza de casas"],
    ["mama", "Mamá"],
    ["mascotas", "Mascotas"],
    ["ninos", "Niños"],
    ["pulgas", "Pulgas"],
    ["servicios-de-limpieza", "Servicios de limpieza"],
    ["trabajo", "Trabajo"],
    ["ventilacion", "Ventilación"],
    ["verano", "Verano"],
  ].map(([slug, title]) => [
    `tag/${slug}`,
    title,
    `Artículos de Reludcir relacionados con ${title.toLocaleLowerCase("es-PE")}.`,
  ]),
  ...[
    ["empresa-de-limpieza", "Empresa de limpieza"],
    ["empresa-de-servicios-de-limpieza", "Empresa de servicios de limpieza"],
    ["limpieza-a-domicilio", "Limpieza a domicilio"],
    ["limpieza-de-casas", "Limpieza de casas"],
    ["limpieza-de-oficinas", "Limpieza de oficinas"],
    ["limpieza-por-horas", "Limpieza por horas"],
    ["servicios-de-limpieza", "Servicios de limpieza"],
  ].map(([slug, title]) => [
    `etiqueta-producto/${slug}`,
    title,
    `Servicios y contenidos de Reludcir sobre ${title.toLocaleLowerCase("es-PE")}.`,
  ]),
].map(([path, title, description]) => ({
  path,
  title,
  description,
  kind: "archive" as const,
}));

export const editorialPages: EditorialPage[] = [
  ...articles,
  ...archives,
  {
    path: "author/reludcir",
    title: "Reludcir",
    description: "Publicaciones y guías preparadas por el equipo de Reludcir.",
    kind: "author",
  },
];

export const editorialPageByPath = new Map(
  editorialPages.map((page) => [page.path, page]),
);

export const editorialArticles = articles;
