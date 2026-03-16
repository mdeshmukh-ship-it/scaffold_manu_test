import { NextPageWithLayout } from '@/pages/_app'
import DefaultPageContainer from '@/components/layouts/DefaultPageContainer'
import LoginFlow from '@/components/login/LoginFlow'

const LoginPage: NextPageWithLayout = () => <LoginFlow />

LoginPage.getLayout = (page) => (
  <DefaultPageContainer title="Sign In">{page}</DefaultPageContainer>
)

export default LoginPage
