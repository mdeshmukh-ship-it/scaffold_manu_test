import { NextPageWithLayout } from '@/pages/_app'
import DefaultPageContainer from '@/components/layouts/DefaultPageContainer'
import CIODashboard from '@/components/cio/CIODashboard'

const CIOPage: NextPageWithLayout = () => <CIODashboard />

CIOPage.getLayout = (page) => (
  <DefaultPageContainer title="CIO Dashboard">{page}</DefaultPageContainer>
)

export default CIOPage
