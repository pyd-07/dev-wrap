import { Geist, Geist_Mono } from 'next/font/google'
import type { Metadata, Viewport } from 'next'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

export const metadata: Metadata = {
  title: 'DevWrapped // 2026',
  description: 'Your annual engineering activity audit.',
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://dev-wrap.onrender.com"
  ),
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#09090B',
  userScalable: false,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="bg-background">
      <body className={`${geist.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  )
}
