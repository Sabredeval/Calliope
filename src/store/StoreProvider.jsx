import React, { createContext, useContext, useEffect, useReducer, useRef } from 'react'
import { loadState, novelKey, updateLibraryEntry } from './persistence.js'
import { reducer } from './reducer.js'

/* ---------- context ---------- */

const StoreContext = createContext(null)

export function StoreProvider({ novelId, children }) {
  const [state, dispatch] = useReducer(reducer, novelId, loadState)
  const saveTimer = useRef(null)

  useEffect(() => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      try {
        const { _newSceneId, ...toSave } = state
        localStorage.setItem(novelKey(novelId), JSON.stringify(toSave))
        updateLibraryEntry(novelId, toSave)
      } catch (e) {
        console.warn('Failed to save', e)
      }
    }, 400)
    return () => clearTimeout(saveTimer.current)
  }, [state, novelId])

  return <StoreContext.Provider value={{ state, dispatch }}>{children}</StoreContext.Provider>
}

export const useStore = () => useContext(StoreContext)

