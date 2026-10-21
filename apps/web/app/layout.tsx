// Creative Flo. Created by Byram Smith Jr., a DigitalFlo product. MIT licensed, see LICENSE and NOTICE.
import type { Metadata, Viewport } from "next";
import { RuntimeFonts } from "@/components/shared/runtime-fonts";
import { ToastProvider } from "@/components/shared/toast";
import { ThemeInitializer } from "@/components/shared/theme-initializer";
import { BrandingHead } from "@/components/shared/branding-head";
import { BrandingProvider } from "@/components/shared/branding-provider";
import { getServerBranding } from "@/lib/branding-server";
import { accentVars } from "@/lib/accent";
import { withBasePath } from "@/lib/base-path";
import "./globals.css";

// The tab title comes from the instance's own name, resolved on the server, so
// a white-labelled deployment never shows "Creative Flo" in the tab first and the
// org name a round trip later. `icons` is deliberately NOT set here: Next emits
// React-owned icon links for a `metadata.icons` entry, and BrandingHead's sweep
// removes competing icon links with `el.remove()`, which throws when the node
// belongs to React. The icon links are rendered in `<head>` below instead,
// carrying the `data-ff-branding` attribute that sweep is written to skip.
export async function generateMetadata(): Promise<Metadata> {
  const branding = await getServerBranding();
  return {
    title: branding?.org_name || "Creative Flo",
    description: "Create, review and approve videos with Flo",
    authors: [{ name: "Byram Smith Jr. (DigitalFlo)", url: "https://mydigitalflo.io" }],
    generator: "Creative Flo, created by Byram Smith Jr. A DigitalFlo product.",
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#070A12",
  // Lets the layout use the full display on a notched phone, and — the reason
  // it is here — makes env(safe-area-inset-*) resolve to real values. Without
  // it iOS reports 0 for all of them, so any padding written against them is
  // inert. Every surface that pins content to an edge is padded with the
  // `*-safe` utilities in globals.css; adding `cover` without those would push
  // content under the notch and the home indicator instead.
  viewportFit: "cover",
};

/** Shown when an admin hasn't set one — the same defaults BrandingHead falls back to. */
const DEFAULT_FAVICON = "/logo-icon.png";
const DEFAULT_APPLE_ICON = "/apple-icon.png";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const branding = await getServerBranding();
  const favicon = branding?.favicon_url || withBasePath(DEFAULT_FAVICON);
  const appleIcon = branding?.apple_icon_url || withBasePath(DEFAULT_APPLE_ICON);
  // Painting the accent from the server too, so a branded instance does not
  // render one frame in the product's default purple before the store lands.
  const accent = accentVars(branding?.primary_color ?? null);

  return (
    <html
      lang="en"
      suppressHydrationWarning
      style={accent as React.CSSProperties | undefined}
    >
      <head>
        {/* Inline script to apply theme BEFORE paint — prevents flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=JSON.parse(localStorage.getItem('ff-theme')||'{}');var t=d.state&&d.state.theme||'dark';if(t==='system'){t=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)}catch(e){document.documentElement.setAttribute('data-theme','dark')}})()`,
          }}
        />
        {/* The icon the browser shows while the page is still loading. Carries
            `data-ff-branding` so BrandingHead adopts these rather than sweeping
            them away, and updates the href in place if branding changes. */}
        <link rel="icon" href={favicon} data-ff-branding="" />
        <link rel="shortcut icon" href={favicon} data-ff-branding="" />
        <link rel="apple-touch-icon" href={appleIcon} data-ff-branding="" />
      </head>
      <body className="font-sans antialiased">
        <RuntimeFonts />
        <ThemeInitializer />
        <BrandingProvider initial={branding}>
          {/* Renders nothing; it keeps the live document in step with branding
              after a change. It sits inside the provider rather than in <head>
              so it reads the server's values on the first pass and leaves the
              title and icons rendered above alone, instead of resetting them to
              the defaults and undoing the very flash this removes. */}
          <BrandingHead />
          <ToastProvider>{children}</ToastProvider>
        </BrandingProvider>
      </body>
    </html>
  );
}
