import { GetStaticProps, NextPage } from 'next'
import { Page } from '../components/page'
import Link from 'next/link'
import type { ComponentType } from 'react'
import { BlogEntryPreview, getEntries } from '../utils/notion'

type HomePageProps = {
  entries: BlogEntryPreview[]
}

const HomePage: NextPage<HomePageProps> = props => {
  
  return (
    <Page>
      <div>
        <div
            style={{
              display: 'grid',
              gridGap: '20px',
              gridTemplateColumns: '[col1-start] 33%  [col2-start] 33%  [col3-start] 33% [col3-end]',
              gridTemplateRows: '[row1-start] auto [row2-start] auto [row2-end]',
              margin: '0 auto',
              maxWidth: '100%',
              width: '1000px',
            }}
        >
          {props.entries.map(({ id, images, name }) => (
              <EntryPreview
                id={id}
                images={images}
                name={name}
              />
          ))}
        </div>
      </div>
    </Page>
  )
}

const EntryPreview: ComponentType<{ id: string, images: string[], name: string }> = props => {
  const [coverImage] = props.images

  return (
      <div style={{ margin: '0', width: '100%' }}>
        <div>
          <img
              src={coverImage}
              style={{ border: '1px solid black', borderRadius: '0', width: '100%' }}
          />
        </div>

        <Link href={`/entry/${props.id}`} passHref>
          <a style={{ fontSize: '12px' }}>
            {props.name}
          </a>
        </Link>
      </div>
  )
}

export default HomePage

export const getStaticProps: GetStaticProps<HomePageProps> = async () => {
  return {
    props: {
      entries: await getEntries()
    }
  }
}
