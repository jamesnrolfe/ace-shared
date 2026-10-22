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
  | "Wrench"
  | "Package"
  | "CloudUpload"
  | "GlobeX"
  | "MonitorStop"
  | "Cable"
  | "FileText"
  | "User"
  | "UserGroup"
  | "Users"
  | "FolderOpenDot"
  | "Building"
  | "BuildingComplex"
  | "DoorClosed"
  | "CalendarClock"
  | "ChartLine"
  | "Info"
  | "Tag"
  | "Search"
  | "Calendar"
  | "CalendarX"
  | "CalendarCheck"
  | "Calendar1"
  | "CalendarDays";

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
    icon: "MonitorStop",
  },
  POWERAPP: {
    display: "Power App",
    color: "red",
    icon: "Cable",
  },
  MANUAL: {
    display: "Manual",
    color: "gray",
    icon: "Wrench",
  },
  "MANUAL ENTRY": {
    display: "Manual",
    color: "gray",
    icon: "Wrench",
  },
  OTHER: {
    display: "Other",
    color: "yellow",
    icon: "FileText",
  },
};

/**
 * One entry per project search filter, keyed by the filter's key
 * uppercased (e.g. `building_name` -> `BUILDING_NAME`), so the key must
 * match the filter config exactly. `SEARCH` and `DATE` cover the keyword
 * and date range, which aren't filter boxes but are shown alongside them.
 */
export const PROJECT_FILTERS: StatusInformation = {
  CLIENT: {
    display: "Client",
    color: "yellow",
    icon: "User",
  },
  GROUP: {
    display: "Group",
    color: "darkyellow",
    icon: "UserGroup",
  },
  CLIENT_GROUP: {
    display: "Client Group",
    color: "darkyellow",
    icon: "Users",
  },
  PROJECT: {
    display: "Project",
    color: "red",
    icon: "FolderOpenDot",
  },
  BUILDING_NAME: {
    display: "Building",
    color: "purple",
    icon: "Building",
  },
  COST_DESIGNATION: {
    display: "Cost Designation",
    color: "purple",
    icon: "BuildingComplex",
  },
  PACKAGE: {
    display: "Package",
    color: "gray",
    icon: "Package",
  },
  DOOR_USE: {
    display: "Door Use",
    color: "gray",
    icon: "DoorClosed",
  },
  INSPECTION_DUE: {
    display: "Inspection Due",
    color: "blue",
    icon: "CalendarClock",
  },
  INSPECTION_DUE_STATUS: {
    display: "Next Inspection",
    color: "blue",
    icon: "CalendarCheck",
  },
  INSPECTION_FREQUENCY: {
    display: "Inspection Frequency",
    color: "darkblue",
    icon: "CalendarClock",
  },
  REMEDIAL_STATUS: {
    display: "Remedial Status",
    color: "darkgreen",
    icon: "ChartLine",
  },
  STATUS: {
    display: "Status",
    color: "green",
    icon: "Info",
  },
  ACE_ID: {
    display: "Ace ID",
    color: "darkpurple",
    icon: "Tag",
  },
  SEARCH: {
    display: "Search",
    color: "darkgray",
    icon: "Search",
  },
  DATE: {
    display: "Date",
    color: "blue",
    icon: "Calendar",
  },
};

/**
 * Derived from an asset's inspection due month against the current month -
 * computed by the API at query time, never stored. Keys are in severity
 * order (most urgent first), which clients may use to order them.
 */
export const INSPECTION_DUE_STATUS: StatusInformation = {
  OVERDUE: {
    display: "Overdue",
    color: "red",
    icon: "CalendarX",
  },
  DUE: {
    display: "Due",
    color: "yellow",
    icon: "CalendarClock",
  },
  OK: {
    display: "OK",
    color: "green",
    icon: "CalendarCheck",
  },
};

export const INSPECTION_FREQUENCY: StatusInformation = {
  ANNUAL: {
    display: "Annual",
    color: "green",
    icon: "Calendar1",
  },
  QUARTERLY: {
    display: "Quarterly",
    color: "yellow",
    icon: "CalendarDays",
  },
  "NOT APPLICABLE": {
    display: "Not Applicable",
    color: "gray",
    icon: "CalendarX",
  },
};

export const UPLOAD_STATUS: StatusInformation = {
  PENDING: {
    display: "Waiting",
    color: "blue",
    icon: "LoaderCircle",
  },
  IN_FLIGHT: {
    display: "Uploading",
    color: "green",
    icon: "CloudUpload",
  },
  FAILED: {
    display: "Failed",
    color: "gray",
    icon: "CircleX",
  },
  DEAD: {
    display: "Dead",
    color: "red",
    icon: "GlobeX",
  },
};
