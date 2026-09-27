import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";

import {DiscoveryFilterDisclosure} from "./DiscoveryFilterDisclosure";

describe("Vision discovery filter disclosure",()=>{
  it("keeps unused filters collapsed",()=>{
    const html=renderToStaticMarkup(createElement(DiscoveryFilterDisclosure,{activeCount:0},createElement("p",null,"Filter fields")));

    expect(html).toContain("<details class=\"vision-discovery-filters\">");
    expect(html).not.toContain(" open=\"\"");
    expect(html).toContain("Discovery Filters");
    expect(html).not.toContain("vision-filter-count");
  });

  it.each([
    {activeCount:2,invalid:false},
    {activeCount:0,invalid:true},
  ])("opens for active or invalid filters",({activeCount,invalid})=>{
    const html=renderToStaticMarkup(createElement(DiscoveryFilterDisclosure,{activeCount,invalid},createElement("p",null,"Filter fields")));

    expect(html).toContain("<details class=\"vision-discovery-filters\" open=\"\">");
    if(activeCount)expect(html).toContain(`<span class="vision-filter-count">${activeCount}</span>`);
  });
});
