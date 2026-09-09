"use client";

import Link from "next/link";
import {useMemo, useState} from "react";
import {ACCESS_MODES, ACCESS_MODE_LABELS, JURISDICTION_TYPES, filterMunicipalSources, sourceRecordFamilies, type MunicipalSource, type SourceAccessMode, type JurisdictionType} from "@/lib/vision/source-directory";
import {SourceBrand} from "../SourceBrand";

const title = (value: string) => value.replaceAll("-", " ").replace(/^./, letter => letter.toUpperCase());

export function SourceDirectory({sources}: {sources: MunicipalSource[]}) {
  const [county, setCounty] = useState<"" | MunicipalSource["county"]>("");
  const [jurisdictionType, setJurisdictionType] = useState<"" | JurisdictionType>("");
  const [recordFamily, setRecordFamily] = useState("");
  const [accessMode, setAccessMode] = useState<"" | SourceAccessMode>("");
  const recordFamilies = useMemo(() => sourceRecordFamilies(sources), [sources]);
  const filtered = filterMunicipalSources(sources, {county, jurisdictionType, recordFamily, accessMode});

  return <section aria-labelledby="source-directory-title">
    <div className="vision-source-directory-heading">
      <div>
        <h2 id="source-directory-title">Municipal source directory</h2>
        <p>Each entry states what the publisher makes available and what Vision can retrieve.</p>
      </div>
      <p className="t-meta" role="status">{filtered.length} of {sources.length} sources shown</p>
    </div>
    <div className="vision-source-filters" aria-label="Filter municipal sources">
      <label>County<select value={county} onChange={event => setCounty(event.target.value as typeof county)}><option value="">All counties</option><option value="Nassau">Nassau</option><option value="Suffolk">Suffolk</option></select></label>
      <label>Jurisdiction<select value={jurisdictionType} onChange={event => setJurisdictionType(event.target.value as typeof jurisdictionType)}><option value="">All types</option>{JURISDICTION_TYPES.map(value => <option key={value} value={value}>{title(value)}</option>)}</select></label>
      <label>Record type<select value={recordFamily} onChange={event => setRecordFamily(event.target.value)}><option value="">All records</option>{recordFamilies.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>Access<select value={accessMode} onChange={event => setAccessMode(event.target.value as typeof accessMode)}><option value="">All access</option>{ACCESS_MODES.map(value => <option key={value} value={value}>{ACCESS_MODE_LABELS[value]}</option>)}</select></label>
    </div>
    {filtered.length ? <div className="vision-source-grid">
      {filtered.map(source => {
        const query = new URLSearchParams({sourceTitle: source.name, sourceUrl: source.url});
        return <article className="vision-directory-card" data-collection-state={source.collectionState} key={source.id}>
          <div className="vision-source-card-heading">
            <p className="t-meta">{source.jurisdiction} · {title(source.jurisdictionType)}</p>
            <span className={`vision-source-state vision-source-state--${source.collectionState}`}>{ACCESS_MODE_LABELS[source.accessMode]}</span>
          </div>
          <h2><SourceBrand id={source.id} name={source.name}/></h2>
          <p className="t-meta">Published by {source.officialAgency}</p>
          <p>{source.coverage}</p>
          <dl className="vision-source-capabilities">
            <div><dt>Records</dt><dd>{source.recordFamilies.join(", ")}</dd></div>
            <div><dt>Vision can retrieve</dt><dd>{source.retrievableFields.join(", ")}</dd></div>
            <div><dt>What you need to do</dt><dd>{source.manualSteps}</dd></div>
            <div><dt>Coverage and limits</dt><dd>{source.limits}</dd></div>
          </dl>
          <p className="t-meta">Checked {new Intl.DateTimeFormat("en-US", {month: "long", day: "numeric", year: "numeric", timeZone: "UTC"}).format(new Date(source.checkedAt))}</p>
          <div className="vision-source-actions">
            <a className="btn btn--primary" href={source.url} target="_blank" rel="noopener noreferrer">Open official source</a>
            <Link className="btn btn--quiet" href={`/vision/new?${query}`}>Add an opportunity</Link>
          </div>
        </article>;
      })}
    </div> : <div className="vision-source-empty"><h2>No sources match these filters.</h2><p>Change or clear a filter to see more official sources.</p></div>}
  </section>;
}

