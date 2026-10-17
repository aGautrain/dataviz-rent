"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MapLibreMap, Marker } from "maplibre-gl";
import { useEffect, useRef } from "react";
import type { BoundingBox, LatLng } from "@/domain/countries";

export interface MapPoint {
  id: number;
  lat: number;
  lng: number;
  title: string;
  price: string;
  url: string;
  /** Door-to-door minutes to the commute address, if one was given. */
  minutes: number | null;
}

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const SOURCE_ID = "listings";

function toGeoJson(points: MapPoint[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: points.map((point) => ({
      type: "Feature",
      id: point.id,
      geometry: { type: "Point", coordinates: [point.lng, point.lat] },
      // -1 = no travel time, drawn in the default colour.
      properties: { id: point.id, minutes: point.minutes ?? -1 },
    })),
  };
}

/** Built with DOM nodes, never innerHTML: titles come from scraped sites. */
function popupContent(point: MapPoint): HTMLElement {
  const link = document.createElement("a");
  link.href = point.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.className = "block max-w-56 text-sm text-zinc-900";
  const price = document.createElement("strong");
  price.textContent = point.price;
  const title = document.createElement("span");
  title.className = "block";
  title.textContent = point.title;
  link.append(price, title);
  return link;
}

function fitTo(map: MapLibreMap, points: MapPoint[], fallback: BoundingBox, destination: LatLng | null) {
  const places: LatLng[] = destination ? [...points, destination] : points;
  if (places.length === 0) {
    map.fitBounds(fallback, { padding: 20, animate: false });
    return;
  }
  const lngs = places.map((place) => place.lng);
  const lats = places.map((place) => place.lat);
  map.fitBounds(
    [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)],
    { padding: 40, maxZoom: 15, animate: false },
  );
}

function placeDestination(map: MapLibreMap, marker: Marker, destination: LatLng | null) {
  if (destination) marker.setLngLat([destination.lng, destination.lat]).addTo(map);
  else marker.remove();
}

export function ListingMap({
  points,
  bbox,
  destination,
}: {
  points: MapPoint[];
  bbox: BoundingBox;
  /** The commute address, shown as a marker. */
  destination: LatLng | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const latest = useRef({ points, bbox, destination });

  useEffect(() => {
    latest.current = { points, bbox, destination };
  }, [points, bbox, destination]);

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | undefined;

    // Imported here so the server render never loads WebGL code.
    import("maplibre-gl").then((maplibre) => {
      if (cancelled || !container.current) return;
      maplibre.setWorkerUrl("/maplibre-gl-worker.mjs");
      map = new maplibre.Map({
        container: container.current,
        style: STYLE_URL,
        bounds: latest.current.bbox,
      });
      map.addControl(new maplibre.NavigationControl({ showCompass: false }));

      map.on("load", () => {
        if (!map) return;
        const { points: current, bbox: fallback } = latest.current;
        map.addSource(SOURCE_ID, { type: "geojson", data: toGeoJson(current) });
        map.addLayer({
          id: SOURCE_ID,
          type: "circle",
          source: SOURCE_ID,
          paint: {
            "circle-radius": 6,
            // Blue without travel times; green to red as the commute gets longer.
            "circle-color": [
              "step",
              ["get", "minutes"],
              "#2563eb",
              0,
              "#16a34a",
              20,
              "#65a30d",
              30,
              "#ca8a04",
              45,
              "#ea580c",
              60,
              "#dc2626",
            ],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.5,
          },
        });
        fitTo(map, current, fallback, latest.current.destination);
        markerRef.current = new maplibre.Marker({ color: "#111827" }).setLngLat([0, 0]);
        placeDestination(map, markerRef.current, latest.current.destination);
        mapRef.current = map;
      });

      map.on("click", SOURCE_ID, (event) => {
        const id = event.features?.[0]?.properties?.id;
        const point = latest.current.points.find((candidate) => candidate.id === id);
        if (!map || !point) return;
        new maplibre.Popup({ closeButton: false, offset: 8 })
          .setLngLat([point.lng, point.lat])
          .setDOMContent(popupContent(point))
          .addTo(map);
      });
      map.on("mouseenter", SOURCE_ID, () => {
        if (map) map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", SOURCE_ID, () => {
        if (map) map.getCanvas().style.cursor = "";
      });
    });

    return () => {
      cancelled = true;
      mapRef.current = null;
      markerRef.current = null;
      map?.remove();
    };
  }, []);

  // A new search re-renders this component with new points: update in place.
  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource<GeoJSONSource>(SOURCE_ID);
    if (!map || !source) return;
    source.setData(toGeoJson(points));
    fitTo(map, points, bbox, destination);
    if (markerRef.current) placeDestination(map, markerRef.current, destination);
  }, [points, bbox, destination]);

  return <div ref={container} className="h-full min-h-80 w-full" />;
}
