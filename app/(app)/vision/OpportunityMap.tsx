"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Map as LeafletMap } from "leaflet";
import type { VisionOpportunity } from "@/lib/vision/types";
import { STATUS_LABEL } from "@/lib/data";
import "leaflet/dist/leaflet.css";
import "./map.css";

export function OpportunityMap({ opportunities }: { opportunities: VisionOpportunity[] }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const router = useRouter();
  const [failure, setFailure] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const mapped = opportunities.filter((record) => record.latitude !== null && record.longitude !== null);

  useEffect(() => {
    let disposed = false;
    let resize: ResizeObserver | undefined;
    const timeout = window.setTimeout(() => {
      if (!disposed) setFailure("The basemap is taking too long to load. You can still open every opportunity in the list.");
    }, 12000);

    async function draw() {
      try {
        const L = await import("leaflet");
        if (disposed || !container.current) return;
        const map = L.map(container.current, {
          scrollWheelZoom: false, zoomControl: false, zoomAnimation: false,
          fadeAnimation: false, markerZoomAnimation: false,
        }).setView([40.85, -73.05], 9);
        mapRef.current = map;
        const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        });
        tiles.on("tileerror", () => {
          if (!disposed) setFailure("Some basemap tiles could not load. You can still open every opportunity in the list.");
        });
        tiles.on("tileload", () => { window.clearTimeout(timeout); });
        tiles.addTo(map);
        const bounds = L.latLngBounds([]);
        for (const record of opportunities) {
          if (record.latitude === null || record.longitude === null) continue;
          const point = L.latLng(record.latitude, record.longitude);
          bounds.extend(point);
          const pin = document.createElement("span");
          pin.className = `vision-map-pin vision-map-pin--${record.status}`;
          const glyph = document.createElement("span");
          glyph.className = "vision-map-state";
          glyph.setAttribute("aria-hidden", "true");
          pin.append(glyph, document.createTextNode(record.sheetNumber.replace(/^V-/, "")));
          const description = `Open ${record.name}, ${STATUS_LABEL[record.status]}`;
          const marker = L.marker(point, {
            icon: L.divIcon({ html: pin, className: "vision-map-marker", iconSize: [64, 36], iconAnchor: [32, 18] }),
            keyboard: true, title: description, alt: description,
          }).addTo(map);
          marker.getElement()?.setAttribute("aria-label", description);
          const label = document.createElement("span");
          label.textContent = `${record.name} · ${STATUS_LABEL[record.status]}`;
          marker.bindTooltip(label);
          marker.on("click", () => router.push(`/vision/${record.id}`));
          marker.on("keydown", (event) => {
            const key = (event.originalEvent as KeyboardEvent).key;
            if (key === "Enter" || key === " ") {
              event.originalEvent.preventDefault();
              event.originalEvent.stopPropagation();
              router.push(`/vision/${record.id}`);
            }
          });
        }
        if (bounds.isValid()) map.fitBounds(bounds.pad(0.2), { maxZoom: 13, animate: false });
        resize = new ResizeObserver(() => map.invalidateSize({ animate: false }));
        resize.observe(container.current);
        setReady(true);
      } catch {
        if (!disposed) setFailure("The map could not load. You can still open every opportunity in the list.");
      }
    }
    void draw();
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      resize?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [opportunities, router]);

  return (
    <section className="vision-map-section" aria-label="Opportunity map">
      <div className="vision-map-heading">
        <div>
          <h2>Opportunities on the map</h2>
          <p className="t-meta">{mapped.length} mapped · {opportunities.length - mapped.length} without coordinates</p>
        </div>
        <div className="vision-map-controls">
          <button type="button" className="btn btn--quiet" disabled={!ready} onClick={() => mapRef.current?.zoomIn(undefined, { animate: false })}>Zoom in</button>
          <button type="button" className="btn btn--quiet" disabled={!ready} onClick={() => mapRef.current?.zoomOut(undefined, { animate: false })}>Zoom out</button>
          <button type="button" className="btn btn--quiet" disabled={!ready} onClick={() => mapRef.current?.setView([40.85, -73.05], 9, { animate: false })}>Long Island</button>
        </div>
      </div>
      {failure ? <p className="vision-map-notice" role="status">{failure}</p> : null}
      <div ref={container} className="vision-map-canvas" aria-label="Map of saved opportunities" />
      {mapped.length === 0 ? <p className="vision-map-caption">Add coordinates to an opportunity to place it on this map.</p> : null}
    </section>
  );
}
