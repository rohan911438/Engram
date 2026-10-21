import type { ThemeVars } from "@mysten/dapp-kit";

/** dapp-kit's connect modal, restyled to match Engram's black theme. */
export const engramWalletTheme: ThemeVars = {
  blurs: { modalOverlay: "blur(8px)" },
  backgroundColors: {
    primaryButton: "#7c5cff",
    primaryButtonHover: "#8f73ff",
    outlineButtonHover: "#17171c",
    modalOverlay: "rgba(0 0 0 / 70%)",
    modalPrimary: "#0b0b0f",
    modalSecondary: "#111116",
    iconButton: "transparent",
    iconButtonHover: "#1c1c22",
    dropdownMenu: "#0f0f13",
    dropdownMenuSeparator: "#1f1f26",
    walletItemSelected: "#1a1a21",
    walletItemHover: "#16161c",
  },
  borderColors: { outlineButton: "#26262e" },
  colors: { primaryButton: "#ffffff", outlineButton: "#e7e7ea", iconButton: "#e7e7ea", body: "#f2f2f4", bodyMuted: "#8a8a96", bodyDanger: "#ff7a6b" },
  radii: { small: "8px", medium: "10px", large: "14px", xlarge: "20px" },
  shadows: { primaryButton: "0 8px 30px -8px rgba(124, 92, 255, 0.55)", walletItemSelected: "0 0 0 1px rgba(255,255,255,0.08)" },
  fontWeights: { normal: "400", medium: "500", bold: "600" },
  fontSizes: { small: "14px", medium: "15px", large: "17px", xlarge: "20px" },
  typography: { fontFamily: "'Geist Variable', ui-sans-serif, system-ui, sans-serif", fontStyle: "normal", lineHeight: "1.35", letterSpacing: "0" },
};
