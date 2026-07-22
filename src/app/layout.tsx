import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { themeScript } from '@/lib/theme-script'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'InventarisBarang',
  description: 'Sistem Pengelolaan Persediaan Alat Tulis Kantor',
  manifest: '/manifest.json',
  applicationName: 'InventarisBarang',
  keywords: ['inventaris', 'persediaan', 'alat tulis kantor', 'ATK'],
  robots: {
    index: false, // Internal app, no public indexing
    follow: false,
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#2563eb',
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
      <body className={`${inter.variable} font-sans antialiased`}>{children}</body>
    </html>
  )
}
