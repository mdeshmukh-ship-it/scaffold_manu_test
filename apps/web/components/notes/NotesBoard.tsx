import { gql } from '@apollo/client'
import { useMutation, useQuery } from '@apollo/client/react'
import { type FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/router'

import { Button } from '@/components/generic/Button'
import useCurrentUser from '@/hooks/useCurrentUser'
import { Input } from '@/components/generic/Input'
import SectionContainer from '@/components/generic/SectionContainer'
import { Spinner } from '@/components/generic/Spinner'
import { Textarea } from '@/components/generic/Textarea'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { isUnauthorizedApolloError } from '@/lib/isUnauthorizedApolloError'
import { requestApiJson } from '@/lib/requestApiJson'

import {
  CreateNoteFromNotesBoardMutation,
  CreateNoteFromNotesBoardMutationVariables,
  GetNotesForNotesBoardQuery,
  GetNotesForNotesBoardQueryVariables,
  SummarizeNoteFromNotesBoardMutation,
  SummarizeNoteFromNotesBoardMutationVariables,
} from './NotesBoard.generatedTypes'

const NOTES_FIELDS = gql`
  fragment NotesFieldsForNotesBoard on NoteType {
    id
    title
    body
    summary
    summaryProvider
  }
`

const GET_NOTES = gql`
  query GetNotesForNotesBoard {
    notes {
      ...NotesFieldsForNotesBoard
    }
  }
  ${NOTES_FIELDS}
`

const CREATE_NOTE = gql`
  mutation CreateNoteFromNotesBoard($input: CreateNoteInput!) {
    createNote(input: $input) {
      ...NotesFieldsForNotesBoard
    }
  }
  ${NOTES_FIELDS}
`

const SUMMARIZE_NOTE = gql`
  mutation SummarizeNoteFromNotesBoard($noteId: String!) {
    summarizeNote(noteId: $noteId) {
      ...NotesFieldsForNotesBoard
    }
  }
  ${NOTES_FIELDS}
`

const NotesBoard = () => {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const {
    currentUser,
    error: currentUserError,
    isUnauthorized,
    loading: currentUserLoading,
  } = useCurrentUser()

  const {
    data: notesData,
    error: notesError,
    loading: notesLoading,
    refetch,
  } = useQuery<GetNotesForNotesBoardQuery, GetNotesForNotesBoardQueryVariables>(
    GET_NOTES,
    { skip: !currentUser }
  )

  const [createNote, { loading: creatingNote }] = useMutation<
    CreateNoteFromNotesBoardMutation,
    CreateNoteFromNotesBoardMutationVariables
  >(CREATE_NOTE)

  const [summarizeNote, { loading: summarizingNote }] = useMutation<
    SummarizeNoteFromNotesBoardMutation,
    SummarizeNoteFromNotesBoardMutationVariables
  >(SUMMARIZE_NOTE)

  const notes = notesData?.notes ?? []
  const isBusy = creatingNote || summarizingNote
  const notesRequireLogin = isUnauthorizedApolloError(notesError)
  const shouldRedirectToLogin =
    isUnauthorized ||
    notesRequireLogin ||
    (!currentUserLoading && !currentUser && !currentUserError)

  useEffect(() => {
    if (shouldRedirectToLogin) {
      void router.replace('/login')
    }
  }, [router, shouldRedirectToLogin])

  const handleCreateNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)

    try {
      await createNote({ variables: { input: { title, body } } })
      setTitle('')
      setBody('')
      await refetch()
    } catch (err) {
      if (isUnauthorizedApolloError(err)) {
        await router.push('/login')
        return
      }
      setErrorMessage(getErrorMessage(err))
    }
  }

  const logout = async () => {
    setErrorMessage(null)

    try {
      await requestApiJson('/api/auth/logout', { method: 'POST' })
      await router.push('/login')
    } catch (err) {
      setErrorMessage(getErrorMessage(err))
    }
  }

  const handleSummarizeNote = async (noteId: string) => {
    setErrorMessage(null)

    try {
      await summarizeNote({ variables: { noteId } })
      await refetch()
    } catch (err) {
      if (isUnauthorizedApolloError(err)) {
        await router.push('/login')
        return
      }
      setErrorMessage(getErrorMessage(err))
    }
  }

  const visibleErrorMessage =
    errorMessage ||
    (!isUnauthorized && currentUserError ? getErrorMessage(currentUserError) : null) ||
    (!notesRequireLogin && notesError ? getErrorMessage(notesError) : null)

  if (currentUserLoading || shouldRedirectToLogin) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Spinner className="text-blue-400 text-2xl" />
      </div>
    )
  }

  if (!currentUser) {
    return null
  }

  return (
    <div className="flex min-h-screen flex-col items-center gap-4 p-6">
      <SectionContainer
        title="Account"
        containerClassName="w-full max-w-[600px] rounded-md"
        className="mt-3 flex flex-col gap-3"
        titleClassName="text-base"
      >
        <div className="text-secondary-foreground text-sm">
          Signed in as {currentUser.email}.
        </div>
        <div>
          <Button onClick={() => void logout()} type="button" variant="outline">
            Logout
          </Button>
        </div>
      </SectionContainer>
      <SectionContainer
        title="Create Note"
        containerClassName="w-full max-w-[600px] rounded-md"
        titleClassName="text-base"
      >
        <form className="mt-4 flex flex-col gap-3" onSubmit={handleCreateNote}>
          <Input
            required
            placeholder="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <Textarea
            placeholder="Body"
            rows={5}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <div className="flex justify-end">
            <Button disabled={isBusy} type="submit">
              {creatingNote ? 'Creating...' : 'Create Note'}
            </Button>
          </div>
        </form>
      </SectionContainer>
      <SectionContainer
        title="Your Notes"
        containerClassName="w-full max-w-[600px] rounded-md"
        className="mt-4 flex flex-col gap-3"
        titleClassName="text-base"
      >
        {notesLoading ? (
          <div className="text-secondary-foreground text-sm">Loading notes...</div>
        ) : null}
        {!notesLoading && notes.length === 0 ? (
          <div className="text-secondary-foreground text-xs">No notes yet.</div>
        ) : null}
        {notes.map(({ id, title, body, summary, summaryProvider }) => (
          <div
            key={id}
            className="flex flex-col gap-1 rounded-md border border-neutral-750 p-3 hover:border-neutral-700"
          >
            <div className="text-sm font-medium">{title}</div>
            <div className="text-secondary-foreground text-xs">{body}</div>
            <div className="mt-3 flex flex-col gap-1 rounded-md bg-neutral-750 p-3">
              <div className="text-sm font-medium">Summary</div>
              <div className="text-xs text-secondary-foreground">
                {summary || 'No summary yet.'}
              </div>
              {summaryProvider ? (
                <div className="text-xs text-tertiary">
                  Generated by {summaryProvider}
                </div>
              ) : null}
            </div>
            <div className="mt-2">
              <Button
                disabled={isBusy}
                onClick={() => void handleSummarizeNote(id)}
                type="button"
                variant="outline"
              >
                {summarizingNote ? 'Summarizing...' : 'Summarize Note'}
              </Button>
            </div>
          </div>
        ))}
        {visibleErrorMessage ? (
          <div className="text-sm text-rose-700">{visibleErrorMessage}</div>
        ) : null}
      </SectionContainer>
    </div>
  )
}

export default NotesBoard
