"use client";

import Link from "next/link";
import "./[id]/location.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Map as LeafletMap } from "leaflet";
import { buildMapPoint, buildMapPoints, groupMapPoints, type DiscoveryMapPoint } from "@/lib/vision/map-points";
import type { VisionOpportunity } from "@/lib/vision/types";
import { WORKFLOW_LABELS } from "@/lib/vision/presentation";
import { STATUS_LABEL } from "@/lib/data";
import "leaflet/dist/leaflet.css";
import "./map.css";

export function OpportunityMap({ opportunities, discoveries, workflowDecisions }: { opportunities: VisionOpportunity[]; discoveries:DiscoveryMapPoint[]; workflowDecisions?:Record<string,keyof typeof WORKFLOW_LABELS> }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const router = useRouter();
  const [failure, setFailure] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [showDiscoveries,setShowDiscoveries]=useState(true);
  const [showTracked,setShowTracked]=useState(true);
  const discoveryPoints = useMemo(() => buildMapPoints(discoveries), [discoveries]);
  const trackedPoints = useMemo(() => buildMapPoints(opportunities), [opportunities]);
  const sourceLocated = discoveryPoints.filter(point => point.precision === "source").length + trackedPoints.filter(point => point.precision === "source").length;
  const approximate = discoveryPoints.filter(point => point.precision === "approximate").length + trackedPoints.filter(point => point.precision === "approximate").length;
  const unmapped = discoveries.length + opportunities.length - discoveryPoints.length - trackedPoints.length;
  const approximateDiscoveries = discoveryPoints.filter(point => point.precision === "approximate");
  const approximateTracked = trackedPoints.filter(point => point.precision === "approximate");

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
        const trackedById = new Map(opportunities.map(record => [record.id, record]));
        for (const record of showTracked ? opportunities : []) {
          const displayPoint = buildMapPoint(record);
          if (!displayPoint || displayPoint.precision !== "source") continue;
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
        if (showTracked) for (const group of groupMapPoints(opportunities, (lat, lng) => map.project([lat, lng], map.getZoom())).filter(item => item.precision === "approximate")) {
          bounds.extend([group.latitude, group.longitude]);
          const area = group.area!;
          const pin = document.createElement("span");
          pin.className = "vision-approximate-pin";
          pin.textContent = group.points.length === 1 ? `≈ ${trackedById.get(group.points[0].id)?.sheetNumber ?? "1"}` : `≈ ${group.points.length}`;
          const description = group.points.length === 1
            ? `Approximate ${area} area. Open ${group.points[0].name}`
            : `Approximate ${area} area. Open ${group.points.length} tracked opportunities`;
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
          popup.className = "vision-discovery-popup";
          const heading = document.createElement("strong");
          heading.textContent = `${group.points.length} tracked ${group.points.length === 1 ? "opportunity" : "opportunities"} in the approximate ${area} area`;
          const note = document.createElement("span");
          note.className = "vision-popup-location-note";
          note.textContent = `Placed at the ${area} area center. Project coordinates are not known.`;
          popup.append(heading, note);
          for (const point of group.points) {
            const record = trackedById.get(point.id)!;
            const link = document.createElement("a");
            link.className = "vision-popup-link";
            link.href = `/vision/${record.id}`;
            link.textContent = `${record.sheetNumber} · ${record.name}`;
            popup.append(link);
          }
          marker.bindPopup(popup, {maxWidth: Math.max(220, Math.min(360, container.current!.clientWidth - 60)), maxHeight: 260});
          marker.on("keydown", event => {
            const key = (event.originalEvent as KeyboardEvent).key;
            if (key === "Enter" || key === " ") {
              event.originalEvent.preventDefault();
              marker.openPopup();
            }
          });
        }
        const discoveryLayer=L.layerGroup().addTo(map);
        if(showDiscoveries)for(const point of discoveryPoints)bounds.extend([point.displayLatitude,point.displayLongitude]);
        function drawDiscoveries(){
          discoveryLayer.clearLayers();
          if(!showDiscoveries)return;
          for(const group of groupMapPoints(discoveries,(lat,lng)=>map.project([lat,lng],map.getZoom()))){
            const {latitude,longitude}=group;
            const pin=document.createElement("span");pin.className=group.precision==="approximate"?"vision-approximate-pin vision-approximate-pin--discovery":"vision-discovery-pin";
            pin.textContent=group.precision==="approximate"?`≈ ${group.points.length}`:group.points.length===1?"◆":String(group.points.length);
            const description=group.precision==="approximate"
              ? `Approximate ${group.area} area. Review ${group.points.length===1?group.points[0].name:`${group.points.length} discoveries`}`
              : group.points.length===1?`Review ${group.points[0].name}`:`Review ${group.points.length} discoveries in this area`;
            const marker=L.marker([latitude,longitude],{icon:L.divIcon({html:pin,className:"vision-map-marker",iconSize:group.precision==="approximate"?[56,36]:[36,36],iconAnchor:group.precision==="approximate"?[28,18]:[18,18]}),keyboard:true,title:description,alt:description}).addTo(discoveryLayer);
            marker.getElement()?.setAttribute("aria-label",description);
            const label=document.createElement("span");label.textContent=description;marker.bindTooltip(label);
            const popup=document.createElement("div");popup.className="vision-discovery-popup";
            const heading=document.createElement("strong");heading.textContent=group.precision==="approximate"?`${group.points.length} ${group.points.length===1?"discovery":"discoveries"} in the approximate ${group.area} area`:group.points.length===1?"Discovered opportunity":`${group.points.length} discovered opportunities`;popup.append(heading);
            if(group.precision==="approximate"){
              const note=document.createElement("span");note.className="vision-popup-location-note";note.textContent=`Placed at the ${group.area} area center. Project coordinates are not known.`;popup.append(note);
            }
            if(group.points.length>1 && group.precision==="source"){const zoom=document.createElement("button");zoom.className="btn btn--quiet";zoom.textContent="Zoom to this area";zoom.onclick=()=>{map.closePopup();map.setView([latitude,longitude],Math.min(18,map.getZoom()+2),{animate:false});};popup.append(zoom);}
            for(const record of group.points){const link=document.createElement("a");link.className="vision-popup-link";link.href=`/vision/discover?record=${record.id}`;link.textContent=`${record.name}${record.address?` · ${record.address}`:""}`;popup.append(link);}
            marker.bindPopup(popup,{maxWidth:Math.max(180,Math.min(340,container.current!.clientWidth-60)),maxHeight:260});
            marker.on("keydown",event=>{const key=(event.originalEvent as KeyboardEvent).key;if(key==="Enter" || key===" "){event.originalEvent.preventDefault();marker.openPopup();}});
          }
        }
        map.on("zoomend",drawDiscoveries);
        if (bounds.isValid()) map.fitBounds(bounds.pad(0.2), { maxZoom: 13, animate: false });
        drawDiscoveries();
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
  }, [opportunities, discoveries, discoveryPoints, showDiscoveries, showTracked, router, workflowDecisions]);

  return (
    <section className="vision-map-section" aria-label="Opportunity map">
      <div className="vision-map-heading">
        <div>
          <h2>Opportunities on the map</h2>
          <p className="t-meta">{sourceLocated} with source or saved coordinates · {approximate} approximate · {unmapped} unmapped</p>
        </div>
        <div className="vision-map-controls">
          <button type="button" className="btn btn--quiet" disabled={!ready} onClick={() => mapRef.current?.zoomIn(undefined, { animate: false })}>Zoom in</button>
          <button type="button" className="btn btn--quiet" disabled={!ready} onClick={() => mapRef.current?.zoomOut(undefined, { animate: false })}>Zoom out</button>
          <button type="button" className="btn btn--quiet" disabled={!ready} onClick={() => mapRef.current?.setView([40.85, -73.05], 9, { animate: false })}>Long Island</button>
        </div>
      </div>
      <div className="vision-map-legend">
        <label><input type="checkbox" checked={showDiscoveries} onChange={e=>setShowDiscoveries(e.target.checked)} /><span className="vision-legend-discovery">◆</span> Discoveries awaiting review</label>
        <label><input type="checkbox" checked={showTracked} onChange={e=>setShowTracked(e.target.checked)} /> Tracked opportunities</label>
        <span className="vision-approximate-pin vision-approximate-pin--legend" aria-label="Approximate area marker">≈ Approximate area</span>
        {Object.entries(workflowDecisions ? {working:"Pursuing",done:"Won",open:"Other decisions"} : STATUS_LABEL).map(([state,label])=><span key={state} className={`vision-map-pin vision-map-pin--${state}`}><span className="vision-map-state" aria-hidden="true" />{label}</span>)}
      </div>
      {failure ? <p className="vision-map-notice" role="status">{failure}</p> : null}
      <div ref={container} className="vision-map-canvas" aria-label="Map of discovered and tracked opportunities" />
      {approximate > 0 ? <details className="vision-approximate-records">
        <summary><span>≈ Approximate areas</span><span className="num">{approximate}</span></summary>
        <p>These records appear at a named area center because their project coordinates are not known.</p>
        <ul>
          {approximateDiscoveries.map(point => <li key={`discovery-${point.id}`}><Link className="vision-link-pill" href={`/vision/discover?record=${point.id}`}>≈ {point.area} area · {point.name}</Link></li>)}
          {approximateTracked.map(point => <li key={`tracked-${point.id}`}><Link className="vision-link-pill" href={`/vision/${point.id}`}>≈ {point.area} area · {point.name}</Link></li>)}
        </ul>
      </details> : null}
      {opportunities.length>trackedPoints.length?<details className="vision-off-map" open><summary>{opportunities.length-trackedPoints.length} tracked {opportunities.length-trackedPoints.length===1?"opportunity needs":"opportunities need"} a location</summary><ul>{opportunities.filter(item=>buildMapPoint(item)===null).map(item=><li key={item.id}><Link className="vision-link-pill" href={`/vision/${item.id}#location`}>{item.name}: resolve map location</Link></li>)}</ul></details>:null}
      <p className="vision-map-caption">Blue markers show source records with coordinates. Gold ≈ pills place records at a named area center because project coordinates are not known. Exact and approximate records stay in separate groups. Open a marker to review each record. Policy context stays in the list. Discovery shows up to 500 matching records per source; {unmapped} {unmapped===1?"record remains":"records remain"} unmapped.</p>
    </section>
  );
}
