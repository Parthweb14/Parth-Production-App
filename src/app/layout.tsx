import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/lib/theme";
import { AgentationProvider } from "@/components/AgentationProvider";
import "./globals.css";
export const metadata: Metadata = {
  title: "Parth Production",
  description: "Professional Event Services — operations dashboard",
  manifest: "/api/manifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ParthProd",
  },
};

/** Lock pinch/double-tap zoom app-wide; responsive layouts still follow device-width. */
export const viewport: Viewport = {
  themeColor: "#f8fafc",
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

const themeScript = `
(function() {
  var t = localStorage.getItem('pp-theme') || 'system';
  var d = document.documentElement;
  if (t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    d.classList.add('dark');
  }
  var m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', d.classList.contains('dark') ? '#05070a' : '#f8fafc');
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" type="image/png" sizes="32x32" href="/api/icon?size=32&v=3" />
        <link rel="icon" type="image/png" sizes="192x192" href="/api/icon?size=192&v=3" />
        <link rel="shortcut icon" href="/api/icon?size=32&v=3" />
        <link rel="apple-touch-icon" sizes="180x180" href="/api/icon?size=180&v=3" />
        <link rel="apple-touch-icon" sizes="152x152" href="/api/icon?size=152&v=3" />
        <link rel="apple-touch-icon" sizes="120x120" href="/api/icon?size=120&v=3" />
        <link rel="apple-touch-icon-precomposed" href="/api/icon?size=180&v=3" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        <AgentationProvider />
      </body>
    </html>
  );
}
