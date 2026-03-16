import type { CodegenConfig } from '@graphql-codegen/cli'

const config: CodegenConfig = {
  overwrite: true,
  schema: 'http://127.0.0.1:8001/graphql',
  generates: {
    './client-schema.graphql': {
      plugins: ['schema-ast'],
    },
  },
}

export default config
