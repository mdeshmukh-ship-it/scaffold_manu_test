import * as Types from '../../__generated_types__/globalTypes';

export type NotesFieldsForNotesBoardFragment = { __typename?: 'NoteType', id: string, title: string, body: string, summary?: string | null, summaryProvider?: string | null };

export type GetNotesForNotesBoardQueryVariables = Types.Exact<{ [key: string]: never; }>;


export type GetNotesForNotesBoardQuery = { __typename?: 'Query', notes: Array<{ __typename?: 'NoteType', id: string, title: string, body: string, summary?: string | null, summaryProvider?: string | null }> };

export type CreateNoteFromNotesBoardMutationVariables = Types.Exact<{
  input: Types.CreateNoteInput;
}>;


export type CreateNoteFromNotesBoardMutation = { __typename?: 'Mutation', createNote: { __typename?: 'NoteType', id: string, title: string, body: string, summary?: string | null, summaryProvider?: string | null } };

export type SummarizeNoteFromNotesBoardMutationVariables = Types.Exact<{
  noteId: Types.Scalars['String']['input'];
}>;


export type SummarizeNoteFromNotesBoardMutation = { __typename?: 'Mutation', summarizeNote: { __typename?: 'NoteType', id: string, title: string, body: string, summary?: string | null, summaryProvider?: string | null } };
