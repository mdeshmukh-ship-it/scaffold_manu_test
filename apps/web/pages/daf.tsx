import { NextPageWithLayout } from '@/pages/_app'
import DefaultPageContainer from '@/components/layouts/DefaultPageContainer'
import DAFLotSelector from '@/components/daf/DAFLotSelector'

const DAFPage: NextPageWithLayout = () => <DAFLotSelector />

DAFPage.getLayout = (page) => (
  <DefaultPageContainer title="DAF Lot Selector">{page}</DefaultPageContainer>
)

export default DAFPage
