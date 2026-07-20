import React, { useEffect, useRef } from 'react'
import { handleProsePaste } from './editorUtils.js'

// The prose DOM owns its text after initial mount, preserving the browser's
// native selection and undo history while commits keep the application state up to date.
export default React.memo(function SceneProse({ sceneId, initialContent, onCommit, onFocusScene, kind = 'scene' }) {
  const ref = useRef(null)

  const syncEmpty = () => {
    const element = ref.current
    if (element) element.classList.toggle('is-empty', !(element.textContent || '').trim())
  }

  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = initialContent || '<p></p>'
      syncEmpty()
    }
  }, []) // The DOM intentionally owns subsequent content changes.

  return (
    <div
      ref={ref}
      className="prose ms-prose"
      contentEditable
      suppressContentEditableWarning
      spellCheck
      data-prose={sceneId}
      data-placeholder="Write this scene…"
      onFocus={() => onFocusScene(sceneId)}
      onPaste={handleProsePaste}
      onInput={() => { syncEmpty(); onCommit(sceneId, ref.current.innerHTML, ref.current.textContent, kind) }}
      onBlur={() => { syncEmpty(); onCommit(sceneId, ref.current.innerHTML, ref.current.textContent, kind) }}
    />
  )
}, (previous, next) => previous.sceneId === next.sceneId)
