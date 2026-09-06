"use client";
import {useEffect,useRef,useState} from "react";
import type {Map as LeafletMap,Marker} from "leaflet";
import "leaflet/dist/leaflet.css";
import "../map.css";
export function LocationMap({latitude,longitude,onChange,editable=true}:{latitude:number|null;longitude:number|null;editable?:boolean;onChange:(latitude:number,longitude:number)=>void}) {
  const container=useRef<HTMLDivElement>(null);
  const map=useRef<LeafletMap|null>(null),marker=useRef<Marker|null>(null);
  const change=useRef(onChange);
  const canEdit=useRef(editable);
  useEffect(()=>{change.current=onChange;canEdit.current=editable;},[onChange,editable]);
  const [ready,setReady]=useState(false),[error,setError]=useState("");
  useEffect(()=>{
    let disposed=false; let resize:ResizeObserver|undefined;
    const timeout=window.setTimeout(()=>{if(!disposed)setError("The basemap is taking too long to load. You can enter coordinates below.");},12000);
    void import("leaflet").then(L=>{
      if(disposed||!container.current)return;
      const instance=L.map(container.current,{scrollWheelZoom:false}).setView([40.85,-73.05],9);map.current=instance;
      const tiles=L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(instance);
      tiles.on("tileload",()=>window.clearTimeout(timeout));
      tiles.on("tileerror",()=>{if(!disposed)setError("Some basemap tiles could not load. You can enter coordinates below.");});
      instance.on("click",event=>{if(canEdit.current)change.current(event.latlng.lat,event.latlng.lng);});
      resize=new ResizeObserver(()=>instance.invalidateSize());resize.observe(container.current);setReady(true);
    }).catch(()=>{if(!disposed)setError("The map could not load. You can enter coordinates below.");});
    return()=>{disposed=true;window.clearTimeout(timeout);resize?.disconnect();map.current?.remove();map.current=null;marker.current=null;};
  },[]);
  useEffect(()=>{
    let disposed=false;
    void import("leaflet").then(L=>{
      if(disposed||!map.current)return;
      marker.current?.remove();marker.current=null;
      if(latitude===null||longitude===null)return;
      const icon=L.divIcon({html:'<span class="vision-map-pin vision-map-pin--open"><span class="vision-map-state"></span>Pin</span>',className:"vision-map-marker",iconSize:[64,36],iconAnchor:[32,18]});
      const pin=L.marker([latitude,longitude],{icon,draggable:editable,title:editable?"Proposed location. Drag to adjust or use the coordinate fields.":"Saved location"}).addTo(map.current);
      pin.on("dragend",()=>{const point=pin.getLatLng();change.current(point.lat,point.lng);});marker.current=pin;
      map.current.setView([latitude,longitude],Math.max(15,map.current.getZoom()),{animate:false});
    });
    return()=>{disposed=true;};
  },[latitude,longitude,ready,editable]);
  return <><div ref={container} className="vision-map-canvas location-map" aria-label={editable?"Location preview. Click to place a pin, or use the coordinate fields below.":"Saved map location"}/>{error?<p role="status">{error}</p>:null}</>;
}
