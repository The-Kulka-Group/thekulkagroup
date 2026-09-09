"use client";

import Link from "next/link";
import {useMemo, useState} from "react";
import {ACCESS_MODES, ACCESS_MODE_LABELS, ACCESS_MODE_STATUS_LABELS, COLLECTION_STATE_STATUS, JURISDICTION_TYPES, filterMunicipalSources, sourceCoverageSummary, sourceJurisdictions, sourceRecordFamilies, type MunicipalSource, type SourceAccessMode, type JurisdictionType} from "@/lib/vision/source-directory";
import {SourceBrand} from "../SourceBrand";

const formatEnumLabel = (value: string) => value.replaceAll("-", " ").replace(/^./, letter => letter.toUpperCase());

export function SourceDirectory({sources}: {sources: MunicipalSource[]}) {
  const [county, setCounty] = useState<"" | MunicipalSource["county"]>("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [jurisdictionType, setJurisdictionType] = useState<"" | JurisdictionType>("");
  const [recordFamily, setRecordFamily] = useState("");
  const [accessMode, setAccessMode] = useState<"" | SourceAccessMode>("");
  const recordFamilies = useMemo(() => sourceRecordFamilies(sources), [sources]);
  const jurisdictions = useMemo(() => sourceJurisdictions(sources), [sources]);
  const summary = useMemo(() => sourceCoverageSummary(sources), [sources]);
  const filtered = filterMunicipalSources(sources, {county, jurisdiction, jurisdictionType, recordFamily, accessMode});

  return <section aria-labelledby="source-directory-title">
    <div className="vision-source-summary" aria-label="Long Island source coverage">
      <div><strong>{summary.localJurisdictions.total}</strong><span>local jurisdictions</span><small>{summary.localJurisdictions.Nassau} Nassau · {summary.localJurisdictions.Suffolk} Suffolk</small></div>
      <div><strong>{summary.directorySources}</strong><span>directory sources</span><small>{summary.countySources} county-level · {summary.directorySources - summary.countySources} local-source entries</small></div>
      <div><strong>{summary.collectableSources}</strong><span>collectable sources</span><small>{summary.accessModes["public-online"]} public manual · {summary.accessModes["request-or-contact"]} request or contact · {summary.accessModes["no-public-feed"]} no public feed</small></div>
    </div>
    <p className="vision-source-coverage-note">The directory covers Nassau and Suffolk. Its {summary.directorySources} entries are official source routes, not projects. Vision can collect records from {summary.collectableSources} county sources. Each other entry states whether review, a records request or contact is required, or no public project feed was found.</p>
    <div className="vision-source-directory-heading">
      <div>
        <h2 id="source-directory-title">Municipal source directory</h2>
        <p>Each entry states which fields the source makes available and whether Vision collects them.</p>
      </div>
      <p className="t-meta" role="status">{filtered.length} of {sources.length} sources shown</p>
    </div>
    <div className="vision-source-filters" aria-label="Filter municipal sources">
      <label>County<select value={county} onChange={event => setCounty(event.target.value as typeof county)}><option value="">All counties</option><option value="Nassau">Nassau</option><option value="Suffolk">Suffolk</option></select></label>
      <label>Location<select value={jurisdiction} onChange={event => setJurisdiction(event.target.value)}><option value="">All locations</option>{jurisdictions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label>Municipality type<select value={jurisdictionType} onChange={event => setJurisdictionType(event.target.value as typeof jurisdictionType)}><option value="">All types</option>{JURISDICTION_TYPES.map(value => <option key={value} value={value}>{formatEnumLabel(value)}</option>)}</select></label>
      <label>Record type<select value={recordFamily} onChange={event => setRecordFamily(event.target.value)}><option value="">All records</option>{recordFamilies.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>Access<select value={accessMode} onChange={event => setAccessMode(event.target.value as typeof accessMode)}><option value="">All access</option>{ACCESS_MODES.map(value => <option key={value} value={value}>{ACCESS_MODE_LABELS[value]}</option>)}</select></label>
    </div>
    <SourceDirectoryResults sources={filtered}/>
  </section>;
}

export function SourceDirectoryResults({sources}: {sources: MunicipalSource[]}) {
  return sources.length ? <div className="vision-source-grid">
      {sources.map(source => {
        const query = new URLSearchParams({sourceTitle: source.name, sourceUrl: source.url});
        return <article className="vision-directory-card" data-access-mode={source.accessMode} data-collection-state={source.collectionState} key={source.id}>
          <div className="vision-source-card-heading">
            <p className="t-meta">{source.jurisdiction} · {formatEnumLabel(source.jurisdictionType)}</p>
            <span className={`status-block status-block--${COLLECTION_STATE_STATUS[source.collectionState]} vision-source-state`} aria-label={ACCESS_MODE_LABELS[source.accessMode]}>{ACCESS_MODE_STATUS_LABELS[source.accessMode]}</span>
          </div>
          <h2><SourceBrand id={source.id} name={source.name}/></h2>
          <p className="t-meta">{source.officialAgency} publishes this source.</p>
          <p>{source.coverage}</p>
          <dl className="vision-source-capabilities">
            <div><dt>What this source publishes</dt><dd>{source.recordFamilies.join(", ")}</dd></div>
            <div><dt>{source.collectionState === "collectable" ? "Vision can retrieve" : "Fields available from source"}</dt><dd>{source.retrievableFields.join(", ")}</dd></div>
            <div><dt>Manual step or access need</dt><dd>{source.manualSteps}</dd></div>
            <div><dt>Coverage and limits</dt><dd>{source.limits}</dd></div>
          </dl>
          <p className="t-meta vision-source-checked">We checked this source on {new Intl.DateTimeFormat("en-US", {month: "long", day: "numeric", year: "numeric", timeZone: "UTC"}).format(new Date(source.checkedAt))}.</p>
          <div className="vision-source-actions">
            <a className="btn btn--primary" href={source.url} target="_blank" rel="noopener noreferrer">Open official source</a>
            <Link className="btn btn--quiet" href={`/vision/new?${query}`}>Add an opportunity</Link>
          </div>
        </article>;
      })}
    </div> : <div className="vision-source-empty"><h2>No sources match these filters.</h2><p>Change or clear a filter to see more official sources.</p></div>;
}
