import * as Types from '../__generated_types__/globalTypes';

export type GetCurrentUserQueryVariables = Types.Exact<{ [key: string]: never; }>;


export type GetCurrentUserQuery = { __typename?: 'Query', currentUser: { __typename?: 'CurrentUserType', id: string, email: string } };
