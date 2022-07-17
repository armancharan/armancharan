import { Client } from '@notionhq/client'
import { ListBlockChildrenResponse } from '@notionhq/client/build/src/api-endpoints'

const Config = {
  NOTION: {
    KEY: process.env.NOTION_KEY || 'undefined',
    ENTRIES_DATABASE_ID: process.env.NOTION_OBJECTS_DATABASE_ID || 'undefined'
  }
} as const

const notion = new Client({ auth: Config.NOTION.KEY })

export type BlogEntry = {
  id: string
  images: string[]
  manufacturer: string
  name: string,
  content: ListBlockChildrenResponse['results']
}

export type BlogEntryPreview = {
  id: string
  cover: string | null
  images: string[]
  manufacturer: string
  name: string
  publish: boolean
}

let entries: BlogEntryPreview[] | undefined

export const getEntries = async (): Promise<BlogEntryPreview[]> => {
  if (entries == null) {
    entries = []
    const response = await notion.databases.query({ database_id: Config.NOTION.ENTRIES_DATABASE_ID })
    for (const result of response.results) {


      const resultHasPropertiesField = 'properties' in result
      if (!resultHasPropertiesField) continue
      const { archived, properties } = result

      if (archived) continue
  
      const id = result.id
      if (!id) continue

      const publish = 'publish' in properties
          && properties.publish.type === 'checkbox'
          && properties.publish.checkbox

      const cover = 'cover' in properties
          && properties.cover.type === 'files'
          && properties.cover.files[0]
          && (
              properties.cover.files[0].type === 'external' && properties.cover.files[0].external.url
              || properties.cover.files[0].type === 'file' && properties.cover.files[0].file.url
          )
          || null
  
      const images = 'images' in properties
          && properties.images.type === 'files'
          && properties.images.files.reduce<string[]>((acc, file) => {
            file.type === 'external' && file.external.url || file.type === 'file' && acc.push(file.file.url)
            return acc
          }, [])
      if (!images) continue
  
      const manufacturer = 'manufacturer' in properties
          && properties.manufacturer.type === 'rich_text'
          && properties.manufacturer.rich_text.reduce((acc, richText) => acc + richText.plain_text, '')
      if (!manufacturer) continue
  
      const name = 'name' in properties
          && properties.name.type === 'title'
          && properties.name.title.reduce((acc, title) => acc + title.plain_text, '')
      if (!name) continue
  
      entries.push({
        id,
        cover,
        images,
        manufacturer,
        name,
        publish,
      })
    }
  }

  return entries
}

export const getContentByPageId = async (id: string) => {
  const response = await notion.blocks.children.list({ block_id: id })
  return response.results
}
