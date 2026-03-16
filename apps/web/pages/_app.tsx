import { ReactElement, ReactNode } from 'react'
import { NextPage } from 'next'
import type { AppProps } from 'next/app'
import { ApolloProvider } from '@apollo/client/react'

import '@/styles/globals.css'
import client from '@/clients/apolloClient'

export type NextPageWithLayout = NextPage & {
  getLayout?: (page: ReactElement) => ReactNode
}

export default function App({
  Component,
  pageProps,
}: AppProps & { Component: NextPageWithLayout }) {
  const getLayout = Component.getLayout ?? ((page) => page)

  return (
    <ApolloProvider client={client}>
      {getLayout(<Component {...pageProps} />)}
    </ApolloProvider>
  )
}
