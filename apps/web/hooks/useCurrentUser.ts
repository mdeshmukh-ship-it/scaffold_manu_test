import { useQuery } from '@apollo/client/react'
import { gql } from '@apollo/client'

import { isUnauthorizedApolloError } from '@/lib/isUnauthorizedApolloError'

import {
  GetCurrentUserQuery,
  GetCurrentUserQueryVariables,
} from './useCurrentUser.generatedTypes'

const GET_CURRENT_USER = gql`
  query GetCurrentUser {
    currentUser {
      id
      email
    }
  }
`

const useCurrentUser = () => {
  const { data, error, loading } = useQuery<
    GetCurrentUserQuery,
    GetCurrentUserQueryVariables
  >(GET_CURRENT_USER)

  return {
    currentUser: data?.currentUser ?? null,
    error,
    isUnauthorized: isUnauthorizedApolloError(error),
    loading,
  }
}

export default useCurrentUser
