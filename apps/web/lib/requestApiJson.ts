type RequestApiJsonOptions = {
  body?: unknown
  method?: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT'
}

type ErrorPayload = {
  error?: {
    message?: string
  }
}

const API_BASE_ORIGIN = 'https://scaffold.local'
const INVALID_API_PATH_MESSAGE =
  'requestApiJson only accepts same-origin backend API paths like /api/auth/start.'

export class RequestApiJsonError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'RequestApiJsonError'
    this.status = status
  }
}

const toSafeApiPath = (path: string): string => {
  const trimmedPath = path.trim()

  if (!trimmedPath.startsWith('/api/') || trimmedPath.startsWith('//')) {
    throw new Error(INVALID_API_PATH_MESSAGE)
  }

  let parsedPath: URL
  try {
    parsedPath = new URL(trimmedPath, API_BASE_ORIGIN)
  } catch {
    throw new Error(INVALID_API_PATH_MESSAGE)
  }

  if (
    parsedPath.origin !== API_BASE_ORIGIN ||
    !parsedPath.pathname.startsWith('/api/')
  ) {
    throw new Error(INVALID_API_PATH_MESSAGE)
  }

  return `${parsedPath.pathname}${parsedPath.search}`
}

export const requestApiJson = async <TResponse>(
  path: string,
  options: RequestApiJsonOptions = {}
): Promise<TResponse> => {
  const { body, method = 'GET' } = options
  const safePath = toSafeApiPath(path)

  const response = await fetch(safePath, {
    method,
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const payload = (await response.json()) as ErrorPayload & TResponse

  if (!response.ok) {
    throw new RequestApiJsonError(
      payload.error?.message ?? `Request failed (${response.status})`,
      response.status
    )
  }

  return payload
}
