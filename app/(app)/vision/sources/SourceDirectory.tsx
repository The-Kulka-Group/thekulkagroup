"use client";

import Link from "next/link";
import {useMemo, useState} from "react";
import {ACCESS_MODES, COLLECTION_STATE_LABELS, JURISDICTION_TYPES, SOURCE_ACCESS, filterMunicipalSources, sourceCoverageSummary, sourceIsCollectable, sourceJurisdictions, sourceRecordFamilies, type MunicipalSource, type SourceAccessMode, type JurisdictionType} from "@/lib/vision/source-directory";
import {SourceBrand} from "../SourceBrand";
import {AUTOMATED_SOURCE_DEFINITIONS} from "@/lib/vision/source-registry";
import type {DiscoveryState} from "@/lib/vision/discovery";
import {SOURCE_RUN_OUTCOME_LABELS, visionDateTime} from "@/lib/vision/presentation";

const formatEnumLabel = (value: string) => value.replaceAll("-", " ").replace(/^./, letter => letter.toUpperCase());

export function SourceDirectory({sources,health={}}: {sources: MunicipalSource[];health?:Record<string,DiscoveryState>}) {
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
      <div><strong>{summary.localJurisdictions.total}</strong><span>local jurisdictions</span><small>Nassau has {summary.localJurisdictions.Nassau}, and Suffolk has {summary.localJurisdictions.Suffolk}.</small></div>
      <div><strong>{summary.directorySources}</strong><span>directory sources</span><small>There are {summary.countySources} county sources and {summary.directorySources - summary.countySources} local sources.</small></div>
      <div><strong>{summary.collectableSources}</strong><span>collectable sources</span><small>There are {summary.accessModes["public-online"]} manual, {summary.accessModes["request-or-contact"]} restricted, and {summary.accessModes["no-public-feed"]} no-public-feed sources.</small></div>
    </div>
    <p className="vision-source-coverage-note">The directory covers Nassau and Suffolk. Its {summary.directorySources} entries are official source routes, not projects. Vision can collect records from {summary.collectableSources} county and municipal sources. Each other entry states whether review, a records request or contact is required, or no public project feed was found.</p>
    <div className="vision-source-directory-heading">
      <div>
        <h2 id="source-directory-title">Municipal source directory</h2>
        <p>Each entry states which fields the source makes available and whether Vision collects them.</p>
      </div>
      <output className="t-meta" aria-live="polite">The directory shows {filtered.length} of {sources.length} sources.</output>
    </div>
    <div className="vision-source-filters" aria-label="Filter municipal sources">
      <label>County<select className="input" value={county} onChange={event => setCounty(event.target.value as typeof county)}><option value="">All counties</option><option value="Nassau">Nassau</option><option value="Suffolk">Suffolk</option></select></label>
      <label>Location<select className="input" value={jurisdiction} onChange={event => setJurisdiction(event.target.value)}><option value="">All locations</option>{jurisdictions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label>Municipality type<select className="input" value={jurisdictionType} onChange={event => setJurisdictionType(event.target.value as typeof jurisdictionType)}><option value="">All types</option>{JURISDICTION_TYPES.map(value => <option key={value} value={value}>{formatEnumLabel(value)}</option>)}</select></label>
      <label>Record type<select className="input" value={recordFamily} onChange={event => setRecordFamily(event.target.value)}><option value="">All records</option>{recordFamilies.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>Access<select className="input" value={accessMode} onChange={event => setAccessMode(event.target.value as typeof accessMode)}><option value="">All access</option>{ACCESS_MODES.map(value => <option key={value} value={value}>{SOURCE_ACCESS[value].filterLabel}</option>)}</select></label>
    </div>
    <SourceDirectoryResults sources={filtered} health={health}/>
  </section>;
}

export function SourceDirectoryResults({sources,health={}}: {sources: MunicipalSource[];health?:Record<string,DiscoveryState>}) {
  return sources.length ? <div className="vision-source-grid">
      {sources.map(source => {
        const query = new URLSearchParams({sourceTitle: source.name, sourceUrl: source.url});
        const definition=AUTOMATED_SOURCE_DEFINITIONS.find(item=>item.id===source.id),status=health[source.id];
        return <article className="vision-directory-card" data-access-mode={source.accessMode} data-collection-state={source.collectionState} key={source.id}>
          <div className="vision-source-card-heading">
            <p className="t-meta">{source.jurisdictionType === "county" ? `This is a ${source.county} County source.` : `This source covers ${source.jurisdiction}, a ${source.jurisdictionType} in ${source.county} County.`}</p>
            <span className="vision-source-access" aria-label={`Access: ${SOURCE_ACCESS[source.accessMode].filterLabel}`}>{COLLECTION_STATE_LABELS[source.collectionState]}</span>
          </div>
          <h2><SourceBrand id={source.id} name={source.name}/></h2>
          <p className="t-meta">{source.officialAgency} publishes this source.</p>
          <p>{source.coverage}</p>
          <dl className="vision-source-capabilities">
            <div><dt>What this source publishes</dt><dd>{source.recordFamilies.join(", ")}</dd></div>
            <div><dt>{sourceIsCollectable(source) ? "Vision can retrieve" : "Fields available from source"}</dt><dd>{source.availableFields.join(", ")}</dd></div>
            <div><dt>Manual step or access need</dt><dd>{source.manualSteps}</dd></div>
            <div><dt>Coverage and limits</dt><dd>{source.limits}</dd></div>
          </dl>
          <p className="t-meta vision-source-checked">We checked this source on {new Intl.DateTimeFormat("en-US", {month: "long", day: "numeric", year: "numeric", timeZone: "UTC"}).format(new Date(source.checkedAt))}.</p>
          {definition?<div className="vision-source-health" aria-label={`${source.name} collection health`}>
            <span className="chip chip--neutral">Daily schedule</span>
            <span className="chip chip--neutral">Latest outcome: {status?.last_outcome?SOURCE_RUN_OUTCOME_LABELS[status.last_outcome]:"Not checked"}</span>
            <span className="chip chip--neutral">{status?.record_count??0} records</span>
            <p className="t-meta">Last completed: {visionDateTime(status?.last_success_at)}.</p>
            {status?.last_error?<p className="input-error">{status.last_error}</p>:null}
          </div>:null}
          <div className="vision-source-actions">
            <a className="btn btn--primary" href={source.url} target="_blank" rel="noopener noreferrer">Open official source</a>
            <Link className="btn btn--quiet" href={`/vision/new?${query}`}>Add an opportunity</Link>
          </div>
        </article>;
      })}
    </div> : <div className="vision-source-empty"><h2>No sources match these filters.</h2><p>Change or clear a filter to see more official sources.</p></div>;
}
