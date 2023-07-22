import Image from 'next/image'
import { BlogEntry } from '../blog/entries'

export const BlogEntryPreview = (
  props: {
    data: BlogEntry
  },
) => {
  const {
    data,
  } = props

  return (
    <div className="
      inline-block
      group
      relative
      text-center
      mx-auto
      w-[200px]
    ">
      {/* Cover Image. */}
      <Image
        alt={data.coverImage.description}
        className="
          m-auto
          mb-2
          max-w-full
          object-fit-contain
          mx-auto
        "
        quality={100}
        height={data.coverImage.height}
        src={data.coverImage.url}
        width={data.coverImage.width}
      />

      {/* Title. */}
      <h4
        className={`
              duration-0
              ease
              opacity-0
              text-center
              text-ellipsis
              text-sm
              transition-opacity
              max-w-[85%]
              mx-auto
              z-10
              group-hover:duration-200
              group-hover:opacity-100
            `}
      >
        {data.name}
      </h4>
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
