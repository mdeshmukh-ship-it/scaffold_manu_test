import { NextPageWithLayout } from '@/pages/_app'
import DefaultPageContainer from '@/components/layouts/DefaultPageContainer'
import NotesBoard from '@/components/notes/NotesBoard'

const Home: NextPageWithLayout = () => <NotesBoard />

Home.getLayout = (page) => (
  <DefaultPageContainer title="Notes">{page}</DefaultPageContainer>
)

export default Home
