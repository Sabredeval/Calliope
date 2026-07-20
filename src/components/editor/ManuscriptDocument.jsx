import React from 'react'
import { chapterWords, sceneWords, SCENES_ENABLED } from '../../store.jsx'
import SceneProse from './SceneProse.jsx'

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
            <input
              className="ms-group-title"
              value={node.group.title}
              placeholder="Act title"
              onChange={(event) => dispatch({ type: 'group/update', id: node.group.id, patch: { title: event.target.value } })}
            />
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
          <input
            className="ms-chapter-title"
            value={chapter.title}
            placeholder="Chapter title"
            onChange={(event) => dispatch({ type: 'chapter/update', id: chapter.id, patch: { title: event.target.value } })}
          />
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
