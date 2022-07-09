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
  images: string[]
  manufacturer: string
  name: string,
}

let entries: BlogEntryPreview[] | undefined

export const getEntries = async (): Promise<BlogEntryPreview[]> => {
  if (entries == null) {
    entries = []
    const response = await notion.databases.query({ database_id: Config.NOTION.ENTRIES_DATABASE_ID })
    for (const result of response.results) {

      console.log('RESULT', result)

      const resultHasPropertiesField = 'properties' in result
      if (!resultHasPropertiesField) continue
      const { archived, properties } = result

      if (archived) continue
  
      const id = result.id
      if (!id) continue
  
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
        images,
        manufacturer,
        name,
      })
    }
  }

  return entries
}

export const getContentByPageId = async (id: string) => {
  const response = await notion.blocks.children.list({ block_id: id })
  return response.results
}