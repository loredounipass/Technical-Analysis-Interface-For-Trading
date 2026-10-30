import type { Metadata, Viewport } from 'next'
import { Inter, Newsreader, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  weight: ['300', '400', '500', '600', '700'],
})

const newsreader = Newsreader({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
  weight: ['400', '500'],
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
})

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
    <html
      lang="en"
      className={`${inter.variable} ${newsreader.variable} ${jetbrainsMono.variable}`}
    >
      <body className="font-sans antialiased text-slate-200 bg-[#070c14]">
        {children}
      </body>
    </html>
  )
}
