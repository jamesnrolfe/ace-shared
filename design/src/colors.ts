/**
 * Universal colour palette.
 */
export interface ColorPalette {
  // Brand
  primary: string;
  primaryHover: string;
  primarySubtle: string;
  onPrimary: string;
  secondary: string;
  onSecondary: string;
  emphasis: string;

  // Surface
  background: string;
  background2: string;
  surface: string;
  skeleton: string;
  border: string;
  borderSubtle: string;

  // Text
  text: string;
  textSecondary: string;
  textTertiary: string;
  textInverse: string;

  // Semantic
  success: string;
  warning: string;
  error: string;
  onError: string;
  info: string;

  // generic colours (for statuses etc)
  red: string;
  darkred: string;
  green: string;
  darkgreen: string;
  yellow: string;
  darkyellow: string;
  blue: string;
  darkblue: string;
  purple: string;
  darkpurple: string;
  gray: string;
  darkgray: string;

  // sidebar
  sidebarBg: string;
  sidebarBorder: string;
  sidebarText: string;
  sidebarTextHover: string;
  sidebarTextActive: string;
  sidebarHover: string;
  sidebarActiveBg: string;
  sidebarGroupLabel: string;

  // Misc (ReInspector)
  shadow: string;
  tableLight: string;
  tableDark: string;
  hasChanged: string;
}

export const lightColors: ColorPalette = {
  primary: "#227C9D",
  primaryHover: "#4d8f93",
  primarySubtle: "rgba(100, 166, 170, 0.10)",
  onPrimary: "#FFFDFA",
  secondary: "#977364",
  onSecondary: "#FFFDFA",
  emphasis: "#17C3B2",

  background: "#FFFFF6",
  background2: "#FAF7F3",
  surface: "#F5F5EE",
  skeleton: "#D2D2CA",
  border: "#D0CCC3",
  borderSubtle: "rgba(208, 204, 195, 0.5)",

  text: "#272932",
  textSecondary: "#6b6b6b",
  textTertiary: "#8f8f8f",
  textInverse: "#E8E5DE",

  success: "#89AC4A",
  warning: "#f59e0b",
  error: "#D93E3E",
  onError: "#FFFDFA",
  info: "#4BA8E2",

  red: "#DC2626",
  darkred: "#7F1D1D",
  green: "#15803D",
  darkgreen: "#14532D",
  yellow: "#B45309",
  darkyellow: "#78350F",
  blue: "#2563EB",
  darkblue: "#1E3A8A",
  purple: "#9333EA",
  darkpurple: "#581C87",
  gray: "#4B5563",
  darkgray: "#1F2937",

  sidebarBg: "#EAEAE4",
  sidebarBorder: "#BDB8AB",
  sidebarText: "#6b6b6b",
  sidebarTextHover: "#272932",
  sidebarTextActive: "#272932",
  sidebarHover: "rgba(39, 41, 50, 0.06)",
  sidebarActiveBg: "rgba(100, 166, 170, 0.14)",
  sidebarGroupLabel: "#8f8f8f",

  shadow: "rgba(0, 0, 0, 0.2)",
  tableLight: "#ffffff",
  tableDark: "#f9f9fb",
  hasChanged: "#8484a3",
};

export const darkColors: ColorPalette = {
  primary: "#227C9D",
  primaryHover: "#7bbfc3",
  primarySubtle: "rgba(100, 166, 170, 0.14)",
  onPrimary: "#FFF5F2",
  secondary: "#977364",
  onSecondary: "#FFF5F2",
  emphasis: "#17C3B2",

  background: "#151515",
  background2: "#282826",
  surface: "#181818",
  skeleton: "#42423E",
  border: "rgba(231, 236, 239, 0.07)",
  borderSubtle: "rgba(231, 236, 239, 0.04)",

  text: "#FFF5F2",
  textSecondary: "#BAB6AB",
  textTertiary: "#8E8E85",
  textInverse: "#272932",

  success: "#89AC4A",
  warning: "#f59e0b",
  error: "#D93E3E",
  onError: "#FFF5F2",
  info: "#4BA8E2",

  red: "#FF6B6B",
  darkred: "#E63946",
  green: "#4ADE80",
  darkgreen: "#22C55E",
  yellow: "#FBBF24",
  darkyellow: "#D97706",
  blue: "#60A5FA",
  darkblue: "#3B82F6",
  purple: "#C084FC",
  darkpurple: "#A855F7",
  gray: "#9CA3AF",
  darkgray: "#6B7280",

  sidebarBg: "#171717",
  sidebarBorder: "rgba(231, 236, 239, 0.06)",
  sidebarText: "#BAB6AB",
  sidebarTextHover: "#FFF5F2",
  sidebarTextActive: "#FFF5F2",
  sidebarHover: "rgba(255, 245, 242, 0.07)",
  sidebarActiveBg: "rgba(100, 166, 170, 0.16)",
  sidebarGroupLabel: "#8E8E85",

  shadow: "rgba(0, 0, 0, 0.4)",
  tableLight: "#1e1e21",
  tableDark: "#18181b",
  hasChanged: "#9DA0FF",
};

export const colors = {
  light: lightColors,
  dark: darkColors,
};
