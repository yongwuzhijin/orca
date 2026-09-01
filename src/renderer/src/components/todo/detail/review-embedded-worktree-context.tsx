import React from 'react'

const ReviewEmbeddedWorktreeContext = React.createContext<string | null>(null)

export function ReviewEmbeddedWorktreeProvider({
  worktreeId,
  children
}: {
  worktreeId: string | null
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <ReviewEmbeddedWorktreeContext.Provider value={worktreeId}>
      {children}
    </ReviewEmbeddedWorktreeContext.Provider>
  )
}

export function useReviewEmbeddedWorktreeId(): string | null {
  return React.useContext(ReviewEmbeddedWorktreeContext)
}
