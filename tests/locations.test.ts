import { expect, it } from "vitest";
import {
  parseTimeline,
  locationCandidates,
} from "../src/features/locations/parse";
import type { Movement } from "../src/data/types";
it("normaliza formatos históricos, móviles y nuevos sin duplicar", () => {
  const old = parseTimeline(
    {
      locations: [
        {
          latitudeE7: 404168000,
          longitudeE7: -37038000,
          timestamp: "2026-09-01T10:00:00Z",
        },
        {
          latitudeE7: 404168000,
          longitudeE7: -37038000,
          timestamp: "2026-09-01T10:00:00Z",
        },
      ],
    },
    "Records.json",
  );
  expect(old.locations).toHaveLength(1);
  expect(old.locations[0].lat).toBe(40.4168);
  const mobile = parseTimeline(
    [
      {
        startTime: "2026-09-01T12:00:00+02:00",
        endTime: "2026-09-01T13:00:00+02:00",
        visit: { topCandidate: { placeLocation: "geo:40.4168,-3.7038" } },
      },
    ],
    "mobile",
  );
  expect(mobile.locations[0].start).toBe("2026-09-01T10:00:00.000Z");
  const modern = parseTimeline(
    {
      semanticSegments: [
        {
          startTime: "2026-09-01T10:00:00Z",
          endTime: "2026-09-01T11:00:00Z",
          visit: {
            topCandidate: { placeLocation: { latLng: "40.4168°, -3.7038°" } },
          },
        },
      ],
    },
    "modern",
  );
  expect(modern.locations[0].lng).toBe(-3.7038);
});
it("compara por día local sin inventar una hora de compra", () => {
  const parsed = parseTimeline(
    {
      locations: [
        {
          latitudeE7: 404168000,
          longitudeE7: -37038000,
          timestamp: "2026-08-31T23:30:00Z",
        },
      ],
    },
    "test",
  );
  const movement = { date: "2026-09-01" } as Movement;
  expect(
    locationCandidates(movement, parsed.locations, "Europe/Madrid"),
  ).toHaveLength(1);
  expect(locationCandidates(movement, parsed.locations, "UTC")).toHaveLength(0);
  expect(
    locationCandidates(
      {
        ...movement,
        time: "22:00:00",
        secondaryDate: "2026-09-02",
        secondaryTime: "10:00:00",
      },
      parsed.locations,
      "Europe/Madrid",
    ),
  ).toHaveLength(1);
});
