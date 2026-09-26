import { createContext, useContext } from 'react'

export const SessionContext = createContext<{ userId: string | null }>({ userId: null })

export function useUserId(): string | null {
  return useContext(SessionContext).userId
}
