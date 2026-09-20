import { db } from "../../data/db";
import type { MerchantResult } from "../../data/types";
let lastRequest = 0;
export async function searchMerchant(
  name: string,
  city: string,
  signal?: AbortSignal,
): Promise<MerchantResult[]> {
  if (!(await db.settings.get("main"))?.search)
    throw new Error("Activa las consultas externas en Ajustes.");
  const query = `${name.trim()} ${city.trim()}`.trim();
  if (
    !name.trim() ||
    query.length > 120 ||
    /\b\d{5,}\b/.test(query) ||
    /\b[A-Z]{2}\d{2}/i.test(query)
  )
    throw new Error(
      "Introduce solo el nombre público del comercio y la localidad, sin referencias bancarias.",
    );
  const id = query.toLocaleLowerCase("es");
  const cached = await db.searchCache.get(id);
  if (cached && Date.now() - Date.parse(cached.savedAt) < 30 * 86400000)
    return cached.results;
  if (Date.now() - lastRequest < 1500)
    throw new Error("Espera un momento antes de realizar otra búsqueda.");
  lastRequest = Date.now();
  const results: MerchantResult[] = [];
  const errors: string[] = [];
  const responses = await Promise.allSettled([
    fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`,
      { credentials: "omit", signal },
    ),
    fetch(
      `https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=3&format=json&origin=*`,
      { credentials: "omit", signal },
    ),
  ]);
  for (let i = 0; i < responses.length; i++) {
    const r = responses[i];
    if (r.status === "rejected" || !r.value.ok) {
      errors.push(i === 0 ? "Photon" : "Wikipedia");
      continue;
    }
    const json = await r.value.json();
    if (i === 0)
      for (const feature of json.features || []) {
        const p = feature.properties || {},
          [lng, lat] = feature.geometry?.coordinates || [];
        if (Number.isFinite(lat) && Number.isFinite(lng))
          results.push({
            name: p.name || name,
            detail: [p.street, p.housenumber, p.city, p.country]
              .filter(Boolean)
              .join(", "),
            lat,
            lng,
            url: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`,
            source: "OpenStreetMap · Photon",
          });
      }
    else
      for (const page of json.query?.search || [])
        results.push({
          name: page.title,
          detail: String(page.snippet)
            .replace(/<[^>]*>/g, "")
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, "&"),
          url: `https://es.wikipedia.org/?curid=${page.pageid}`,
          source: "Wikipedia",
        });
  }
  if (!results.length && errors.length)
    throw new Error(
      `No se pudo consultar ${errors.join(" y ")}. Puedes abrir la búsqueda manual.`,
    );
  await db.searchCache.put({ id, savedAt: new Date().toISOString(), results });
  return results;
}
