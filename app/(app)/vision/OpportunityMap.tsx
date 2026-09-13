"use client";

import Link from "next/link";
import "./[id]/location.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { useRouter } from "next/navigation";
import type { Map as LeafletMap } from "leaflet";
import { groupApproximateAreaPoints, groupSourceMapPoints, partitionMapPoints, type ApproximateAreaGroup, type DiscoveryMapPoint } from "@/lib/vision/map-points";
import type { VisionOpportunity } from "@/lib/vision/types";
import { WORKFLOW_LABELS } from "@/lib/vision/presentation";
import { STATUS_LABEL } from "@/lib/data";
import "leaflet/dist/leaflet.css";
import "./map.css";

type ApproximatePopupRecord = {
  key: string;
  href: string;
  label: string;
};

export function ApproximateAreaPopup({group, trackedById}: {group: ApproximateAreaGroup; trackedById: ReadonlyMap<string, VisionOpportunity>}) {
  const records = popupRecords(group, trackedById);
  return <div className="vision-discovery-popup" aria-label={`Records in the approximate ${group.area} area`}>
    <strong>{records.length} {records.length === 1 ? "record" : "records"} in the approximate {group.area} area</strong>
    <span className="vision-popup-location-note">Placed at the {group.area} area center. Project coordinates are not known.</span>
    {records.map(record => <a key={record.key} className="vision-popup-link" href={record.href}>{record.label}</a>)}
  </div>;
}

function popupRecords(group: ApproximateAreaGroup, trackedById: ReadonlyMap<string, VisionOpportunity>): ApproximatePopupRecord[] {
  return group.items.map(item => {
    if (item.kind === "source-record") {
      return {
        key: `source-record-${item.point.id}`,
        href: `/vision/discover?record=${item.point.id}`,
        label: `Source record · ${item.point.name}${item.point.address ? ` · ${item.point.address}` : ""}`,
      };
    }
    const record = trackedById.get(item.point.id)!;
    return {
      key: `tracked-${record.id}`,
      href: `/vision/${record.id}#location`,
      label: `Tracked · ${record.sheetNumber} · ${record.name} · Resolve location`,
    };
  });
}

export function OpportunityMap({ opportunities, discoveries, workflowDecisions }: { opportunities: VisionOpportunity[]; discoveries:DiscoveryMapPoint[]; workflowDecisions?:Record<string,keyof typeof WORKFLOW_LABELS> }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const router = useRouter();
  const [failure, setFailure] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [showDiscoveries,setShowDiscoveries]=useState(true);
  const [showTracked,setShowTracked]=useState(true);
  const sourceRecordPoints = useMemo(() => partitionMapPoints(discoveries), [discoveries]);
  const trackedPoints = useMemo(() => partitionMapPoints(opportunities), [opportunities]);
  const sourceLocated = sourceRecordPoints.source.length + trackedPoints.source.length;
  const approximate = sourceRecordPoints.approximate.length + trackedPoints.approximate.length;
  const unmappedTracked = useMemo(() => {
    const mappedIds = new Set([...trackedPoints.source, ...trackedPoints.approximate].map(point => point.id));
    return opportunities.filter(record => !mappedIds.has(record.id));
  }, [opportunities, trackedPoints]);
  const unmapped = discoveries.length + opportunities.length - sourceLocated - approximate;

  useEffect(() => {
    let disposed = false;
    let resize: ResizeObserver | undefined;
    const popupRoots: Root[] = [];
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
        const trackedById = new Map(opportunities.map(record => [record.id, record]));
        for (const displayPoint of showTracked ? trackedPoints.source : []) {
          const record = trackedById.get(displayPoint.id)!;
          const point = L.latLng(displayPoint.displayLatitude, displayPoint.displayLongitude);
          bounds.extend(point);
          const pin = document.createElement("span");
          const decision = workflowDecisions?.[record.id] ?? "undecided";
          const markerStatus = workflowDecisions ? (decision === "pursuing" ? "working" : decision === "won" ? "done" : "open") : record.status;
          const stateLabel = workflowDecisions ? WORKFLOW_LABELS[decision] : STATUS_LABEL[record.status];
          pin.className = `vision-map-pin vision-map-pin--${markerStatus}`;
          const glyph = document.createElement("span");
          glyph.className = "vision-map-state";
          glyph.setAttribute("aria-hidden", "true");
          pin.append(glyph, document.createTextNode(record.sheetNumber.replace(/^V-/, "")));
          const description = `Open ${record.name}, ${stateLabel}`;
          const marker = L.marker(point, {
            icon: L.divIcon({ html: pin, className: "vision-map-marker", iconSize: [64, 36], iconAnchor: [32, 18] }),
            keyboard: true, title: description, alt: description, zIndexOffset:1000,
          }).addTo(map);
          marker.getElement()?.setAttribute("aria-label", description);
          const label = document.createElement("span");
          label.textContent = `${record.name} · ${stateLabel}`;
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
        const approximateItems = [
          ...(showTracked ? trackedPoints.approximate.map(point => ({kind: "tracked" as const, point})) : []),
          ...(showDiscoveries ? sourceRecordPoints.approximate.map(point => ({kind: "source-record" as const, point})) : []),
        ];
        for (const group of groupApproximateAreaPoints(approximateItems)) {
          bounds.extend([group.latitude, group.longitude]);
          const pin = document.createElement("span");
          pin.className = "vision-approximate-pin";
          pin.textContent = `≈ ${group.items.length}`;
          const description = `Approximate ${group.area} area. Open ${group.items.length} ${group.items.length === 1 ? "record" : "records"}`;
          const marker = L.marker([group.latitude, group.longitude], {
            icon: L.divIcon({html: pin, className: "vision-map-marker", iconSize: [72, 36], iconAnchor: [36, 18]}),
            keyboard: true,
            title: description,
            alt: description,
            zIndexOffset: 900,
          }).addTo(map);
          marker.getElement()?.setAttribute("aria-label", description);
          const label = document.createElement("span");
          label.textContent = description;
          marker.bindTooltip(label);
          const popup = document.createElement("div");
          const popupRoot = createRoot(popup);
          flushSync(() => popupRoot.render(<ApproximateAreaPopup group={group} trackedById={trackedById} />));
          popupRoots.push(popupRoot);
          marker.bindPopup(popup, {maxWidth: Math.max(220, Math.min(360, container.current!.clientWidth - 60)), maxHeight: 260});
          marker.on("keydown", event => {
            const key = (event.originalEvent as KeyboardEvent).key;
            if (key === "Enter" || key === " ") {
              event.originalEvent.preventDefault();
              marker.openPopup();
            }
          });
        }
        const sourceRecordLayer=L.layerGroup().addTo(map);
        if(showDiscoveries)for(const point of sourceRecordPoints.source)bounds.extend([point.displayLatitude,point.displayLongitude]);
        function drawSourceRecords(){
          sourceRecordLayer.clearLayers();
          if(!showDiscoveries)return;
          for(const group of groupSourceMapPoints(sourceRecordPoints.source,(lat,lng)=>map.project([lat,lng],map.getZoom()))){
            const {latitude,longitude}=group;
            const pin=document.createElement("span");pin.className="vision-discovery-pin";
            pin.textContent=group.points.length===1?"◆":String(group.points.length);
            const description=group.points.length===1?`Review ${group.points[0].name}`:`Review ${group.points.length} source records in this area`;
            const marker=L.marker([latitude,longitude],{icon:L.divIcon({html:pin,className:"vision-map-marker",iconSize:[36,36],iconAnchor:[18,18]}),keyboard:true,title:description,alt:description}).addTo(sourceRecordLayer);
            marker.getElement()?.setAttribute("aria-label",description);
            const label=document.createElement("span");label.textContent=description;marker.bindTooltip(label);
            const popup=document.createElement("div");popup.className="vision-discovery-popup";
            const heading=document.createElement("strong");heading.textContent=group.points.length===1?"Source record":`${group.points.length} source records`;popup.append(heading);
            if(group.points.length>1){const zoom=document.createElement("button");zoom.className="btn btn--quiet";zoom.textContent="Zoom to this area";zoom.onclick=()=>{map.closePopup();map.setView([latitude,longitude],Math.min(18,map.getZoom()+2),{animate:false});};popup.append(zoom);}
            for(const record of group.points){const link=document.createElement("a");link.className="vision-popup-link";link.href=`/vision/discover?record=${record.id}`;link.textContent=`${record.name}${record.address?` · ${record.address}`:""}`;popup.append(link);}
            marker.bindPopup(popup,{maxWidth:Math.max(180,Math.min(340,container.current!.clientWidth-60)),maxHeight:260});
            marker.on("keydown",event=>{const key=(event.originalEvent as KeyboardEvent).key;if(key==="Enter" || key===" "){event.originalEvent.preventDefault();marker.openPopup();}});
          }
        }
        map.on("zoomend",drawSourceRecords);
        if (bounds.isValid()) map.fitBounds(bounds.pad(0.2), { maxZoom: 13, animate: false });
        drawSourceRecords();
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
      for (const root of popupRoots) root.unmount();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [opportunities, showDiscoveries, showTracked, router, sourceRecordPoints, trackedPoints, workflowDecisions]);

  return (
    <section className="vision-map-section" aria-label="Opportunity map">
      <div className="vision-map-heading">
        <div>
          <h2>Opportunities on the map</h2>
          <p className="t-meta">{sourceLocated} source or saved · {approximate} approximate · {unmapped} unmapped</p>
        </div>
        <div className="vision-map-controls">
          <button type="button" className="btn btn--quiet" disabled={!ready} onClick={() => mapRef.current?.zoomIn(undefined, { animate: false })}>Zoom in</button>
          <button type="button" className="btn btn--quiet" disabled={!ready} onClick={() => mapRef.current?.zoomOut(undefined, { animate: false })}>Zoom out</button>
          <button type="button" className="btn btn--quiet" disabled={!ready} onClick={() => mapRef.current?.setView([40.85, -73.05], 9, { animate: false })}>Long Island</button>
        </div>
      </div>
      <div className="vision-map-legend">
        <label><input type="checkbox" checked={showDiscoveries} onChange={e=>setShowDiscoveries(e.target.checked)} /><span className="vision-legend-discovery">◆</span> Source records awaiting review</label>
        <label><input type="checkbox" checked={showTracked} onChange={e=>setShowTracked(e.target.checked)} /> Tracked opportunities</label>
        <span className="vision-approximate-pin vision-approximate-pin--legend" aria-label="Approximate area marker">≈ Approximate area</span>
        {Object.entries(workflowDecisions ? {working:"Pursuing",done:"Won",open:"Other decisions"} : STATUS_LABEL).map(([state,label])=><span key={state} className={`vision-map-pin vision-map-pin--${state}`}><span className="vision-map-state" aria-hidden="true" />{label}</span>)}
      </div>
      {failure ? <p className="vision-map-notice" role="status">{failure}</p> : null}
      <div ref={container} className="vision-map-canvas" aria-label="Map of discovered and tracked opportunities" />
      {unmappedTracked.length>0?<details className="vision-off-map" open><summary>{unmappedTracked.length} tracked {unmappedTracked.length===1?"opportunity needs":"opportunities need"} a location</summary><ul>{unmappedTracked.map(item=><li key={item.id}><Link className="vision-link-pill" href={`/vision/${item.id}#location`}>{item.name}: resolve map location</Link></li>)}</ul></details>:null}
      <p className="vision-map-caption">Blue markers show source records with coordinates. Gold ≈ pills place records at a named area center because project coordinates are not known. Source-located and approximate records stay in separate groups. Open a marker to review each record. Policy context stays in the list. The map shows up to 500 matching source records per source; {unmapped} {unmapped===1?"record remains":"records remain"} unmapped.</p>
    </section>
  );
}
