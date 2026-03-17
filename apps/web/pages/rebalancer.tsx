import { NextPageWithLayout } from '@/pages/_app'
import DefaultPageContainer from '@/components/layouts/DefaultPageContainer'
import RebalancerWizard from '@/components/rebalancer/RebalancerWizard'

const RebalancerPage: NextPageWithLayout = () => <RebalancerWizard />

RebalancerPage.getLayout = (page) => (
  <DefaultPageContainer title="Portfolio Rebalancer">{page}</DefaultPageContainer>
)

export default RebalancerPage
