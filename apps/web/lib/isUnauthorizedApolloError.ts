import { ServerError } from '@apollo/client/errors'

export const isUnauthorizedApolloError = (error: unknown): boolean => {
  return ServerError.is(error) && error.statusCode === 401
}
