export type StatusPillColor =
  | "none"
  | "gray"
  | "darkgray"
  | "blue"
  | "darkblue"
  | "green"
  | "darkgreen"
  | "red"
  | "darkred"
  | "yellow"
  | "darkyellow"
  | "purple"
  | "darkpurple";

/**
 * Icon names from the lucide icon set (shared between `lucide-react` and
 * `lucide-react-native`, which expose the same component names). Kept as
 * plain strings here - rather than a `LucideIcon` component reference - so
 * this module stays free of a `lucide-react` (web-only) dependency and can
 * be imported by both the web and native apps. Consumers resolve the name to
 * their platform's icon component themselves.
 */
export type StatusIconName =
  | "Archive"
  | "Ban"
  | "CheckCircle2"
  | "Circle"
  | "CircleDashed"
  | "CircleFadingPlus"
  | "CircleX"
  | "HandGrab"
  | "History"
  | "LoaderCircle"
  | "PauseCircle"
  | "Toolbox"
  | "Wrench";

export type StatusInformation = Record<string, StatusMeta>;

export interface StatusMeta {
  display: string;
  color: StatusPillColor;
  icon?: StatusIconName;
}

export const ASSET_HISTORY_STATUS: StatusInformation = {
  SUBMITTED: {
    display: "Submitted",
    color: "green",
    icon: "CheckCircle2",
  },
  SUPERSEDED: {
    display: "Superseded",
    color: "gray",
    icon: "History",
  },
};

export const WORK_OBJECT_STATUS: StatusInformation = {
  DRAFT: {
    display: "Draft",
    color: "none",
    icon: "CircleFadingPlus",
  },
  WAITING: {
    display: "Waiting",
    color: "red",
    icon: "LoaderCircle",
  },
  ACTIVE: {
    display: "Active",
    color: "green",
    icon: "Circle",
  },
  PAUSED: {
    display: "Paused",
    color: "yellow",
    icon: "PauseCircle",
  },
  COMPLETED: {
    display: "Completed",
    color: "blue",
    icon: "CheckCircle2",
  },
  ARCHIVED: {
    display: "Archived",
    color: "gray",
    icon: "Archive",
  },
};

export const ASSET_STATUS: StatusInformation = {
  AVAILABLE: {
    display: "Available",
    color: "green",
    icon: "CircleDashed",
  },
  CLAIMED: {
    display: "Claimed",
    color: "yellow",
    icon: "HandGrab",
  },
  IN_PROGRESS: {
    display: "In Progress",
    color: "yellow",
    icon: "LoaderCircle",
  },
  COMPLETED: {
    display: "Completed",
    color: "blue",
    icon: "CheckCircle2",
  },
};

/**
 * NOTE: This refers to the display (capitalised), not the key value.
 *
 * TODO: Should ideally be changed.
 */
export const REMEDIAL_STATUS_DISPLAY: StatusInformation = {
  PASS: {
    display: "Pass",
    color: "green",
    icon: "CheckCircle2",
  },
  PENDING: {
    display: "Pending",
    color: "red",
    icon: "LoaderCircle",
  },
  "NOT FIREDOOR": {
    display: "Not Firedoor",
    color: "gray",
    icon: "CircleX",
  },
  "PASS REPAIRED": {
    display: "Pass Repaired",
    color: "darkgreen",
    icon: "Toolbox",
  },
  "NO ACCESS": {
    display: "No Access",
    color: "yellow",
    icon: "Ban",
  },
  "PENDING MAINTENANCE": {
    display: "Pending Maintenance",
    color: "darkred",
    icon: "Wrench",
  },
};

// insp and rem status enums are the same
export const INSPECTION_STATUS_DISPLAY: StatusInformation =
  REMEDIAL_STATUS_DISPLAY;

export const LATEST_REPORT_STATUS: StatusInformation = {
  PENDING: {
    display: "Pending",
    color: "blue",
    icon: "LoaderCircle",
  },
  IN_PROGRESS: {
    display: "In progress",
    color: "yellow",
    icon: "Circle",
  },
};

export const SERVICE_TYPE: StatusInformation = {
  ONETRACE: {
    display: "OneTrace",
    color: "blue",
  },
  POWERAPP: {
    display: "Power App",
    color: "red",
  },
  MANUAL: {
    display: "Manual",
    color: "gray",
  },
  OTHER: {
    display: "Other",
    color: "yellow",
  },
};
