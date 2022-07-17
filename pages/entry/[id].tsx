import { GetStaticProps, NextPage } from "next"
import styled from "styled-components"
import { Page } from "../../components/page"
import { BlogEntry, getEntries, getEntry, getContentByPageId } from "../../utils/notion"

const EntryPage: NextPage<BlogEntry & { error: false } | { error: true }> = props => {
  if (props.error) {
    return <Page>
      An unknown error occurred.
    </Page>
  }

  return (
    <Page>
      <h1>{props.name}</h1>
      <Content>
        {props.content?.map(block => {
          const isParagraphBlock = 'paragraph' in block
          if (isParagraphBlock) {
            return block.paragraph.rich_text.reduce((output, text) => {
              output += text.plain_text
              return output
            }, '')
          }

          return ''
        })}
      </Content>
    </Page>
  )
}

export default EntryPage

const Content = styled.div`
  line-height: 1.618;
`

export async function getStaticPaths() {
  return {
    paths: (await getEntries()).map(entry => ({ params: { id: entry.id } })),
    fallback: false,
  }
}

export const getStaticProps: GetStaticProps<BlogEntry | {}> = async context => {

  const id = String(context.params?.id)
  const [
    entry,
    content,
  ] = await Promise.all([
    await getEntry(id),
    await getContentByPageId(id),
  ])

  return {
    props: entry ? { error: false, ...entry, content } : { error: true }
  }
}
