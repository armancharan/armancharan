import { notFound } from 'next/navigation'
import { entries } from '../../blog/entries'
import { Page } from '../../ui/page'

const BlogEntryPage = ({ params }: { params: { id: string } }) => {
  const entry = entries.find(entry => entry.id === params.id)

  if (entry == null) {
    return notFound()
  }

  const { createdAt } = entry
  const day = new Intl.DateTimeFormat('en', { day: '2-digit' }).format(createdAt)
  const month = new Intl.DateTimeFormat('en', { month: 'short' }).format(createdAt)
  const year = new Intl.DateTimeFormat('en', { year: 'numeric' }).format(createdAt)
  const formattedDate = `${day} ${month} ${year}`

  return (
    <Page>
      <h2 className="
        font-medium
        mb-2
        text-4xl
      ">
        {entry.name}
      </h2>
      <h4 className="text-secondary">
        {formattedDate}
      </h4>
    </Page>
  )
}

export default BlogEntryPage
