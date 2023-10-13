import { type ComponentType, type ReactNode } from 'react'

export const Page: ComponentType<{ children: ReactNode }> = props => {
  return (
    <main className="p-4 pt-10">
      {props.children}
    </main>
  )
}
