# Published cost indexes for Kulka conceptual budgeting

Researched 16 September 2026. Every claim below carries the URL it came from. Where a
price or a licence term is not published, this document says so rather than guessing.

## What Kulka needs

Two jobs from one source if possible:

1. Move a cost from a past buyout date to a future buyout date. Jobs span 2023 to 2026.
2. Move a cost between markets. Nassau and Suffolk counties are the home market, with
   occasional work in Westchester, the Bronx, Queens and northern New Jersey.

The reason for buying a published index is that a developer can check it. It is not the
contractor's opinion.

## The short answer up front

No single provider gives Kulka one index that does both jobs cleanly and comes with a
licence that clearly permits putting the numbers inside their own software. The two
obvious names both rule themselves out of half the job in their own words. ENR says do not
use its indexes to compare cities. Gordian says do not use its City Cost Index to compare
years.

## Comparison table

| Provider and index | Covers time | Covers location | Licence permits programmatic use | Delivery | Long Island granularity | Revision policy | Cost |
|---|---|---|---|---|---|---|---|
| ENR Construction Cost Index and Building Cost Index | Yes, monthly, back to 1913 base | Publisher says no | No. Site terms ban automated access. Separate ENR Cost Data terms not published | Web pages, monthly magazine, separate ENR Cost Data dashboard with Excel and CSV download | New York City only. Nothing for Nassau or Suffolk | Restates history when it judges a component wrong, as it did for March 2004 steel. No fixed schedule published | Not published for ENR Cost Data |
| RSMeans City Cost Index (Gordian) | Publisher says no | Yes, 970 locations by three-digit ZIP | No under the standard user agreement. Needs written permission from Gordian | Web app, quarterly PDF, books | Splits Nassau and eastern Suffolk, but not cleanly. See below | Reissued quarterly on a new base each year. Old quarters stay as published | Published. From $996.55 a year to $4,714.85 a year by dataset |
| RSMeans Historical Cost Index (Gordian) | Yes, national, base January 1993 | No, national only | Same as above | Bundled with an RSMeans subscription | National only | Not published | Included in the subscription prices above |
| Gordian Data Insights, Cost Trends | Yes, 10 years back, 3 years forward | Yes, 970+ locations | Not published | Dashboard on Gordian Cloud Platform. Export and API not stated | Same ZIP coverage as the City Cost Index | Not published | Not published |
| Turner Building Cost Index | Yes, quarterly | No, national only | Not published | Free quarterly PDF | None | Not published | Free |
| Mortenson Construction Cost Index | Yes, quarterly | Eight metros, none in the northeast | Not published | Free quarterly web report | None | Not published | Free |
| BLS Producer Price Index, construction | Yes, monthly | No, national weighted averages only | Yes. Public domain, free API | JSON API, Excel, web tables | None | Revised monthly for four months, then final | Free |
| FRED (BLS series republished) | Yes, monthly | No | Restricted. Non-commercial framing, and an explicit bar on AI use | REST API with a key | None | Follows the source | Free |
| Rider Levett Bucknall Quarterly Cost Report | Yes, quarterly back data | 18 US markets including New York | Not published | Free PDF | New York metro only | Not published | Free |
| Cumming Group Market Analysis | Yes, quarterly | Regional and city commentary | Not published | Free PDF | New York metro only | Not published | Free |

## Provider by provider

### Engineering News-Record

ENR publishes a Construction Cost Index, a Building Cost Index, a Materials Price Index, a
Skilled Labor Index and a Common Labor Index, for 20 US cities and a 20-city average, with
1913 as the base year
([enr.com/economics/historical_indices](https://www.enr.com/economics/historical_indices),
[enr.com/economics/faq](https://www.enr.com/economics/faq)). The 20 cities are Atlanta,
Baltimore, Birmingham, Boston, Chicago, Cincinnati, Cleveland, Dallas, Denver, Detroit,
Kansas City, Los Angeles, Minneapolis, New Orleans, New York, Philadelphia, Pittsburgh,
San Francisco, Seattle and St. Louis
([enr.com/economics](https://www.enr.com/economics)).

ENR tells users not to do the second job. Its own guide says "Do not use indexes to measure
cost differentials between cities", because price gaps between cities come from labour
productivity, building codes and local discounting, not from the index components
([enr.com/articles/1718](https://www.enr.com/articles/1718-how-to-use-enr-8217-s-cost-indexes)).
That guide also warns that the indexes are not seasonally adjusted, that they use spot
prices from a single supplier each month, and that a reader should not study movements over
periods shorter than 12 months.

A city index uses local prices for portland cement and 2x4 lumber, the national average
price for structural steel, and local union wages plus fringes
([enr.com/economics/historical_indices](https://www.enr.com/economics/historical_indices)).
So the New York index tracks New York City union labour, which is a different labour market
from Nassau and Suffolk.

On revisions, ENR revises when it judges a component wrong. Its own example is the March
2004 indexes, which it restated after steel surcharges landed
([enr.com/economics/faq](https://www.enr.com/economics/faq)). There is no published
schedule and no published vintage archive.

The licence is the blocker. BNP Media, which publishes ENR, states in its site terms that
"Accessing or using the Website via mechanical, programmatic, robotic, scripted or any
other automated means is strictly prohibited", and adds that the materials may not be used
for the training or deployment of any artificial intelligence tool
([BNP Media Terms and Conditions of Use, October 2024](https://www.bnpmedia.com/wp-content/uploads/2024/11/BNP_Media-Website_Terms_and_Conditions.pdf)).
The same document says "YOU MAY NOT COPY ANY MATERIAL FROM ANY SITE WITHOUT OUR EXPRESS
PERMISSION IN FOR FORM OF A RECORD SIGNED BY US."

ENR sells a separate product, the ENR Construction Cost Data Dashboard, covering materials
prices, labour and equipment rates and the indexes for the 20 cities
([enr.com/Cost-Data-Dashboard](https://www.enr.com/Cost-Data-Dashboard)). ENR's own launch
article says users can "download it as an Excel or CSV file"
([enr.com/articles/56444](https://www.enr.com/articles/56444-enrs-new-construction-cost-data-dashboard-makes-debut)).
Prices are not published on that page. Whether that product carries a licence that allows
programmatic use is also not published.

### RSMeans, from Gordian

Two separate products do the two jobs.

The City Cost Index compares the cost of a standard project in a given place against the
national average of 30 major cities. The index base is July of the previous year and the
national average equals 100. It is built from 66 materials, 21 trades and six pieces of
equipment. Gordian tells users not to use it to "Compare construction prices across
different years" or to "Predict price trends over time and for a specific location"
([gordian.com, City Cost Index: Everything You Need to Know](https://www.gordian.com/resources/city-cost-index-everything-need-know/)).

The Historical Cost Index does the time job. Gordian says it "is a better measure of the
changes in construction costs over an extended period of time" and that it is based on a
comparison to the national average in 1993
([gordian.com, 2022 construction cost FAQs](https://www.gordian.com/resources/2022-construction-cost-faqs-part-1/)).
It is national. It carries no location dimension.

Geography is where RSMeans beats everything else. It covers 970 locations in the US and
Canada by three-digit ZIP
([rsmeans.com quick start guide](https://www.rsmeans.com/resources/rsmeans-data-online-guide)).
The published location factor table shows what that means around Long Island
([2021 CCI Location Factors, V2](https://www.rsmeans.com/media/wysiwyg/quarterly_updates/2021-CCI-LocationFactors-V2.pdf)):

| Three-digit ZIP | RSMeans label | Material | Installation | Total |
|---|---|---|---|---|
| 100-102 | New York | 100.3 | 174.2 | 132.2 |
| 104 | Bronx | 94.8 | 171.2 | 127.8 |
| 106 | White Plains | 94.9 | 149.8 | 118.6 |
| 107 | Yonkers | 99.1 | 150.1 | 121.1 |
| 110 | Queens | 100.5 | 173.1 | 131.8 |
| 115, 117, 118 | Hicksville | 100.5 | 151.7 | 122.6 |
| 116 | Far Rockaway | 102.7 | 173.1 | 133.1 |
| 119 | Riverhead | 101.3 | 156.9 | 125.3 |

The same publisher's full City Cost Index table gives weighted averages of 145.2 for New
York, 142.9 for Queens, 137.0 for Riverhead, 136.6 for the Bronx, 134.3 for Hicksville,
132.3 for Yonkers and 128.4 for White Plains
([City Cost Indexes, Year 2021 Quarter 4](https://www.rsmeans.com/media/wysiwyg/quarterly_updates/Q4-2021-UnitCost_CCI_WEB.pdf)).
That table also gives 130.0 for Newark, 127.9 for Paterson, 127.1 for Jersey City and 125.9
for Hackensack, which covers the northern New Jersey work.

Read that carefully before trusting it on Nassau against Suffolk. RSMeans folds ZIPs 115,
117 and 118 into one factor it labels Hicksville. ZIP 117 covers both Nassau towns and
western Suffolk towns, so a western Suffolk job lands in the Nassau bucket. ZIP 119, the
Riverhead factor, covers eastern Suffolk only. So RSMeans gives Kulka a real Long Island
number that is well below the Manhattan number, and it gives a separate eastern Suffolk
number, but it does not draw the county line where Kulka draws it.

Price is published, which is rare here. RSMeans Complete runs from $996.55 a year at a
promotional rate against a $1,049.00 list, up to $4,714.85 a year for the Full Library, and
the subscription includes the City Cost Index, the Historical Cost Index and localization
factors ([rsmeans.com/complete](https://www.rsmeans.com/complete)).

The licence is the problem. The RSMeans Data Online user agreement grants a right to use
the data "solely for Customer's internal business purposes", then restricts it. Section 4.3
says the customer shall not "copy, modify, translate, adapt or otherwise create derivative
works", shall not "combine the Subscriptions or any part thereof with, or incorporate the
Subscriptions or any part thereof in, any other programs", and shall not "merge the Data
with any other software or SaaS program or extract such Data other than expressly allowed
by the Terms"
([RSMeans Online User Agreement](https://www.rsmeans.com/media/EcommerceSite/media/Content/RSMeansOnlineUserAgreement.pdf)).
Clause 4.2 does leave a door open. The grant applies "unless otherwise explicitly authorized
by Additional Terms or by written authorization from Gordian." Gordian also audits use and
can require a signed compliance certificate from an officer of the customer (sections 3.5
and 3.6 of the same agreement).

Gordian sells a third product, Data Insights Cost Trends, which does both jobs from one
base: up to 10 years of history, 970+ North American locations, and breakdowns by material,
labour, equipment and MasterFormat division, with an optional three-year forecast
([gordian.com/products/data-insights-cost-trends](https://www.gordian.com/products/data-insights-cost-trends/),
[rsmeans.com/data-insights-cost-trends](https://www.rsmeans.com/data-insights-cost-trends)).
It is delivered as a dashboard on the Gordian Cloud Platform. Neither page states whether
there is an export or an API, and neither publishes a price.

### Turner Building Cost Index

Turner computes the index on a nationwide basis from labour rates and productivity,
material prices and the competitive condition of the marketplace. It publishes quarterly as
a free PDF ([turnerconstruction.com/cost-index](https://www.turnerconstruction.com/cost-index)).
It has no city dimension, so it cannot do the location job at all.

### Mortenson Construction Cost Index

Mortenson prices a representative non-residential project quarterly in eight metros:
Chicago, Denver, Milwaukee, Minneapolis, Phoenix, Portland, Salt Lake City and Seattle
([mortenson.com/cost-index](https://www.mortenson.com/cost-index)). None of them is in the
northeast, and the basket is non-residential. It is not usable for Kulka.

### US Bureau of Labor Statistics

BLS is the only candidate whose licence is settled. Everything BLS publishes is in the
public domain, and BLS asks only that you cite it as the source
([bls.gov copyright information](https://www.bls.gov/opub/copyright-information.htm)). The
Public Data API serves JSON, version 1.0 needs no registration and version 2.0 needs a free
key ([bls.gov/developers](https://www.bls.gov/developers/)). The API terms of service say
"Data accessed through BLS.gov do not, and should not, include controls over its end use",
and ask users to cite the access date and carry the BLS disclaimer
([bls.gov API terms of service](https://www.bls.gov/developers/termsOfService.htm)).

The catch is coverage. BLS builds its construction output indexes to give "national
weighted-average estimates", so there is no geography
([bls.gov PPI nonresidential building construction initiative](https://www.bls.gov/ppi/factsheets/producer-price-index-nonresidential-building-construction-initiative.htm)).
And BLS says plainly that "PPIs for residential construction are not calculated, however
there are input indexes for residential construction industries"
([bls.gov input-to-industry series](https://www.bls.gov/respondents/ppi/bls-satellite-input-to-industry-series.htm)).
So there is no bid-price index for multifamily. There is an input index:
WPUIP231120, "Net Inputs to Multifamily Residential Construction, Excluding Capital
Investment, Labor, and Imports", monthly, December 2014 = 100
([FRED series page](https://fred.stlouisfed.org/series/WPUIP231120)). A live call to the
BLS API confirms the series starts at 100.0 in December 2014 and returned 166.237 for
August 2026.

Revision behaviour is documented and tight. The API returns the footnote on recent months
itself: "Preliminary. All indexes are subject to monthly revisions up to four months after
original publication." The same wording appears in the PPI technical notes
([bls.gov PPI technical notes](https://www.bls.gov/news.release/ppi.tn.htm)). Since November
2021 an index gets five iterative updates from first issue to final posting four months
later, and after that it is final
([BLS Handbook of Methods, PPI presentation](https://www.bls.gov/opub/hom/ppi/presentation.htm)).

One more BLS product is worth knowing about for location. The Occupational Employment and
Wage Statistics programme publishes wages for the Nassau County-Suffolk County, NY
Metropolitan Division as a single area
([bls.gov OEWS area page](https://www.bls.gov/oes/2017/may/oes_35004.htm)). It treats the
two counties as one market too, it is annual, and it measures wages rather than built cost.

### FRED

FRED republishes the BLS series with a documented REST API and a free key. Its terms are
narrower than the underlying data. FRED states that it "provides data and data services to
the public for non-commercial, educational, and personal uses", allows internal commercial
use only for series carrying certain copyright labels and only with attribution, requires
the notice that the product uses the FRED API but is not endorsed by the Federal Reserve
Bank of St. Louis, and bars use for machine learning or AI training
([fred.stlouisfed.org/legal](https://fred.stlouisfed.org/legal)). Since Kulka only wants
BLS series, going straight to the BLS API avoids all of that.

### Rider Levett Bucknall and Cumming Group

Both are cost consultants who publish free quarterly PDFs. RLB's Q1 2026 report carries a
Comparative Cost Index with five quarters of history for 18 US markets including New York,
which stood at 38,337 in January 2026 against 36,721 a year earlier, an annual change of
4.40%. The same report gives multifamily residential hard cost ranges in dollars per square
foot by market, which is the only building-type specific figure in this whole survey
([RLB Quarterly Construction Cost Report, Q1 2026](https://www.rlb.com/wp-content/uploads/sites/4/2026/03/Q1-2026-QCR.pdf)).
Cumming Group publishes a similar quarterly Market Analysis
([cumming-group.com/en/market-analysis](https://cumming-group.com/en/market-analysis/)).
Neither publisher states licence terms for reuse of its index values in software. Both stop
at the New York metro, so neither can separate Nassau from Suffolk.

## Recommendation

**Buy an RSMeans subscription for the location job and negotiate written permission from
Gordian for programmatic use. Use the free BLS PPI series for the time job.**

The reasoning:

RSMeans is the only source in this survey that resolves below the metro level. It gives
Kulka a Long Island number, a Riverhead number and separate Westchester and New Jersey
numbers ([2021 CCI Location Factors, V2](https://www.rsmeans.com/media/wysiwyg/quarterly_updates/2021-CCI-LocationFactors-V2.pdf)).
Nothing else comes close. ENR would force Kulka to price a Hicksville job off Manhattan,
which the 2021 tables put 22.6 points apart on the weighted average, and ENR forbids that
comparison anyway.

BLS is the only source whose licence clears programmatic use without a negotiation, and its
revision rule is written down and short. Four months after publication a number is final and
stays final, which is what a reproducible ROM needs
([bls.gov PPI technical notes](https://www.bls.gov/news.release/ppi.tn.htm)).

Splitting the two jobs across two sources is not elegant, but both publishers say in their
own words that their index only does one of the two. Pretending otherwise would give
Kulka a number a developer could take apart by reading the publisher's own guidance.

### What this recommendation cannot do

It cannot tell Nassau from Suffolk. RSMeans puts ZIPs 115, 117 and 118 in one bucket, and
117 straddles the county line. A Nassau job and a western Suffolk job get the same factor.
Only eastern Suffolk, ZIP 119, gets its own number.

It is not multifamily specific. The RSMeans City Cost Index is a single composite of 66
materials, 21 trades and six pieces of equipment, not a residential basket
([gordian.com](https://www.gordian.com/resources/city-cost-index-everything-need-know/)). The
BLS multifamily series measures inputs rather than bid prices, because BLS does not
calculate an output index for residential construction
([bls.gov](https://www.bls.gov/respondents/ppi/bls-satellite-input-to-industry-series.htm)).
An input index misses what a subcontractor's margin does when the market turns, so it
understates escalation in a hot market and overstates it in a soft one.

The RSMeans licence is not yet cleared. Today's standard agreement forbids merging the data
with other software. Clause 4.2 allows written authorization from Gordian, and that
authorization is the thing to get before any build starts
([RSMeans Online User Agreement](https://www.rsmeans.com/media/EcommerceSite/media/Content/RSMeansOnlineUserAgreement.pdf)).

RSMeans publishes no revision policy for the City Cost Index or the Historical Cost Index.
Kulka will have to snapshot each quarter's table and keep it.

## Fallback

**If Gordian will not license programmatic use, or the price for it lands too high, use the
BLS Producer Price Index for both jobs and adjust location by hand, once, with a written
memo.**

BLS gives Kulka the time series for free, with a public domain licence and an API
([bls.gov](https://www.bls.gov/opub/copyright-information.htm),
[bls.gov/developers](https://www.bls.gov/developers/)). For location, take the RSMeans
published factors from a printed quarterly table, write them into a short internal memo
that cites the table and the quarter, and treat that memo as a fixed input rather than a
data feed. Reading a published table and typing a number into your own document is the use
a reader's licence covers. It does not scale, and it goes stale, but it is defensible and
it is honest about its own source.

A second fallback exists if Kulka wants a market index for New York that is free and
quarterly: the RLB Comparative Cost Index, which publishes New York with quarterly history
and, uniquely here, multifamily dollar per square foot ranges by market
([RLB Q1 2026](https://www.rlb.com/wp-content/uploads/sites/4/2026/03/Q1-2026-QCR.pdf)). Its
licence for reuse is not published, so treat that as a risk and ask RLB before wiring it
into anything.

## Reproducibility

A ROM written in 2026 should produce the same number when someone reopens it in 2029. A
revised index breaks that quietly, because the code runs again and returns a different
answer with no visible change.

Three rules fix it.

**Store the index value, not the lookup.** When a ROM is created, write the actual index
numbers used into the ROM record: the source, the series ID, the period, the value and the
date retrieved. Never recompute an old ROM from a live feed.

**Record the vintage.** BLS revises for four months and then freezes
([bls.gov PPI technical notes](https://www.bls.gov/news.release/ppi.tn.htm)). So a value
pulled in month one may differ from the final. Store the retrieval date beside the value so
a reader can tell whether a number was preliminary. If a ROM matters, refresh it once after
the four months are up and record that you did.

**Keep the tables.** RSMeans reissues the City Cost Index quarterly on a base of July of the
previous year ([gordian.com](https://www.gordian.com/resources/city-cost-index-everything-need-know/)),
which means the base itself moves. Archive the quarterly PDF or the exported table that each
ROM used, and reference it from the ROM.

The same three rules also answer the developer who asks where a number came from. The ROM
should be able to print the sentence: this figure used the RSMeans City Cost Index for ZIP
117 from the Q3 2026 table, and BLS series WPUIP231120 for June 2023 and September 2026,
retrieved on this date.

ENR is the worst of the three on this point. It restates history when it decides a component
was wrong, with no published schedule and no vintage archive
([enr.com/economics/faq](https://www.enr.com/economics/faq)).

## What could not be determined, and what would settle it

**Whether Gordian will license RSMeans index values for use inside Kulka's own software, and
at what price.** The standard agreement says no, and clause 4.2 says written authorization
from Gordian can change that
([RSMeans Online User Agreement](https://www.rsmeans.com/media/EcommerceSite/media/Content/RSMeansOnlineUserAgreement.pdf)).
Settled by a written quote from Gordian sales for a data licence covering internal software
use, naming the City Cost Index and the Historical Cost Index.

**Whether RSMeans offers a real API, what it exposes, and what it costs.** Gordian markets
integrations and a Cost Trends dashboard, but no product page states an API, its endpoints
or its price ([gordian.com](https://www.gordian.com/products/data-insights-cost-trends/),
[rsmeans.com](https://www.rsmeans.com/data-insights-cost-trends)). Settled by asking Gordian
for API documentation and a price list.

**What ENR Cost Data costs and what its licence allows.** The purchase page at
enrcostdata.com is a JavaScript application that returns no readable content, and no price
appears on ENR's own dashboard page
([enr.com/Cost-Data-Dashboard](https://www.enr.com/Cost-Data-Dashboard)). Settled by
requesting a quote and the subscription agreement from ENRcostdata@enr.com.

**Whether Gordian publishes or archives revisions to the City Cost Index and the Historical
Cost Index.** Nothing on the Gordian or RSMeans pages addresses it. Settled by asking
Gordian support in writing whether past quarters are ever restated and whether prior
vintages stay available to subscribers.

**Whether RLB and Cumming permit reuse of their index values in internal software.** Neither
free PDF states terms. Settled by an email to each firm.

**Exactly which towns fall inside the RSMeans Hicksville factor.** The published table gives
ZIP prefixes 115, 117 and 118 and no town list
([2021 CCI Location Factors, V2](https://www.rsmeans.com/media/wysiwyg/quarterly_updates/2021-CCI-LocationFactors-V2.pdf)).
Settled by asking Gordian for the town-level mapping behind each three-digit factor, or by
testing a handful of real Nassau and Suffolk ZIPs in an RSMeans trial account and recording
which factor each returns.
