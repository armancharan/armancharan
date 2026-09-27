import { type ReactNode } from 'react'

/** Project listing: the name, when it went up, what it is, then the action. */
export const ListingCaption = ({
  name,
  action,
  date,
  dateTime,
  description,
}: {
  name: string
  action: ReactNode
  date: string
  dateTime: string
  description: string
}) => {
  return (
    <div className="mb-4 text-secondary">
      <div className="text-[13px] font-medium leading-[16px]">{name}</div>
      <time dateTime={dateTime} className="mt-[6px] block text-[11.5px] leading-[16px]">
        {date}
      </time>
      <p className="mt-1 text-[11.5px] leading-[16px]">{description}</p>
      <div className="mt-1 text-[11.5px] leading-[16px]">{action}</div>
    </div>
  )
}

/** Site and source links, one per line, alphabetical by label. */
export const ListingLinks = ({
  className,
  links,
}: {
  className: string
  links: readonly { href: string; label: string }[]
}) => {
  const ordered = [...links].sort((a, b) => a.label.localeCompare(b.label))
  return (
    <>
      {ordered.map(link => (
        <a
          key={link.href}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className={className}
        >
          {link.label} {'\u2192'}
        </a>
      ))}
    </>
  )
}
