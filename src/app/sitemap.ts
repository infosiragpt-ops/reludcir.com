import type { MetadataRoute } from "next";

import { districtLandingPageSlugs } from "@/data/district-landing-pages";
import { editorialPages } from "@/data/editorial-pages";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://reludcir.com").replace(
    /\/$/,
    "",
  );
  const staticRoutes = [
    "",
    "/limpieza-de-casas",
    "/contactar-con-servicios-de-limpieza",
    "/conviertete-en-prestador-de-servicios",
    "/tienda",
  ];
  const districtRoutes = districtLandingPageSlugs.map(
    (district) => `/servicio-de-limpieza-en-${district}`,
  );
  const editorialRoutes = editorialPages.map((page) => `/${page.path}`);

  return [...staticRoutes, ...districtRoutes, ...editorialRoutes].map((path) => ({
    url: `${base}${path}`,
    changeFrequency: path.startsWith("/tag/") ? ("monthly" as const) : ("weekly" as const),
  }));
}
