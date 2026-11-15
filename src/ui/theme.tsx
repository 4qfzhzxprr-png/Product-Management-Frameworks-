import { ConfigProvider, theme as antTheme, type ThemeConfig } from "antd";
import { useEffect, useState, type ReactNode } from "react";

const FONT = '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif';

/** Ant Design tokens that mirror the CSS tokens at the top of styles.css. */
function themeFor(dark: boolean): ThemeConfig {
  const primary = dark ? "#f08a80" : "#c8433f";
  const onPrimary = dark ? "#2a1110" : "#ffffff";
  return {
    algorithm: dark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
    token: {
      colorPrimary: primary,
      colorLink: primary,
      colorText: dark ? "#f5ebe6" : "#433634",
      colorTextSecondary: dark ? "#cbb5ae" : "#63504c",
      colorTextPlaceholder: dark ? "#cbb5ae" : "#63504c",
      colorBgContainer: dark ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.55)",
      colorBgElevated: dark ? "#2b2020" : "#fbf6f2",
      colorBorder: dark ? "rgba(255, 255, 255, 0.2)" : "rgba(67, 54, 52, 0.22)",
      colorBorderSecondary: dark ? "rgba(255, 255, 255, 0.14)" : "rgba(67, 54, 52, 0.14)",
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
        itemColor: dark ? "#cbb5ae" : "#63504c",
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
