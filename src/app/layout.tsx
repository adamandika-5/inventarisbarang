import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { themeScript } from '@/lib/theme-script'
import { ServiceWorkerRegistration } from '@/components/service-worker-registration'
import { PwaStartupScreen } from '@/components/pwa-startup-screen'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'Inventaris Barang BPS Kota Mojokerto',
  description: 'Sistem Pengelolaan Inventaris Barang BPS Kota Mojokerto',
  manifest: '/manifest.json',
  applicationName: 'Inventaris Barang BPS Kota Mojokerto',
  keywords: ['inventaris', 'barang', 'stok', 'BPS', 'Mojokerto', 'persediaan'],
  robots: {
    index: false, // Internal app, no public indexing
    follow: false,
  },
  icons: {
    icon: [
      { url: '/branding/favicon-logo-sistem-v2-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/branding/favicon-logo-sistem-v2-48.png', sizes: '48x48', type: 'image/png' },
    ],
    apple: '/icons/logo-sistem-v2-512.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'InvBarang',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#101d31',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    // suppressHydrationWarning prevents mismatch when inline script adds 'dark' class
    // before React hydrates (the class is set by the inline script, not by React)
    <html lang="id" suppressHydrationWarning>
      <head>
        {/* Anti-FOUC: apply theme before first paint */}
        {/* eslint-disable-next-line react/no-danger */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <PwaStartupScreen />
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  )
}
