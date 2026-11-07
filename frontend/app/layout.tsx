import type { Metadata, Viewport } from 'next'
import './globals.css'
import PWARegister from '@/components/PWARegister'
import { AuthProvider } from '@/services/auth/AuthProvider'
import { GlobalToastContainer } from '@/components/global-toast'
import { LoginDialog, RegisterDialog } from '@/components/auth'

export const metadata: Metadata = {
  title: 'SYNAPSE',
  description: 'Professional Technical Analysis Platform',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SYNAPSE',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#070c14',
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
        <AuthProvider>
          <GlobalToastContainer />
          {children}
          <LoginDialog />
          <RegisterDialog />
        </AuthProvider>
        <PWARegister />
      </body>
    </html>
  )
}
