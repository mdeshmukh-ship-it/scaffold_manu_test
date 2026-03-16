import type { CodegenConfig } from '@graphql-codegen/cli'

const config: CodegenConfig = {
  overwrite: true,
  schema: './client-schema.graphql',
  documents: [
    '{hooks,components,pages}/**/*.{ts,tsx}',
    '!{hooks,components,pages}/**/*.generatedTypes.{ts,tsx}',
  ],
  generates: {
    './__generated_types__/globalTypes.ts': {
      plugins: ['typescript'],
    },
    './': {
      preset: 'near-operation-file',
      presetConfig: {
        extension: '.generatedTypes.ts',
        baseTypesPath: '__generated_types__/globalTypes.ts',
      },
      plugins: ['typescript-operations'],
    },
  },
}

export default config
