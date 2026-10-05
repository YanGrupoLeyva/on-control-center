import type { Metadata } from "next";
import "./globals.css";
import "./goals.css";
export const metadata: Metadata = { title: "ON", icons: { icon: [{ url: "/favicon.svg?v=on-2", type: "image/svg+xml" }], shortcut: "/favicon.svg?v=on-2" }, description: "Dashboard ejecutivo del ecosistema ON de LeyvaGroup." };
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="es"><body>{children}</body></html>}
