# Frontend Guide

## Default Stack

- Next.js Pages Router
- TypeScript
- Apollo Client for GraphQL application data
- GraphQL codegen for operation types
- Shared design tokens in `styles/globals.css`
- Tailwind v4
- Yarn in `apps/web`

## Core Guardrails

- Keep `pages/*` very small and client-only.
- Treat the frontend as client-only:
  - no App Router
  - no middleware
  - no API routes
  - no `getServerSideProps`
  - no `getStaticProps`
- Put UI in `components/*`, reusable hooks in `hooks/*`, browser helper functions in `lib/*`, and Apollo setup in `clients/*`.
- Use Apollo Client for `/graphql` and `requestApiJson()` for browser calls to `/api/*`.
- Keep browser requests limited to scaffold backend endpoints.
- Do not add extra client state libraries unless explicitly requested.
- Prefer one obvious pattern over flexible abstractions. Keep the default app small and readable.
- Keep shared primitives in `components/generic` only when they reduce repetition without hiding behavior.

## GraphQL Typing

- Operation files live in `hooks`, `components`, or `pages`.
- Generated files live next to operations and in `__generated_types__`.
- Do not hand-edit `*.generatedTypes.ts`.
- Run this whenever frontend GraphQL operations change:

```bash
cd apps/web && yarn codegen
```

- If backend GraphQL schema changes, refresh the committed schema snapshot first:

```bash
cd apps/web && yarn schema:refresh
cd apps/web && yarn codegen
```

## Styling

- Tailwind v4 theme lives in `styles/globals.css`.
- Import it only in `pages/_app.tsx`.
- Keep custom CSS minimal.
- Keep custom colors minimal and strongly prefer existing colors defined in `styles/globals.css`.
- If icons are needed, use `lucide-react`.

## Quality Checks

- `cd apps/web && yarn codegen`
- `make lint`
- `make typecheck`
- `make test`
- `make security`
