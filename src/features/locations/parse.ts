import type { Location, Movement } from "../../data/types";

type Obj = Record<string, any>;
function coordinates(value: unknown): { lat: number; lng: number } | null {
  if (typeof value === "string") {
    const nums = value
      .replace(/^geo:/, "")
      .match(/-?\d+(?:\.\d+)?/g)
      ?.map(Number);
    if (nums && nums.length >= 2) return { lat: nums[0], lng: nums[1] };
  }
  if (value && typeof value === "object") {
    const v = value as Obj;
    if (v.latLng || v.LatLng) return coordinates(v.latLng || v.LatLng);
    if (v.latitudeE7 !== undefined)
      return {
        lat: Number(v.latitudeE7) / 1e7,
        lng: Number(v.longitudeE7) / 1e7,
      };
    if (v.latE7 !== undefined)
      return { lat: Number(v.latE7) / 1e7, lng: Number(v.lngE7) / 1e7 };
    if (v.latitude !== undefined)
      return { lat: Number(v.latitude), lng: Number(v.longitude) };
  }
  return null;
}
function timestamp(value: unknown) {
  if (value === undefined || value === null) return null;
  const n =
    typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  const date = new Date(
    typeof n === "number" ? (n < 1e11 ? n * 1000 : n) : String(n),
  );
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
export function parseTimeline(
  input: unknown,
  source: string,
): { locations: Location[]; skipped: number } {
  if (!input || typeof input !== "object")
    throw new Error("El archivo no es una exportación JSON de Timeline");
  const root = input as Obj;
  const segments = Array.isArray(input)
    ? input
    : root.semanticSegments || root.timelineObjects || root.locations;
  if (!Array.isArray(segments))
    throw new Error(
      "Formato no reconocido. Utiliza semanticSegments, timelineObjects, Records.json o location-history.json.",
    );
  const unique = new Map<string, Location>();
  let skipped = 0;
  function add(
    point: unknown,
    startValue: unknown,
    endValue: unknown,
    name = "",
    accuracy?: unknown,
  ) {
    const coord = coordinates(point),
      start = timestamp(startValue),
      end = timestamp(endValue) || start;
    if (
      !coord ||
      !start ||
      !end ||
      !Number.isFinite(coord.lat) ||
      !Number.isFinite(coord.lng) ||
      Math.abs(coord.lat) > 90 ||
      Math.abs(coord.lng) > 180 ||
      end < start
    ) {
      skipped++;
      return;
    }
    const id = JSON.stringify([coord.lat, coord.lng, start, end]);
    unique.set(id, {
      id,
      ...coord,
      start,
      end,
      name: name || "Ubicación del historial",
      accuracy: Number.isFinite(Number(accuracy))
        ? Number(accuracy)
        : undefined,
      source,
    });
  }
  for (const raw of segments) {
    if (!raw || typeof raw !== "object") {
      skipped++;
      continue;
    }
    const s = raw as Obj;
    if (s.latitudeE7 !== undefined) {
      add(
        s,
        s.timestamp || s.timestampMs,
        s.timestamp || s.timestampMs,
        "Punto registrado",
        s.accuracy,
      );
      continue;
    }
    const start =
      s.startTime ||
      s.placeVisit?.duration?.startTimestamp ||
      s.placeVisit?.duration?.startTimestampMs ||
      s.activitySegment?.duration?.startTimestamp ||
      s.activitySegment?.duration?.startTimestampMs;
    const end =
      s.endTime ||
      s.placeVisit?.duration?.endTimestamp ||
      s.placeVisit?.duration?.endTimestampMs ||
      s.activitySegment?.duration?.endTimestamp ||
      s.activitySegment?.duration?.endTimestampMs;
    if (s.visit) {
      const top = s.visit.topCandidate || {};
      add(top.placeLocation, start, end, top.name || "Visita registrada");
    }
    if (s.placeVisit) {
      const l = s.placeVisit.location || {};
      add(
        l,
        start,
        end,
        l.name || l.address || "Visita registrada",
        l.accuracyMetres,
      );
    }
    if (s.activity) {
      add(s.activity.start, start, start, "Inicio de trayecto");
      add(s.activity.end, end, end, "Fin de trayecto");
    }
    if (s.activitySegment) {
      add(s.activitySegment.startLocation, start, start, "Inicio de trayecto");
      add(s.activitySegment.endLocation, end, end, "Fin de trayecto");
    }
    if (Array.isArray(s.timelinePath))
      for (const p of s.timelinePath) {
        const base = timestamp(start);
        const time =
          p.time ||
          (base && p.durationMinutesOffsetFromStartTime !== undefined
            ? new Date(
                Date.parse(base) +
                  Number(p.durationMinutesOffsetFromStartTime) * 60000,
              ).toISOString()
            : undefined);
        add(p.point, time, time, "Punto del trayecto");
      }
  }
  if (Array.isArray(root.rawSignals))
    for (const raw of root.rawSignals)
      if (raw.position)
        add(
          raw.position,
          raw.position.timestamp,
          raw.position.timestamp,
          "Punto registrado",
          raw.position.accuracyMeters,
        );
  return {
    locations: [...unique.values()].sort((a, b) =>
      a.start.localeCompare(b.start),
    ),
    skipped,
  };
}
export function dateInZone(instant: string, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
}
export function locationCandidates(
  m: Movement,
  locations: Location[],
  timezone: string,
  includePrevious = false,
) {
  const first = new Date(`${m.date}T12:00:00Z`);
  first.setUTCDate(first.getUTCDate() - (includePrevious ? 3 : 0));
  const from = first.toISOString().slice(0, 10);
  return locations
    .filter(
      (l) =>
        dateInZone(l.start, timezone) <= m.date &&
        dateInZone(l.end, timezone) >= from,
    )
    .map((location) => ({
      location,
      evidence:
        "Coincidencia por día; la operación no identifica un instante con zona horaria. La contabilización puede ser posterior y la compra puede ser online.",
    }));
}
