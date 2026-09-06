"use client";

import Link from "next/link";
import "./[id]/location.css";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Map as LeafletMap } from "leaflet";
import { groupMapPoints, type DiscoveryMapPoint } from "@/lib/vision/map-points";
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
  const discovered=discoveries.filter(point=>point.latitude!==null && point.longitude!==null);
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
        for (const record of showTracked ? opportunities : []) {
          if (record.latitude === null || record.longitude === null) continue;
          const point = L.latLng(record.latitude, record.longitude);
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
        const discoveryLayer=L.layerGroup().addTo(map);
        if(showDiscoveries)for(const record of discoveries){if(record.latitude!==null && record.longitude!==null)bounds.extend([record.latitude,record.longitude]);}
        function drawDiscoveries(){
          discoveryLayer.clearLayers();
          if(!showDiscoveries)return;
          for(const group of groupMapPoints(discoveries,(lat,lng)=>map.project([lat,lng],map.getZoom()))){
            const latitude=group.reduce((sum,p)=>sum+p.latitude!,0)/group.length;
            const longitude=group.reduce((sum,p)=>sum+p.longitude!,0)/group.length;
            const pin=document.createElement("span");pin.className="vision-discovery-pin";
            pin.textContent=group.length===1?"◆":String(group.length);
            const description=group.length===1?`Review ${group[0].name}`:`Review ${group.length} discoveries in this area`;
            const marker=L.marker([latitude,longitude],{icon:L.divIcon({html:pin,className:"vision-map-marker",iconSize:[36,36],iconAnchor:[18,18]}),keyboard:true,title:description,alt:description}).addTo(discoveryLayer);
            marker.getElement()?.setAttribute("aria-label",description);
            const label=document.createElement("span");label.textContent=description;marker.bindTooltip(label);
            const popup=document.createElement("div");popup.className="vision-discovery-popup";
            const heading=document.createElement("strong");heading.textContent=group.length===1?"Discovered opportunity":`${group.length} discovered opportunities`;popup.append(heading);
            if(group.length>1){const zoom=document.createElement("button");zoom.className="btn btn--quiet";zoom.textContent="Zoom to this area";zoom.onclick=()=>{map.closePopup();map.setView([latitude,longitude],Math.min(18,map.getZoom()+2),{animate:false});};popup.append(zoom);}
            for(const record of group){const link=document.createElement("a");link.href=`/vision/discover?record=${record.id}`;link.textContent=`${record.name}${record.address?` · ${record.address}`:""}`;popup.append(link);}
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
  }, [opportunities, discoveries, showDiscoveries, showTracked, router, workflowDecisions]);

  return (
    <section className="vision-map-section" aria-label="Opportunity map">
      <div className="vision-map-heading">
        <div>
          <h2>Opportunities on the map</h2>
          <p className="t-meta">{discovered.length} discovered · {mapped.length} tracked with coordinates</p>
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
        {Object.entries(workflowDecisions ? {working:"Pursuing",done:"Won",open:"Other decisions"} : STATUS_LABEL).map(([state,label])=><span key={state} className={`vision-map-pin vision-map-pin--${state}`}><span className="vision-map-state" aria-hidden="true" />{label}</span>)}
      </div>
      {failure ? <p className="vision-map-notice" role="status">{failure}</p> : null}
      <div ref={container} className="vision-map-canvas" aria-label="Map of discovered and tracked opportunities" />
      {opportunities.length>mapped.length?<details className="vision-off-map" open><summary>{opportunities.length-mapped.length} tracked opportunities need a location</summary><ul>{opportunities.filter(item=>item.latitude===null||item.longitude===null).map(item=><li key={item.id}><Link href={`/vision/${item.id}#location`}>{item.name}: resolve map location</Link></li>)}</ul></details>:null}
      <p className="vision-map-caption">Blue markers show unreviewed source records, grouped by proximity. Open a marker to review its records. Each layer uses its own filters above. Policy context stays in the list. Discovery shows up to 500 matching records per source; {discoveries.length-discovered.length+opportunities.length-mapped.length} records have no coordinates.</p>
    </section>
  );
}
