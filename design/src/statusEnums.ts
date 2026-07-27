import {
  Archive,
  CheckCircle2,
  Circle,
  CircleDashed,
  CircleFadingPlus,
  History,
  LoaderCircle,
  type LucideIcon,
  PauseCircle,
} from "lucide-react";

export type StatusPillColor =
  | "gray"
  | "blue"
  | "green"
  | "red"
  | "yellow"
  | "purple";

export type StatusInformation = Record<string, StatusMeta>;

export interface StatusMeta {
  display: string;
  color: StatusPillColor;
  icon?: LucideIcon;
}

export const ASSET_HISTORY_STATUS: StatusInformation = {
  SUBMITTED: {
    display: "Submitted",
    color: "blue",
    icon: CheckCircle2,
  },
  SUPERSEDED: {
    display: "Superseded",
    color: "gray",
    icon: History,
  },
};

export const WORK_OBJECT_STATUS: StatusInformation = {
  DRAFT: {
    display: "Draft",
    color: "purple",
    icon: CircleFadingPlus,
  },
  WAITING: {
    display: "Waiting",
    color: "blue",
    icon: LoaderCircle,
  },
  ACTIVE: {
    display: "Active",
    color: "yellow",
    icon: Circle,
  },
  PAUSED: {
    display: "Paused",
    color: "red",
    icon: PauseCircle,
  },
  COMPLETED: {
    display: "Completed",
    color: "green",
    icon: CheckCircle2,
  },
  ARCHIVED: {
    display: "Archived",
    color: "gray",
    icon: Archive,
  },
};

export const ASSET_STATUS: StatusInformation = {
  AVAILABLE: {
    display: "Available",
    color: "blue",
    icon: CircleDashed,
  },
  CLAIMED: {
    display: "Claimed",
    color: "yellow",
    icon: Circle,
  },
  IN_PROGRESS: {
    display: "In Progress",
    color: "red",
    icon: LoaderCircle,
  },
  COMPLETED: {
    display: "Completed",
    color: "green",
    icon: CheckCircle2,
  },
};
