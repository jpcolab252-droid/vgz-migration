'use client'

import { useState, useCallback } from 'react'
import styles from './page.module.css'

type NavItem = { id: string; label: string; url: string; type: string }
type FetchedData = { pageTitle: string; metaDescription: string; body: string; mediaItems: string[]; fetchedUrl: string; incomplete: boolean; source: string }
type Analysis = { contentType: string; titel: string; slug: string; thema: string; samenvatting: string; notitie: string }
type Decision = 'migreren' | 'later' | 'niet-migreren' | null
type TreeFolder = { label: string; key: string; items: NavItem[] }
type MigrateResult = { success: boolean; entryId?: string; message?: string; error?: string; method?: string }

const THEMES = ['Bewegen', 'Voeding', 'Mentale gezondheid']
const TYPES = ['Artikel', 'Service', 'Thema']

function typeIcon(t: string) { return t === 'Thema' ? '📋' : t === 'Service' ? '🔧' : '📄' }

function scPath(url: string): string {
  const path = url.startsWith('http') ? url.replace('https://www.vgz.nl', '') : url
  return '/sitecore/content/VGZ' + path.replace('/gezond-leven', '/Gezond Leven')
}

export default function Page() {
  const [urlInput, setUrlInput] = useState('https://www.vgz.nl/gezond-leven/bewegen')
  const [discovering, setDiscovering] = useState(false)
  const [tree, setTree] = useState<TreeFolder[]>([])
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({})
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [currentItem, setCurrentItem] = useState<NavItem | null>(null)
  const [fetched, setFetched] = useState<Record<string, FetchedData>>({})
  const [fetching, setFetching] = useState<Record<string, boolean>>({})
  const [analyses, setAnalyses] = useState<Record<string, Analysis>>({})
  const [analyzing, setAnalyzing] = useState(false)
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [migrating, setMigrating] = useState(false)
  const [migrateResults, setMigrateResults] = useState<Record<string, MigrateResult>>({})
  const [showSkipModal, setShowSkipModal] = useState(false)
  const [skipReason, setSkipReason] = useState('')

  const allItems = tree.flatMap(f => f.items)
  const currentFetch = currentId ? fetched[currentId] ?? null : null
  const currentAnalysis = currentId ? analyses[currentId] ?? null : null
  const currentDecision = currentId ? decisions[currentId] ?? null : null
  const currentMigrate = currentId ? migrateResults[currentId] ?? null : null

  // ── Discover tree from URL ──────────────────────────────────────────────────
  const discover = useCallback(async () => {
    const url = urlInput.trim()
    if (!url.startsWith('https://www.vgz.nl')) { alert('Alleen vgz.nl URLs zijn toegestaan'); return }
    setDiscovering(true)
    try {
      const r = await fetch('/api/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await r.json()
      if (data.error) { alert(data.error); return }
      const folderLabel = data.rootItem.label
      const folderKey = data.rootItem.id
      const items: NavItem[] = [data.rootItem, ...data.children]
      setTree(prev => {
        const existing = prev.findIndex(f => f.key === folderKey)
        const newFolder = { label: folderLabel, key: folderKey, items }
        if (existing >= 0) {
          const updated = [...prev]; updated[existing] = newFolder; return updated
        }
        return [...prev, newFolder]
      })
      setOpenFolders(prev => ({ ...prev, [folderKey]: true }))
    } catch { alert('Ophalen mislukt') }
    setDiscovering(false)
  }, [urlInput])

  // ── Fetch item content ──────────────────────────────────────────────────────
  const doFetch = useCallback(async (item: NavItem) => {
    setFetching(prev => ({ ...prev, [item.id]: true }))
    const fullUrl = item.url.startsWith('http') ? item.url : 'https://www.vgz.nl' + item.url
    try {
      const r = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: fullUrl }),
      })
      const data = await r.json()
      setFetched(prev => ({ ...prev, [item.id]: data }))
    } catch {
      setFetched(prev => ({
        ...prev,
        [item.id]: { pageTitle: item.label, metaDescription: '', body: '', mediaItems: [], fetchedUrl: fullUrl, incomplete: true, source: 'failed' }
      }))
    }
    setFetching(prev => ({ ...prev, [item.id]: false }))
  }, [])

  const selectItem = useCallback((item: NavItem) => {
    setCurrentId(item.id)
    setCurrentItem(item)
    if (!fetched[item.id]) doFetch(item)
  }, [fetched, doFetch])

  // ── AI mapping ─────────────────────────────────────────────────────────────
  const runAI = useCallback(async () => {
    if (!currentItem || !currentFetch) return
    setAnalyzing(true)
    try {
      const r = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: currentItem, fetchedData: currentFetch }),
      })
      const result = await r.json()
      setAnalyses(prev => ({ ...prev, [currentItem.id]: result }))
    } catch {
      const slug = currentItem.url.split('/').pop() || ''
      const thema = currentItem.url.includes('bewegen') ? 'Bewegen' : currentItem.url.includes('voeding') ? 'Voeding' : 'Mentale gezondheid'
      setAnalyses(prev => ({
        ...prev,
        [currentItem.id]: { contentType: currentItem.type, titel: currentFetch.pageTitle || currentItem.label, slug, thema, samenvatting: currentFetch.metaDescription || '', notitie: 'Velden ingevuld o.b.v. metadata.' }
      }))
    }
    setAnalyzing(false)
  }, [currentItem, currentFetch])

  // ── Migrate to Contentful ───────────────────────────────────────────────────
  const migrate = useCallback(async () => {
    if (!currentItem || !currentAnalysis) return
    setMigrating(true)
    try {
      const r = await fetch('/api/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: currentItem, fetchedData: currentFetch, analysis: currentAnalysis }),
      })
      const result = await r.json()
      setMigrateResults(prev => ({ ...prev, [currentItem.id]: result }))
      if (result.success) {
        setDecisions(prev => ({ ...prev, [currentItem.id]: 'migreren' }))
        const idx = allItems.findIndex(i => i.id === currentItem.id)
        if (idx < allItems.length - 1) selectItem(allItems[idx + 1])
      }
    } catch {
      setMigrateResults(prev => ({ ...prev, [currentItem.id]: { success: false, error: 'Netwerk fout' } }))
    }
    setMigrating(false)
  }, [currentItem, currentAnalysis, currentFetch, allItems, selectItem])

  // ── Decisions ──────────────────────────────────────────────────────────────
  const decide = (d: Decision) => {
    if (!currentId || !currentItem) return
    if (d === 'niet-migreren') { setShowSkipModal(true); return }
    setDecisions(prev => ({ ...prev, [currentId]: d }))
    if (d === 'later') {
      const idx = allItems.findIndex(i => i.id === currentId)
      if (idx < allItems.length - 1) selectItem(allItems[idx + 1])
    }
  }

  const confirmSkip = () => {
    if (!currentId || !currentItem) return
    setDecisions(prev => ({ ...prev, [currentId]: 'niet-migreren' }))
    setShowSkipModal(false); setSkipReason('')
    const idx = allItems.findIndex(i => i.id === currentId)
    if (idx < allItems.length - 1) selectItem(allItems[idx + 1])
  }

  const counts = {
    total: allItems.length,
    fetched: Object.keys(fetched).length,
    migreren: Object.values(decisions).filter(d => d === 'migreren').length,
    later: Object.values(decisions).filter(d => d === 'later').length,
    niet: Object.values(decisions).filter(d => d === 'niet-migreren').length,
  }

  const af = (f: string) => currentAnalysis?.[f as keyof Analysis] ? styles.aiFilled : ''
  const at = (f: string) => currentAnalysis?.[f as keyof Analysis] ? <span className={styles.aiTag}>AI</span> : null
  const v = (f: string, fb = '') => (currentAnalysis?.[f as keyof Analysis] as string) || fb

  return (
    <div className={styles.app}>

      {/* TOP BAR */}
      <div className={styles.topbar}>
        <div className={styles.topLeft}>
          <span className={styles.scLogo}>SC</span>
          <span className={styles.topLabel}>VGZ Gezond Leven — migratie werkruimte</span>
        </div>
        <div className={styles.urlBar}>
          <input
            className={styles.urlInput}
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && discover()}
            placeholder="https://www.vgz.nl/gezond-leven/..."
          />
          <button className={styles.urlBtn} onClick={discover} disabled={discovering}>
            {discovering ? 'ophalen...' : '⬇ Sectie laden'}
          </button>
        </div>
        <div className={styles.topStats}>
          <span className={styles.stat}><strong>{counts.fetched}/{counts.total}</strong> opgehaald</span>
          <span className={`${styles.stat} ${styles.statGreen}`}><strong>{counts.migreren}</strong> gemigreerd</span>
          <span className={`${styles.stat} ${styles.statYellow}`}><strong>{counts.later}</strong> later</span>
          <span className={`${styles.stat} ${styles.statRed}`}><strong>{counts.niet}</strong> niet</span>
        </div>
      </div>

      <div className={styles.workspace}>

        {/* LEFT: Sitecore tree */}
        <div className={styles.scPanel}>
          <div className={styles.scPanelHeader}>
            <span className={styles.scSource}>SITECORE</span>
            <span className={styles.scPanelLabel}>Content Editor</span>
          </div>
          <div className={styles.tree}>
            {tree.length === 0 ? (
              <div className={styles.treeEmpty}>Voer een sectie-URL in<br />en klik "Sectie laden"</div>
            ) : (
              <>
                <div className={styles.treeRoot}><span>📁</span><span>sitecore/content/VGZ</span></div>
                {tree.map(folder => {
                  const isOpen = openFolders[folder.key]
                  const done = folder.items.filter(i => decisions[i.id] === 'migreren').length
                  return (
                    <div key={folder.key} className={styles.treeSection}>
                      <div className={`${styles.treeFolder} ${isOpen ? styles.open : ''}`} onClick={() => setOpenFolders(p => ({ ...p, [folder.key]: !p[folder.key] }))}>
                        <span>{isOpen ? '▾' : '▸'}</span><span>📁</span><span>{folder.label}</span>
                        <span className={styles.folderCount}>{done}/{folder.items.length}</span>
                      </div>
                      {isOpen && (
                        <div className={styles.treeChildren}>
                          {folder.items.map(item => {
                            const dec = decisions[item.id]
                            const isFetched = !!fetched[item.id]
                            const isFetching = !!fetching[item.id]
                            return (
                              <div key={item.id}
                                className={`${styles.treeItem} ${currentId === item.id ? styles.active : ''}`}
                                onClick={() => selectItem(item)}
                              >
                                <span className={`${styles.itemDot} ${dec === 'migreren' ? styles.dotGreen : dec === 'niet-migreren' ? styles.dotRed : dec === 'later' ? styles.dotYellow : isFetching ? styles.dotPulse : isFetched ? styles.dotBlue : ''}`} />
                                <span>{typeIcon(item.type)}</span>
                                <span className={styles.itemName}>{item.label}</span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </div>

        {/* MIDDLE: Sitecore view */}
        <div className={styles.midPanel}>
          {!currentItem ? (
            <div className={styles.emptyState}>← Selecteer een item in de tree</div>
          ) : (
            <>
              <div className={styles.panelHeader}>
                <span className={styles.scSource}>SITECORE</span>
                <span className={styles.panelPath}>{scPath(currentItem.url)}</span>
                <button className={styles.fetchBtn} disabled={!!fetching[currentItem.id]} onClick={() => doFetch(currentItem)}>
                  {fetching[currentItem.id] ? 'ophalen...' : fetched[currentItem.id] ? '↻ opnieuw' : '⬇ ophalen'}
                </button>
              </div>
              <div className={styles.panelBody}>
                {!currentFetch ? (
                  <div className={styles.hintBox}>Ophalen gestart...</div>
                ) : (
                  <>
                    <div className={styles.scField}>
                      <div className={styles.scFieldLabel}>Template</div>
                      <div className={styles.scFieldValue}>{currentItem.type === 'Thema' ? 'Page (Standard Values)' : currentItem.type === 'Service' ? 'Service Page' : 'Article Page'}</div>
                    </div>
                    <div className={styles.scField}>
                      <div className={styles.scFieldLabel}>Page Title</div>
                      <div className={styles.scFieldValue}>{currentFetch.pageTitle || '—'}</div>
                    </div>
                    {currentFetch.metaDescription && (
                      <div className={styles.scField}>
                        <div className={styles.scFieldLabel}>Meta Description</div>
                        <div className={styles.scFieldValue}>{currentFetch.metaDescription}</div>
                      </div>
                    )}
                    <div className={styles.scField}>
                      <div className={styles.scFieldLabel}>
                        Page Body
                        {currentFetch.source === 'jina' && <span className={styles.sourceBadge}>Jina Reader</span>}
                        {currentFetch.incomplete && <span className={styles.sourceBadgeWarn}>onvolledig</span>}
                      </div>
                      <div className={`${styles.scFieldValue} ${styles.long}`}>
                        {currentFetch.body || '⚠ Body niet beschikbaar — vereist Sitecore XML export.'}
                      </div>
                    </div>
                    {currentFetch.mediaItems?.length > 0 && (
                      <div className={styles.scField}>
                        <div className={styles.scFieldLabel}>Media ({currentFetch.mediaItems.length} items)</div>
                        <div className={styles.mediaList}>
                          {currentFetch.mediaItems.slice(0, 4).map((m, i) => (
                            <div key={i} className={styles.mediaItem}>📷 {m.split('/').pop()?.split('?')[0]}</div>
                          ))}
                          {currentFetch.mediaItems.length > 4 && <div className={styles.mediaItem} style={{ color: '#6b7280' }}>+{currentFetch.mediaItems.length - 4} meer</div>}
                        </div>
                      </div>
                    )}
                    <div className={styles.scField}>
                      <div className={styles.scFieldLabel}>URL</div>
                      <div className={styles.scFieldValue}>
                        <a href={currentFetch.fetchedUrl} target="_blank" rel="noreferrer" style={{ color: '#4a9eff' }}>{currentFetch.fetchedUrl}</a>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* RIGHT: Contentful form */}
        <div className={styles.cfPanel}>
          {!currentItem ? (
            <div className={styles.emptyState}>Selecteer een item</div>
          ) : (
            <>
              <div className={styles.panelHeader}>
                <span className={styles.cfSource}>CONTENTFUL</span>
                <span className={styles.panelPath}>{currentItem.label}</span>
                <button className={styles.aiBtn} disabled={!currentFetch || analyzing} onClick={runAI}>
                  {analyzing ? '✦ bezig...' : currentAnalysis ? '✦ Opnieuw' : '✦ AI mapping'}
                </button>
              </div>
              <div className={styles.cfBody}>
                <div className={styles.cfField}>
                  <div className={styles.cfLabel}>Content Type <span className={styles.req}>*</span> {at('contentType')}</div>
                  <select className={`${styles.cfSelect} ${af('contentType')}`} key={currentId + 'type'} defaultValue={v('contentType', currentItem.type)}>
                    {TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className={styles.cfField}>
                  <div className={styles.cfLabel}>Title <span className={styles.req}>*</span> {at('titel')}</div>
                  <input className={`${styles.cfInput} ${af('titel')}`} defaultValue={v('titel', currentFetch?.pageTitle || '')} key={currentId + 'titel'} />
                </div>
                <div className={styles.cfField}>
                  <div className={styles.cfLabel}>Slug <span className={styles.req}>*</span> {at('slug')}</div>
                  <input className={`${styles.cfInput} ${af('slug')}`} defaultValue={v('slug', currentItem.url.split('/').pop() || '')} key={currentId + 'slug'} />
                </div>
                <div className={styles.cfField}>
                  <div className={styles.cfLabel}>Thema {at('thema')}</div>
                  <select className={`${styles.cfSelect} ${af('thema')}`} key={currentId + 'thema'} defaultValue={v('thema')}>
                    <option value="">— selecteer —</option>
                    {THEMES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className={styles.cfField}>
                  <div className={styles.cfLabel}>Summary {at('samenvatting')}</div>
                  <textarea className={`${styles.cfInput} ${styles.textarea} ${af('samenvatting')}`} defaultValue={v('samenvatting', currentFetch?.metaDescription || '')} key={currentId + 'summary'} />
                </div>
                {currentAnalysis?.notitie && (
                  <div className={styles.aiNote}>
                    <div className={styles.aiNoteTitle}>✦ AI-notitie voor redacteur</div>
                    {currentAnalysis.notitie}
                  </div>
                )}
                {currentMigrate && (
                  <div className={currentMigrate.success ? styles.migrateSuccess : styles.migrateError}>
                    {currentMigrate.success ? `✓ ${currentMigrate.message}` : `✗ ${currentMigrate.error}`}
                    {currentMigrate.success && currentMigrate.method && (
                      <span className={styles.methodBadge}>{currentMigrate.method}</span>
                    )}
                  </div>
                )}
                {!currentFetch && <div className={styles.hintBox}>Pagina wordt opgehaald...</div>}
              </div>

              <div className={styles.decisionBar}>
                {currentDecision && currentDecision !== 'later' ? (
                  <div className={styles.currentDecision}>
                    {currentDecision === 'migreren' && <span className={styles.decGreen}>✓ Gemigreerd naar Contentful</span>}
                    {currentDecision === 'niet-migreren' && <span className={styles.decRed}>✗ Niet migreren</span>}
                    <button className={styles.resetBtn} onClick={() => setDecisions(p => ({ ...p, [currentId!]: null }))}>↩</button>
                  </div>
                ) : (
                  <div className={styles.decisionBtns}>
                    <button
                      className={`${styles.btn} ${styles.btnMigreren}`}
                      disabled={!currentAnalysis || migrating}
                      onClick={migrate}
                    >
                      {migrating ? '↑ migreren...' : '↑ Naar Contentful'}
                    </button>
                    <button className={`${styles.btn} ${styles.btnLater}`} onClick={() => decide('later')}>⏸ Later</button>
                    <button className={`${styles.btn} ${styles.btnNiet}`} onClick={() => decide('niet-migreren')}>✗ Niet</button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {showSkipModal && (
        <div className={styles.modal}>
          <div className={styles.modalBox}>
            <div className={styles.modalTitle}>Reden voor niet migreren</div>
            <textarea className={`${styles.cfInput} ${styles.textarea}`} placeholder="Bijv: verouderd, duplicate, buiten scope..." value={skipReason} onChange={e => setSkipReason(e.target.value)} />
            <div className={styles.modalBtns}>
              <button className={`${styles.btn} ${styles.btnLater}`} onClick={() => setShowSkipModal(false)}>Annuleren</button>
              <button className={`${styles.btn} ${styles.btnNiet}`} onClick={confirmSkip}>Bevestigen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
