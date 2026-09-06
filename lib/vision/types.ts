import type { Status } from "@/lib/data";

export type VisionStatus = Status;
export type VisionDraft = {
  name: string;
  town: string;
  county: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  sourceTitle: string;
  sourceUrl: string;
  sourceDate: string | null;
  notes: string;
};
export type VisionOpportunity = VisionDraft & {
  id: string;
  sheetNumber: string;
  status: VisionStatus;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
export type VisionFilters = { search?: string; county?: string; status?: VisionStatus };
export type VisionReview = { status: VisionStatus; notes: string; expectedRevision: number };
