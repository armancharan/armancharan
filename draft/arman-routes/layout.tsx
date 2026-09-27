import { type PropsWithChildren } from 'react'
import { Footer } from '../../ui/footer'
import { NavigationBar } from '../../ui/navigation_bar'

const ArmanLayout = ({ children }: PropsWithChildren) => {
  return (
    <>
      <NavigationBar />
      {children}
      <Footer />
    </>
  )
}

export default ArmanLayout
