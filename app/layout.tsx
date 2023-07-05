import { PropsWithChildren } from 'react'
import { NavigationBar } from '../ui/navigation_bar'

import './global.css'

const RootLayout = ({ children }: PropsWithChildren) => {
  return (
    <html lang="en">
      <body>
        <NavigationBar />
        {children}
      </body>
    </html>
  )
}

export default RootLayout
