import { ConfigProvider, theme as antTheme, type ThemeConfig } from "antd";
import { useEffect, useState, type ReactNode } from "react";

const FONT = '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif';

/** Ant Design tokens that mirror the CSS tokens at the top of styles.css. */
function themeFor(dark: boolean): ThemeConfig {
  const primary = dark ? "#9fb2ff" : "#030069";
  const onPrimary = dark ? "#000333" : "#ffffff";
  return {
    algorithm: dark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
    token: {
      colorPrimary: primary,
      colorLink: primary,
      colorText: dark ? "#eef0ff" : "#030069",
      colorTextSecondary: dark ? "#bcc2e8" : "#4a4a56",
      colorTextPlaceholder: dark ? "#bcc2e8" : "#4a4a56",
      colorBgContainer: dark ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.55)",
      colorBgElevated: dark ? "#10123f" : "#f5f7fd",
      colorBorder: dark ? "rgba(255, 255, 255, 0.22)" : "rgba(3, 0, 105, 0.24)",
      colorBorderSecondary: dark ? "rgba(255, 255, 255, 0.16)" : "rgba(3, 0, 105, 0.14)",
      borderRadius: 12,
      fontFamily: FONT,
      fontSize: 14,
    },
    components: {
      Button: { primaryColor: onPrimary, primaryShadow: "none", defaultShadow: "none" },
      Segmented: {
        trackBg: dark ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.5)",
        itemSelectedBg: primary,
        itemSelectedColor: onPrimary,
        itemColor: dark ? "#bcc2e8" : "#4a4a56",
      },
      Table: { colorBgContainer: "transparent", headerBg: "transparent" },
    },
  };
}

function usePrefersDark(): boolean {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const [dark, setDark] = useState(query.matches);
  useEffect(() => {
    const update = () => setDark(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [query]);
  return dark;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const dark = usePrefersDark();
  return <ConfigProvider theme={themeFor(dark)}>{children}</ConfigProvider>;
}
