import { PropsWithChildren } from 'react'
import { NavigationBar } from '../ui/navigation_bar'

import { Metadata } from 'next'
import Head from 'next/head'
import { Footer } from '../ui/footer'
import './global.css'

export const metadata: Metadata = {
  manifest: '/manifest.json',
  title: 'armancharan.com',
}

const RootLayout = ({ children }: PropsWithChildren) => {
  return (
    <html lang="en">
      <Head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </Head>
      <body>
        <NavigationBar />
        {children}
        <Footer />
      </body>
    </html>
  )
}

export default RootLayout
