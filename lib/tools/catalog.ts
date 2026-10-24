// LA-3044: every tool in Kulka AI, in one Division, Department, Tool tree.
// The rail renders from it, and permissions (LA-3045) key access by its tool
// keys, so the menu and the access rules cannot drift apart. Keys are stable:
// a label or href can change, a key cannot.
//
// Icons are names, not components, so server code can read the catalog
// without pulling in React. The rail maps each name to its Phosphor icon.

export type DivisionKey = "construction" | "development" | "property" | "company";

export type ToolIcon =
  | "users"
  | "binoculars"
  | "briefcase"
  | "video"
  | "calculator"
  | "chart-bar"
  | "chart-line-up"
  | "map"
  | "shield"
  | "database";

export interface Division {
  key: DivisionKey;
  label: string;
}

export interface Department {
  key: string;
  label: string;
  division: DivisionKey;
}

export interface Tool {
  key: string;
  label: string;
  href: string;
  icon: ToolIcon;
  department: string;
  /** False until the tool has a page. The rail shows only live tools. */
  live: boolean;
}

export const DIVISIONS: readonly Division[] = [
  { key: "construction", label: "Construction" },
  { key: "development", label: "Development" },
  { key: "property", label: "Property Management" },
  { key: "company", label: "Company" },
];

// Rail order. A department's label is the rail section heading, so today's
// headings stay as they were. Property Management has no tools yet.
export const DEPARTMENTS: readonly Department[] = [
  { key: "sales-marketing", label: "Sales and Marketing", division: "construction" },
  { key: "business-development", label: "Business Development", division: "construction" },
  { key: "projects", label: "Projects", division: "construction" },
  { key: "pre-construction", label: "Pre-Construction", division: "construction" },
  { key: "underwriting", label: "Development", division: "development" },
  { key: "kulka-ai", label: "Kulka AI", division: "company" },
  { key: "settings", label: "Settings", division: "company" },
];

export const TOOLS: readonly Tool[] = [
  { key: "clients", label: "Clients", href: "/clients", icon: "users", department: "sales-marketing", live: true },
  { key: "vision", label: "Vision", href: "/vision", icon: "binoculars", department: "business-development", live: true },
  // LA-2858: the Autodesk projects, named Projects by Matt. LA-2280: Fireflies meetings.
  { key: "projects", label: "Projects", href: "/projects", icon: "briefcase", department: "projects", live: true },
  { key: "meetings", label: "Meetings", href: "/meetings", icon: "video", department: "projects", live: true },
  { key: "rom", label: "Conceptual Budget", href: "/rom", icon: "calculator", department: "pre-construction", live: true },
  { key: "estimating", label: "Estimating", href: "/estimating", icon: "chart-bar", department: "pre-construction", live: true },
  { key: "underwriting", label: "Underwriting", href: "/underwriting", icon: "chart-line-up", department: "underwriting", live: true },
  // LA-1840: what has been built, planned and is waiting, for Matt and Kulka.
  { key: "roadmap", label: "Roadmap", href: "/roadmap", icon: "map", department: "kulka-ai", live: true },
  // The People and Access page comes in LA-3046. LA-3050: Data Sources.
  { key: "access", label: "People and Access", href: "/settings/access", icon: "shield", department: "settings", live: false },
  { key: "sources", label: "Data Sources", href: "/settings/sources", icon: "database", department: "settings", live: true },
];

export interface RailGroup {
  department: Department;
  tools: Tool[];
}

/** Departments in rail order with their live tools. A department with none is left out. */
export function railGroups(tools: readonly Tool[] = TOOLS): RailGroup[] {
  return DEPARTMENTS.map((department) => ({
    department,
    tools: tools.filter((tool) => tool.live && tool.department === department.key),
  })).filter((group) => group.tools.length > 0);
}

export function toolByKey(key: string): Tool | undefined {
  return TOOLS.find((tool) => tool.key === key);
}
