import { IBM_Plex_Mono, Source_Serif_4, Syne } from 'next/font/google'
import { type PropsWithChildren } from 'react'
import { type Metadata, type Viewport } from 'next'
import './vl.css'

const display = Syne({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-vl-display',
  display: 'swap',
})

const body = Source_Serif_4({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-vl-body',
  display: 'swap',
})

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-vl-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Verified Loops',
  description:
    'A course on designing agent loops that prove their own work — trigger, goal, independent verification, stop.',
  metadataBase: new URL('https://verifiedloops.com'),
  openGraph: {
    title: 'Verified Loops',
    description:
      'Design the system that prompts the agent. Verify independently. Stop on proof.',
    url: 'https://verifiedloops.com',
    siteName: 'Verified Loops',
    type: 'website',
  },
}

export const viewport: Viewport = {
  themeColor: '#d9e0e8',
}

const VlLayout = ({ children }: PropsWithChildren) => {
  return (
    <div className={`vl-shell ${display.variable} ${body.variable} ${mono.variable}`}>
      {children}
    </div>
  )
}

export default VlLayout
