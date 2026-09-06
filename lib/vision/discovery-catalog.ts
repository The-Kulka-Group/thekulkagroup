import { DISCOVERY_SOURCE } from "./discovery-source";

export const SUFFOLK_SOURCE = {
  id: "suffolk-planning",
  name: "Suffolk planning documents",
  url: "https://www.suffolkcountyny.gov/Departments/Economic-Development-and-Planning/Planning-and-Environment/Regulatory-Review/Suffolk-County-Planning-Commission",
  coverage: "Checks the current year's linked agendas, staff reports, meeting summaries and resolutions. Notices and drawing content are excluded. This covers county referrals, not every Suffolk project or local permit. Records without confirmed coordinates stay in the review list.",
};
export const NASSAU_IDA_SOURCE = {
  id: "nassau-ida",
  name: "Nassau IDA projects",
  url: "https://nassauida.org/projects-documents",
  coverage: "Checks the public project table and its linked document metadata, following up to 30 pages. Dates are listed document dates. IDA status describes financial assistance, not construction or bidding. PDF contents and map coordinates require review.",
};
export const SUFFOLK_IDA_SOURCE = {
  id: "suffolk-ida",
  name: "Suffolk IDA project filings",
  url: "https://suffolkida.org/resources/",
  coverage: "Checks named applications, abstracts and project hearing links in the first 15 resource entries. Older archive pages and the separate hearings tab are excluded. Dates are index meeting dates, not filing dates. PDF contents and project locations require review.",
};
export const DISCOVERY_SOURCES = [DISCOVERY_SOURCE, SUFFOLK_SOURCE, NASSAU_IDA_SOURCE, SUFFOLK_IDA_SOURCE];
