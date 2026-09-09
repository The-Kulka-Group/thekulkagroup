import { AUTOMATED_SOURCE_DEFINITIONS } from "./source-registry";

function catalogSource(id: string) {
  const source = AUTOMATED_SOURCE_DEFINITIONS.find(item => item.id === id);
  if (!source) throw new Error(`Missing automated source definition: ${id}`);
  return { id: source.id, name: source.name, url: source.directoryUrl, coverage: source.coverage };
}

export const DISCOVERY_SOURCE = catalogSource("nassau-applications");
export const SUFFOLK_SOURCE = catalogSource("suffolk-planning");
export const NASSAU_IDA_SOURCE = catalogSource("nassau-ida");
export const SUFFOLK_IDA_SOURCE = catalogSource("suffolk-ida");
export const DISCOVERY_SOURCES = AUTOMATED_SOURCE_DEFINITIONS.map(source => catalogSource(source.id));
