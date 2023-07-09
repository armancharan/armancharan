import Image from 'next/image'
import Link from 'next/link'
import { BlogEntry } from '../blog/entries'

export const BlogEntryPreview = (
  {
    titleAlignment,
    containerWidthPx,
    data,
  }: {
    titleAlignment: 'center' | 'left' | 'right' | undefined
    containerWidthPx: number
    data: BlogEntry
  },
) => {
  const href = `/${data.id}`

  return (
    <div className="
        inline-block
        group
        relative
      " // href={href}
    >
      <Image
        alt={data.coverImage.description}
        className="
          m-auto
          mb-2
        "
        quality={100}
        height={data.coverImage.height}
        src={data.coverImage.url}
        width={data.coverImage.width}
      />
      {titleAlignment
        ? (
          <h4
            className={`
              absolute
              duration-0
              ease
              opacity-0
              text-center
              text-ellipsis
              text-sm
              transition-opacity
              max-w-[${containerWidthPx * 2}px]
              whitespace-nowrap
              z-10
              
              ${getClassNameForTitleAlignment(titleAlignment)}

              group-hover:duration-200
              group-hover:opacity-100
            `}
          >
            {data.name}
          </h4>
        )
        : null}
    </div>
  )
}

const getClassNameForTitleAlignment = (titleAlignment: 'left' | 'right' | 'center') => {
  switch (titleAlignment) {
    case 'left':
      return 'left-0'
    case 'right':
      return 'right-0'
    case 'center':
      return 'left-1/2 -translate-x-1/2'
  }
}
