"use client";

import Image from "next/image";
import {useState} from "react";
import "./source-brand.css";

const LOGOS: Record<string, {src: string; shape: "seal" | "wordmark"; dark?: boolean}> = {
  "nassau-applications": {src: "/vision/sources/nassau-county.ico", shape: "seal"},
  "nassau-hearings": {src: "/vision/sources/nassau-county.ico", shape: "seal"},
  "suffolk-planning": {src: "/vision/sources/suffolk-county.png", shape: "seal"},
  "nassau-ida": {src: "/vision/sources/nassau-ida.svg", shape: "wordmark", dark: true},
  "suffolk-ida": {src: "/vision/sources/suffolk-ida.png", shape: "wordmark"},
  "huntington-meetings": {src: "/vision/sources/huntington.png", shape: "wordmark"},
  "smithtown-meetings": {src: "/vision/sources/smithtown.ico", shape: "seal"},
};

export function SourceBrand({id, name, compact = false}: {id: string; name: string; compact?: boolean}) {
  const logo = LOGOS[id];
  const [failed, setFailed] = useState(false);
  const initials = name.split(/\s+/).slice(0, 2).map(word => word[0]).join("");
  return <span className={`vision-source-brand${compact ? " vision-source-brand--compact" : ""}`}>
    <span className={`vision-source-logo vision-source-logo--${logo?.shape ?? "seal"}${logo?.dark ? " vision-source-logo--dark" : ""}`} aria-hidden="true">
      {logo && !failed
        ? <Image src={logo.src} alt="" width={160} height={64} unoptimized onError={() => setFailed(true)} />
        : <span className="vision-source-initials">{initials}</span>}
    </span>
    <span className="vision-source-name">{name}</span>
  </span>;
}
