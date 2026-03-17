import { FC, PropsWithChildren } from 'react'
import Head from 'next/head'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

const DefaultPageContainer: FC<PropsWithChildren<{ title?: string }>> = ({
  title,
  children,
}) => {
  return (
    <div>
      <Head>
        <title>{title ?? 'Portfolio Drift Monitor'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className={inter.className}>{children}</main>
    </div>
  )
}

export default DefaultPageContainer
