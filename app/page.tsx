import { entries } from '../blog/entries'
import { BlogEntryList } from '../ui/blog_entry_list'
import { Page } from '../ui/page'

const HomePage = () => {
  return (
    <Page>
      <BlogEntryList
        entries={entries}
      />
    </Page>
  )
}

export default HomePage
