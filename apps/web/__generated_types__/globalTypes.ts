export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
};

export type CreateNoteInput = {
  body?: Scalars['String']['input'];
  title: Scalars['String']['input'];
};

export type CurrentUserType = {
  __typename?: 'CurrentUserType';
  email: Scalars['String']['output'];
  id: Scalars['String']['output'];
};

export type Mutation = {
  __typename?: 'Mutation';
  createNote: NoteType;
  startNoteSummaryRun: TaskRunType;
  summarizeNote: NoteType;
};


export type MutationCreateNoteArgs = {
  input: CreateNoteInput;
};


export type MutationSummarizeNoteArgs = {
  noteId: Scalars['String']['input'];
};

export type NoteType = {
  __typename?: 'NoteType';
  body: Scalars['String']['output'];
  createdAt: Scalars['String']['output'];
  id: Scalars['String']['output'];
  summary?: Maybe<Scalars['String']['output']>;
  summaryProvider?: Maybe<Scalars['String']['output']>;
  summaryUpdatedAt?: Maybe<Scalars['String']['output']>;
  title: Scalars['String']['output'];
};

export type Query = {
  __typename?: 'Query';
  currentUser: CurrentUserType;
  notes: Array<NoteType>;
  taskRun?: Maybe<TaskRunType>;
  taskRuns: Array<TaskRunType>;
  viewer: ViewerType;
};


export type QueryTaskRunArgs = {
  taskRunId: Scalars['String']['input'];
};

export type TaskRunType = {
  __typename?: 'TaskRunType';
  createdAt: Scalars['String']['output'];
  errorMessage?: Maybe<Scalars['String']['output']>;
  finishedAt?: Maybe<Scalars['String']['output']>;
  id: Scalars['String']['output'];
  message?: Maybe<Scalars['String']['output']>;
  progressCurrent: Scalars['Int']['output'];
  progressTotal: Scalars['Int']['output'];
  status: Scalars['String']['output'];
  taskName: Scalars['String']['output'];
  updatedAt: Scalars['String']['output'];
};

export type ViewerType = {
  __typename?: 'ViewerType';
  email: Scalars['String']['output'];
};
