import type { ThemeVars } from "@mysten/dapp-kit";

/** dapp-kit's connect modal, restyled to match Engram's ink & signal theme. */
export const engramWalletTheme: ThemeVars = {
  blurs: { modalOverlay: "blur(10px)" },
  backgroundColors: {
    primaryButton: "#d4ff3a",
    primaryButtonHover: "#e2ff73",
    outlineButtonHover: "#1b1b19",
    modalOverlay: "rgba(10 10 9 / 75%)",
    modalPrimary: "#0f0f0e",
    modalSecondary: "#141413",
    iconButton: "transparent",
    iconButtonHover: "#1f1f1c",
    dropdownMenu: "#141413",
    dropdownMenuSeparator: "#24241f",
    walletItemSelected: "#1f1f1c",
    walletItemHover: "#191917",
  },
  borderColors: { outlineButton: "#2a2a25" },
  colors: { primaryButton: "#0a0a09", outlineButton: "#f3efe6", iconButton: "#f3efe6", body: "#f3efe6", bodyMuted: "#aaa59a", bodyDanger: "#ff5b4a" },
  radii: { small: "8px", medium: "10px", large: "14px", xlarge: "20px" },
  shadows: { primaryButton: "0 10px 30px -10px rgba(212, 255, 58, 0.5)", walletItemSelected: "0 0 0 1px rgba(243,239,230,0.08)" },
  fontWeights: { normal: "400", medium: "500", bold: "600" },
  fontSizes: { small: "14px", medium: "15px", large: "17px", xlarge: "20px" },
  typography: { fontFamily: "'Geist Variable', ui-sans-serif, system-ui, sans-serif", fontStyle: "normal", lineHeight: "1.35", letterSpacing: "0" },
};
