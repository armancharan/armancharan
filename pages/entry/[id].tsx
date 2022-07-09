import { GetStaticProps, NextPage } from "next"
import { Page } from "../../components/page"
import { BlogEntry, getEntries, getContentByPageId } from "../../utils/notion"

const EntryPage: NextPage<BlogEntry> = props => {
  console.log(props)
  return (
    <Page>
      {props.content.map(block => {
        const isParagraphBlock = 'paragraph' in block
        if (isParagraphBlock) {
          return block.paragraph.rich_text.reduce((output, text) => {
            output += text.plain_text
            return output
          }, '')
        }

        return ''
      })}
    </Page>
  )
}

export default EntryPage

export async function getStaticPaths() {
  return {
    paths: (await getEntries()).map(entry => ({ params: { id: entry.id } })),
    fallback: false,
  }
}

export const getStaticProps: GetStaticProps<BlogEntry> = async context => {
  const id = String(context.params?.id)
  const content = await getContentByPageId(id)
  if (!content) throw new Error(`Invalid or missing entry — ${id}`)
  return {
    props: { content }
  }
}
