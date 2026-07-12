// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, it, expect } from 'vitest'
import { ensureReviewWebview, REVIEW_MOBILE_USER_AGENT } from './review-webview'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('ensureReviewWebview', () => {
  it('creates a single partitioned webview and sets src', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    ensureReviewWebview({ container, taskId: 't1', url: 'http://localhost:3000', mobile: false })
    ensureReviewWebview({ container, taskId: 't1', url: 'http://localhost:3000', mobile: false })
    const webviews = container.querySelectorAll('webview')
    expect(webviews).toHaveLength(1)
    expect(webviews[0].getAttribute('partition')).toBe('review:t1')
    expect(webviews[0].getAttribute('src')).toBe('http://localhost:3000')
  })

  it('sets mobile UA when mobile and removes it on desktop', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    ensureReviewWebview({ container, taskId: 't1', url: 'http://x', mobile: true })
    expect(container.querySelector('webview')!.getAttribute('useragent')).toBe(
      REVIEW_MOBILE_USER_AGENT
    )
    ensureReviewWebview({ container, taskId: 't1', url: 'http://x', mobile: false })
    expect(container.querySelector('webview')!.getAttribute('useragent')).toBeNull()
  })
})
