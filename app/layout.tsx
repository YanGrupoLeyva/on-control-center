import type { Metadata } from "next";
import "./globals.css";
import "./goals.css";
const favicon = `${process.env.PAGES_BASE_PATH || ""}/favicon.svg?v=on-2`;
export const metadata: Metadata = { title: "ON", icons: { icon: [{ url: favicon, type: "image/svg+xml" }], shortcut: favicon }, description: "Dashboard ejecutivo del ecosistema ON de LeyvaGroup." };
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="es"><body>{children}</body></html>}
