import React from 'react'

export const Page: React.ComponentType<{ children: React.ReactNode }> = props => {
  return (
    <div
        style={{ width: '100%' }}
    >
      {props.children}
    </div>
  )
}
