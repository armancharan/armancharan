'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BlogEntry } from '../blog/entries'
import { BlogEntryPreview } from './blog_entry_preview'

export const BlogEntryList = ({ entries }: { entries: BlogEntry[] }) => {
  return (
    <div
      className={`
        grid
        grid-cols-3

        min-[600px]:grid-cols-5
      `}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <h1 className={`text-2xl font-medium italic`}>
          Feels Like the Life I <br />Fiend's a Little Distant<br />(Yeah)
        </h1>
      </div>
      {entries.map((entry, index) => {
        return (
          <BlogEntryPreview
            data={entry}
            key={entry.id}
          />
        )
      })}
    </div>
  )
}

const debounce = (callback: () => void, delayMs: number) => {
  let timeoutId: NodeJS.Timeout | undefined

  return () => {
    const onTimeout = () => {
      callback()
    }

    clearTimeout(timeoutId)
    timeoutId = setTimeout(onTimeout, delayMs)
  }
}
