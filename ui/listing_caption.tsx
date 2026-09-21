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
