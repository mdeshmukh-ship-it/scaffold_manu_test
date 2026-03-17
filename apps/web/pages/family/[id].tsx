import { useRouter } from 'next/router'

import { NextPageWithLayout } from '@/pages/_app'
import DefaultPageContainer from '@/components/layouts/DefaultPageContainer'
import FamilyDrillDown from '@/components/family/FamilyDrillDown'

const FamilyPage: NextPageWithLayout = () => {
  const router = useRouter()
  const { id } = router.query

  if (!id || typeof id !== 'string') {
    return null
  }

  return <FamilyDrillDown familyId={id} />
}

FamilyPage.getLayout = (page) => (
  <DefaultPageContainer title="Family Detail">{page}</DefaultPageContainer>
)

export default FamilyPage
