import React from 'react'

export type ReviewFilePreviewTarget = {
  filePath: string
  relativePath: string
  fileName: string
}

type ReviewFilePreviewContextValue = {
  onFileActivate: ((target: ReviewFilePreviewTarget) => void) | null
}

const ReviewFilePreviewContext = React.createContext<ReviewFilePreviewContextValue>({
  onFileActivate: null
})

export function ReviewFilePreviewProvider({
  onFileActivate,
  children
}: {
  onFileActivate: (target: ReviewFilePreviewTarget) => void
  children: React.ReactNode
}): React.JSX.Element {
  const value = React.useMemo(() => ({ onFileActivate }), [onFileActivate])
  return (
    <ReviewFilePreviewContext.Provider value={value}>{children}</ReviewFilePreviewContext.Provider>
  )
}

export function useReviewFilePreviewActivate(): ((target: ReviewFilePreviewTarget) => void) | null {
  return React.useContext(ReviewFilePreviewContext).onFileActivate
}
