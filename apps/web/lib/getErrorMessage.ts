export const getErrorMessage = (error: unknown, fallback = 'Unknown error'): string => {
  if (error instanceof Error) {
    return error.message
  }

  return fallback
}
