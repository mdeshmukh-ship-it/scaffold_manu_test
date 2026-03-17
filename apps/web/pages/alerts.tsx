import { NextPageWithLayout } from '@/pages/_app'
import DefaultPageContainer from '@/components/layouts/DefaultPageContainer'
import AlertHistory from '@/components/alerts/AlertHistory'

const AlertsPage: NextPageWithLayout = () => <AlertHistory />

AlertsPage.getLayout = (page) => (
  <DefaultPageContainer title="Alert History">{page}</DefaultPageContainer>
)

export default AlertsPage
