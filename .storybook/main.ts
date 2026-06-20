import type { StorybookConfig } from '@storybook/react-vite'
import { mergeConfig } from 'vite'

const config: StorybookConfig = {
  stories: ['../ui/**/*.stories.@(ts|tsx)'],
  // Storybook 10 folds the former addon-essentials (controls, actions, viewport,
  // backgrounds, etc.) into core, so no explicit addons are needed here.
  framework: { name: '@storybook/react-vite', options: {} },
  // Serve the Next.js public/ dir so the photo + shard crops resolve.
  staticDirs: ['../public'],
  // The app's tsconfig sets `jsx: "preserve"` (for Next), which makes esbuild
  // fall back to the classic React.createElement transform — that needs `React`
  // in scope and throws "React is not defined". Force the automatic runtime so
  // JSX compiles to react/jsx-runtime and the production files stay import-clean.
  viteFinal: async base =>
    mergeConfig(base, {
      esbuild: { jsx: 'automatic' },
    }),
}

export default config
