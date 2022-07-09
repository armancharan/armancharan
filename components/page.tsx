import React from 'react'

export const Page: React.ComponentType<{ children: React.ReactNode, style?: React.CSSProperties }> = props => {
  return (
    <div
        style={{
          margin: 'auto',
          maxWidth: 'calc(100vw - 20px)',
          width: '1000px',
          ...props.style,
        }}
    >
      {props.children}
    </div>
  )
}
