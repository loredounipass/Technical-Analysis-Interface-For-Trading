import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Trading Terminal',
  description: 'Professional Technical Analysis Platform',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Evita que el teclado virtual de Android tape el input del chat
  interactiveWidget: 'resizes-content',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased text-slate-200 bg-[#070c14]">
        {children}
      </body>
    </html>
  )
}
