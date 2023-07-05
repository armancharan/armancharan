import { type ComponentType, type ReactNode } from 'react'

export const Page: ComponentType<{ children: ReactNode }> = props => {
  return (
    <main>
      {props.children}
    </main>
  )
}
