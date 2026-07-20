import React from 'react'
import { chapterWords, sceneWords, SCENES_ENABLED } from '../../store.jsx'
import SceneProse from './SceneProse.jsx'

function HeadingEngraving({ kind }) {
  const isGroup = kind === 'group'
  return (
    <span className={`ms-heading-engraving ms-heading-engraving--${kind}`} aria-hidden="true">
      <svg viewBox="0 0 180 28" preserveAspectRatio="none" focusable="false">
        {isGroup ? (
          <>
            <path className="engraving-stroke" d="M2 14c24 0 45-.5 66 0 15 .4 22-5 31-9 11-5 23-3 27 5 3 6-1 12-8 12-5 0-9-4-7-9 1-4 7-5 10-1" />
            <path className="engraving-stroke engraving-fine" d="M67 14c17 0 24 6 35 10 12 4 24 1 31-7 6-7 14-9 23-6" />
            <path className="engraving-stroke engraving-fine" d="M91 10c-6-4-8-8-6-12M132 17c5 7 12 10 20 8" />
            <path className="engraving-leaf" d="M94 8c-6 1-10-2-12-7 6-1 11 2 12 7ZM104 22c-5 3-10 2-13-2 4-4 10-3 13 2Z" />
            <circle className="engraving-dot" cx="154" cy="11" r="1.7" />
          </>
        ) : (
          <>
            <path className="engraving-stroke" d="M2 14h85c20 0 28-9 43-8 11 0 17 7 13 13-3 5-11 4-11-2 0-4 5-5 8-2" />
            <path className="engraving-stroke engraving-fine" d="M91 14c16 0 23 8 39 8 12 0 19-5 26-10" />
            <path className="engraving-leaf" d="M116 9c-5 0-8-3-9-7 5 0 9 3 9 7Z" />
          </>
        )}
        <path className="engraving-stroke engraving-terminal" d="M151 14h27" />
        <path className="engraving-jewel" d="m160 14 5-4 5 4-5 4Z" />
      </svg>
    </span>
  )
}

export default function ManuscriptDocument({
  activeSceneId, chapters, commit, dispatch, novelTitle, onActiveSceneChange,
  registerSection, statusOf, tree, uid,
}) {
  const chapterSiblings = (groupId) => chapters.filter((chapter) => (chapter.groupId ?? null) === (groupId ?? null))

  const renderNode = (node, depth) => {
    if (node.type === 'group') {
      return (
        <div className="ms-group" key={node.group.id} data-depth={depth}>
          <div className="ms-group-head">
            <HeadingEngraving kind="group" />
            <input
              className="ms-group-title"
              value={node.group.title}
              placeholder="Act title"
              onChange={(event) => dispatch({ type: 'group/update', id: node.group.id, patch: { title: event.target.value } })}
            />
            <HeadingEngraving kind="group" />
          </div>
          {node.children.map((child) => renderNode(child, depth + 1))}
        </div>
      )
    }

    const chapter = node.chapter
    const siblings = chapterSiblings(chapter.groupId)
    const chapterIndex = siblings.findIndex((sibling) => sibling.id === chapter.id)
    const isFlow = chapter.scenes.length === 0
    const flowActive = isFlow && chapter.id === activeSceneId

    return (
      <div className="ms-chapter" key={chapter.id}>
        <div className="ms-chapter-head">
          <span className="ms-chapter-kicker">
            Chapter {chapterIndex + 1}
            {isFlow ? ` · ${chapterWords(chapter).toLocaleString()} words` : <>{' · '}{`${chapter.scenes.length} scene${chapter.scenes.length === 1 ? '' : 's'}`}{' · '}{chapterWords(chapter).toLocaleString()} words</>}
          </span>
          <HeadingEngraving kind="chapter" />
          <input
            className="ms-chapter-title"
            value={chapter.title}
            placeholder="Chapter title"
            onChange={(event) => dispatch({ type: 'chapter/update', id: chapter.id, patch: { title: event.target.value } })}
          />
          <HeadingEngraving kind="chapter" />
        </div>

        {isFlow ? (
          <section className={`ms-scene ${flowActive ? 'active' : ''}`} ref={registerSection(chapter.id)} onClick={() => { if (!flowActive) onActiveSceneChange(chapter.id) }}>
            <SceneProse sceneId={chapter.id} initialContent={chapter.content} onCommit={commit} onFocusScene={onActiveSceneChange} kind="chapter" />
          </section>
        ) : (
          chapter.scenes.map((scene, sceneIndex) => {
            const isActive = scene.id === activeSceneId
            return (
              <React.Fragment key={scene.id}>
                {sceneIndex > 0 && <div className="ms-divider" aria-hidden="true">⁂</div>}
                <section className={`ms-scene ${isActive ? 'active' : ''}`} ref={registerSection(scene.id)} onClick={() => { if (!isActive) onActiveSceneChange(scene.id) }}>
                  <div className="ms-scene-head">
                    <span className="status-dot" style={{ background: statusOf(scene)?.color }} title={statusOf(scene)?.label} />
                    <input
                      className="ms-scene-title"
                      value={scene.title}
                      placeholder="Scene title"
                      onFocus={() => onActiveSceneChange(scene.id)}
                      onChange={(event) => dispatch({ type: 'scene/update', id: scene.id, patch: { title: event.target.value } })}
                    />
                    <span className="ms-scene-words">{sceneWords(scene).toLocaleString()} w</span>
                  </div>
                  <SceneProse sceneId={scene.id} initialContent={scene.content} onCommit={commit} onFocusScene={onActiveSceneChange} />
                </section>
              </React.Fragment>
            )
          })
        )}

        {SCENES_ENABLED && (
          <button
            className="ms-add-scene"
            onClick={() => {
              if (isFlow) {
                const newId = uid()
                dispatch({ type: 'chapter/splitToScenes', id: chapter.id, newSceneId: newId })
                onActiveSceneChange(newId)
              } else {
                dispatch({ type: 'scene/add', chapterId: chapter.id })
              }
            }}
          >
            {isFlow ? `Split "${chapter.title || 'this chapter'}" into scenes` : `+ Add scene to ${chapter.title || `Chapter ${chapterIndex + 1}`}`}
          </button>
        )}
      </div>
    )
  }

  return (
    <>
      {chapters.length === 0 && (
        <div className="ms-doc-empty">
          <h2>{novelTitle || 'Your novel'}</h2>
          <p>The manuscript is empty. Add a chapter from the panel on the left, and start writing.</p>
        </div>
      )}
      {tree.map((node) => renderNode(node, 0))}
      {chapters.length > 0 && <button className="ms-add-chapter" onClick={() => dispatch({ type: 'chapter/add' })}>+ New chapter</button>}
    </>
  )
}
