'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BlogEntry } from '../blog/entries'
import { BlogEntryPreview } from './blog_entry_preview'

export const BlogEntryList = ({ entries }: { entries: BlogEntry[] }) => {
  const [listContainerWidthPx, setListContainerWidth] = useState<number>()
  const listContainerRef = useRef<HTMLDivElement>(null)

  const previewContainerWidthPx = 100
  const gapPx = 10
  const adjustedListWidthPx = listContainerWidthPx != null
    ? listContainerWidthPx + gapPx
    : undefined
  const adjustedPreviewWidthPx = previewContainerWidthPx + gapPx
  const previewsPerLine = adjustedListWidthPx != null
    ? Math.floor(adjustedListWidthPx / adjustedPreviewWidthPx)
    : undefined

  useLayoutEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const listContainer = listContainerRef.current
    if (listContainer == null) {
      return
    }

    const updateListContainerWidth = debounce(() => {
      const width = listContainer.getBoundingClientRect().width
      setListContainerWidth(width)
    }, 200)

    window.addEventListener('resize', updateListContainerWidth)

    updateListContainerWidth()

    return () => {
      window.removeEventListener('resize', updateListContainerWidth)
    }
  }, [listContainerRef])

  return (
    <div
      className="
        grid
        w-full
      "
      ref={listContainerRef}
      style={{
        gap: `${gapPx}px`,
        gridTemplateColumns: `repeat(auto-fill, ${previewContainerWidthPx}px)`,
      }}
    >
      {entries.map((entry, index) => {
        const position = index + 1
        const isFirstElementInLine = previewsPerLine != null
          ? position % previewsPerLine === 1
          : undefined
        const isLastElementInLine = previewsPerLine != null
          ? position % previewsPerLine === 0
          : undefined

        const titleAlignment = listContainerWidthPx != null
          ? (isFirstElementInLine
            ? 'left'
            : isLastElementInLine
            ? 'right'
            : 'center')
          : undefined

        return (
          <BlogEntryPreview
            containerWidthPx={previewContainerWidthPx}
            data={entry}
            key={entry.id}
            titleAlignment={titleAlignment}
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
