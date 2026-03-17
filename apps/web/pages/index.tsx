import { NextPageWithLayout } from '@/pages/_app'
import DefaultPageContainer from '@/components/layouts/DefaultPageContainer'
import FamilyStatusBoard from '@/components/dashboard/FamilyStatusBoard'

const Home: NextPageWithLayout = () => <FamilyStatusBoard />

Home.getLayout = (page) => (
  <DefaultPageContainer title="Portfolio Drift Monitor">{page}</DefaultPageContainer>
)

export default Home
