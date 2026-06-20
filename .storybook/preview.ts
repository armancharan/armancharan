import type { Preview } from '@storybook/react'
// Tailwind base + the site's :root tokens (background/primary/secondary, the
// 11.5px root font). Processed through the project's PostCSS/Tailwind config.
import '../app/global.css'

const preview: Preview = {
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'page',
      values: [{ name: 'page', value: '#000000' }],
    },
  },
}

export default preview
