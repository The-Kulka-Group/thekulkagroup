"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { Level } from "@/lib/access/level";

// LA-3047. The viewer's level for the tool on screen, so a page can hide its
// edit controls in View. Outside a tool gate everything is editable.

const ToolLevelContext = createContext<Level>("edit");

export function ToolLevelProvider({ level, children }: { level: Level; children: ReactNode }) {
  return <ToolLevelContext.Provider value={level}>{children}</ToolLevelContext.Provider>;
}

export function useCanEdit(): boolean {
  return useContext(ToolLevelContext) === "edit";
}

/** LA-3112. Disables every field and button inside it in View. Links still work. */
export function EditFieldset({ children }: { children: ReactNode }) {
  return <fieldset className="edit-fieldset" disabled={!useCanEdit()}>{children}</fieldset>;
}

/** LA-3112. Shows its children only with Edit, so a server page can hide a create link or button. */
export function EditOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return useCanEdit() ? children : fallback;
}
