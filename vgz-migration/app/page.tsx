'use client'

import { useEffect, useState, useCallback } from 'react'
import styles from './page.module.css'

const NAV_TREE = [
  {
    label: 'Bewegen', key: 'bewegen',
    items: [
      { id: 'bewegen-root', label: 'Bewegen (overzicht)', url: '/gezond-leven/bewegen', type: 'Thema' },
      { id: 'beweegrichtlijnen', label: 'Beweegrichtlijnen', url: '/gezond-leven/bewegen/beweegrichtlijnen', type: 'Artikel' },
      { id: 'bewegen-werk', label: 'Bewegen tijdens je werk', url: '/gezond-leven/bewegen/blijf-in-beweging-tijdens-je-werk', type: 'Artikel' },
      { id: 'vitaal-ouder', label: 'Vitaal ouder worden', url: '/gezond-leven/bewegen/vitaal-ouder-worden', type: 'Artikel' },
      { id: 'beweeg-olga', label: 'Beweeg met Olga', url: '/gezond-leven/bewegen/beweeg-met-olga', type: 'Service' },
      { id: 'soepel-sterk', label: 'Soepel en Sterk Coach', url: '/gezond-leven/bewegen/gratis-beweeg-app-soepel-en-sterk-coach', type: 'Service' },
    ]
  },
  {
    label: 'Voeding', key: 'voeding',
    items: [
      { id: 'voeding-root', label: 'Voeding (overzicht)', url: '/gezond-leven/voeding', type: 'Thema' },
      { id: 'goedkoop-eten', label: 'Gezond en goedkoop eten', url: '/gezond-leven/voeding/gezond-en-goedkoop-eten', type: 'Artikel' },
      { id: 'eiwitten-ouderen', label: 'Eiwitrijke voeding voor ouderen', url: '/gezond-leven/voeding/voeding-voor-ouderen/eiwitrijke-voeding-is-belangrijk-voor-ouderen', type: 'Artikel' },
      { id: 'voeding-diensten', label: 'Voeding bij wisselende diensten', url: '/gezond-leven/voeding/voeding-bij-wisselende-diensten', type: 'Artikel' },
    ]
  },
  {
    label: 'Mentale gezondheid', key: 'mentaal',
    items: [
      { id: 'mentaal-root', label: 'Mentale gezondheid (overzicht)', url: '/gezond-leven/mentale-gezondheid', type: 'Thema' },
      { id: 'mindfulness', label: 'Mindfulness', url: '/gezond-leven/mentale-gezondheid/mindfulness', type: 'Artikel' },
      { id: 'ontspannen', label: 'Ontspannen', url: '/gezond-leven/mentale-gezondheid/ontspanning', type: 'Artikel' },
      { id: 'mindfulness-coach', label: 'VGZ Mindfulness Coach', url: '/gezond-leven/mentale-gezondheid/mindfulness/mindfulness-coach', type: 'Service' },
      { id: 'mentaal-fit', label: 'Mentaal fit gesprek', url: '/gezond-leven/mentale-gezondheid/mentaal-fit-gesprek', type: 'Service' },
      { id: 'therapieland', label: 'Online zelfhulp Therapieland', url: '/gezond-leven/mentale-gezondheid/therapieland', type: 'Service' },
    ]
  },
]

const ALL_ITEMS = NAV_TREE.flatMap(f => f.items)
const THEMES = ['Bewegen', 'Voeding', 'Mentale gezondheid']
const TYPES = ['Artikel', 'Service', 'Thema']

type NavItem = { id: string; label: string; url: string; type: string }
type FetchedData = { pageTitle: string; metaDescription: string; ogTitle: string; fetchedUrl: string; incomplete: boolean }
type Analysis = { contentType: string; titel: string; slug: string; thema: string; samenvatting: string; notitie: string }
type Decision = 'migreren' | 'later' | 'niet-migreren' | null

export default function Page() {
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({ bewegen: true, voeding: false, mentaal: false })
  const [fetched, setFetched] = useState<Record<string, FetchedData>>({})
  const [fetching, setFetching] = useState<Record<string, boolean>>({})
  const [analyses, setAnalyses] = useState<Record<string, Analysis>>({})
  const [analyzing, setAnalyzing] = useState(false)
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [showSkipModal, setShowSkipModal] = useState(false)
  const [skipReason, setSkipReason] = useState('')

  const current = ALL_ITEMS.find(i => i.id === currentId) ?? null
  const currentFetch = currentId ? fetched[currentId] ?? null : null
  const currentAnalysis = currentId ? analyses[currentId] ?? null : null
  const currentDecision = currentId ? decisions[currentId] ?? null : null

  const fetchItem = useCallback(async (item: NavItem) => {
    setFetching(prev => ({ ...prev, [item.id]: true }))
    try {
      const r = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://www.vgz.nl' + item.url }),
      })
      const data = await r.json()
      setFetched(prev => ({ ...prev, [item.id]: data }))
    } catch {
      setFetched(prev => ({
        ...prev,
        [item.id]: { pageTitle: item.label, metaDescription: '', ogTitle: '', fetchedUrl: 'https://www.vgz.nl' + item.url, incomplete: true }
      }))
    }
    setFetching(prev => ({ ...prev, [item.id]: false }))
  }, [])

  const runAI = useCallback(async () => {
    if (!current) return
    setAnalyzing(true)
    const data = fetched[current.id]
    try {
      const r = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: current, fetchedData: data }),
      })
      const result = await r.json()
      setAnalyses(prev => ({ ...prev, [current.id]: result }))
    } catch {
      const slug = current.url.split('/').pop() || ''
      const thema = current.url.includes('bewegen') ? 'Bewegen' : current.url.includes('voeding') ? 'Voeding' : 'Mentale gezondheid'
      setAnalyses(prev => ({
        ...prev,
        [current.id]: {
          contentType: current.type,
          titel: data?.pageTitle || current.label,
          slug,
          thema,
          samenvatting: data?.metaDescription || '',
          notitie: data?.incomplete ? 'Body content niet beschikbaar — vereist Sitecore-export.' : '',
        }
      }))
    }
    setAnalyzing(false)
  }, [current, fetched])

  const decide = (d: Decision) => {
    if (!currentId) return
    if (d === 'niet-migreren') { setShowSkipModal(true); return }
    setDecisions(prev => ({ ...prev, [currentId]: d }))
    if (d === 'migreren') {
      const idx = ALL_ITEMS.findIndex(i => i.id === currentId)
      if (idx < ALL_ITEMS.length - 1) setCurrentId(ALL_ITEMS[idx + 1].id)
    }
  }

  const confirmSkip = () => {
    if (!currentId) return
    setDecisions(prev => ({ ...prev, [currentId]: 'niet-migreren' }))
    setShowSkipModal(false)
    setSkipReason('')
    const idx = ALL_ITEMS.findIndex(i => i.id === currentId)
    if (idx < ALL_ITEMS.length - 1) setCurrentId(ALL_ITEMS[idx + 1].id)
  }

  const counts = {
    total: ALL_ITEMS.length,
    migreren: Object.values(decisions).filter(d => d === 'migreren').length,
    later: Object.values(decisions).filter(d => d === 'later').length,
    niet: Object.values(decisions).filter(d => d === 'niet-migreren').length,
    fetched: Object.keys(fetched).length,
  }

  const typeIcon = (t: string) => t === 'Thema' ? '📋' : t === 'Service' ? '🔧' : '📄'
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
        <div className={styles.topStats}>
          <span className={styles.stat}><strong>{counts.total}</strong> items</span>
          <span className={styles.stat}><strong>{counts.fetched}</strong> opgehaald</span>
          <span className={`${styles.stat} ${styles.statGreen}`}><strong>{counts.migreren}</strong> migreren</span>
          <span className={`${styles.stat} ${styles.statYellow}`}><strong>{counts.later}</strong> later</span>
          <span className={`${styles.stat} ${styles.statRed}`}><strong>{counts.niet}</strong> niet migreren</span>
        </div>
      </div>

      <div className={styles.workspace}>
        {/* LEFT: tree */}
        <div className={styles.scPanel}>
          <div className={styles.scPanelHeader}>
            <span className={styles.scSource}>SITECORE</span>
            <span className={styles.scPanelLabel}>Content Editor</span>
          </div>
          <div className={styles.tree}>
            <div className={styles.treeRoot}><span>📁</span><span>sitecore/content/VGZ/Gezond Leven</span></div>
            {NAV_TREE.map(folder => {
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
                        return (
                          <div key={item.id}
                            className={`${styles.treeItem} ${currentId === item.id ? styles.active : ''}`}
                            onClick={() => setCurrentId(item.id)}
                          >
                            <span className={`${styles.itemDot} ${dec === 'migreren' ? styles.dotGreen : dec === 'niet-migreren' ? styles.dotRed : dec === 'later' ? styles.dotYellow : isFetched ? styles.dotBlue : ''}`} />
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
          </div>
        </div>

        {/* MIDDLE: Sitecore view */}
        <div className={styles.midPanel}>
          {!current ? (
            <div className={styles.emptyState}>← Selecteer een item in de tree</div>
          ) : (
            <>
              <div className={styles.panelHeader}>
                <span className={styles.scSource}>SITECORE</span>
                <span className={styles.panelPath}>{'/sitecore/content/VGZ' + current.url.replace('/gezond-leven', '/Gezond Leven')}</span>
                <button className={styles.fetchBtn} disabled={!!fetching[current.id]} onClick={() => fetchItem(current)}>
                  {fetching[current.id] ? 'ophalen...' : fetched[current.id] ? '↻ opnieuw' : '⬇ ophalen'}
                </button>
              </div>
              <div className={styles.panelBody}>
                {!currentFetch ? (
                  <div className={styles.hintBox}>Klik "⬇ ophalen" om metadata van deze pagina op te halen via HTTP</div>
                ) : (
                  <>
                    <div className={styles.scField}>
                      <div className={styles.scFieldLabel}>Template</div>
                      <div className={styles.scFieldValue}>{current.type === 'Thema' ? 'Page (Standard Values)' : current.type === 'Service' ? 'Service Page' : 'Article Page'}</div>
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
                    {currentFetch.ogTitle && (
                      <div className={styles.scField}>
                        <div className={styles.scFieldLabel}>OG Title</div>
                        <div className={styles.scFieldValue}>{currentFetch.ogTitle}</div>
                      </div>
                    )}
                    <div className={styles.scField}>
                      <div className={styles.scFieldLabel}>URL</div>
                      <div className={styles.scFieldValue}>
                        <a href={currentFetch.fetchedUrl} target="_blank" rel="noreferrer" style={{ color: '#4a9eff' }}>{currentFetch.fetchedUrl}</a>
                      </div>
                    </div>
                    <div className={styles.scField}>
                      <div className={styles.scFieldLabel}>Page Body</div>
                      <div className={`${styles.scFieldValue} ${styles.long}`}>
                        {currentFetch.incomplete
                          ? '⚠ Body content niet beschikbaar via HTTP fetch — vereist Sitecore XML export of directe API toegang.'
                          : '(geen body content geëxtraheerd)'}
                      </div>
                    </div>
                    {currentFetch.incomplete && (
                      <div className={styles.issuesBox}>
                        <div className={styles.issuesTitle}>⚠ Migration issues</div>
                        <div className={styles.issueLine}>Body content niet extraheerbaar — JS-rendered pagina</div>
                        <div className={styles.issueLine}>Media assets onbekend — vereist Sitecore media library export</div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* RIGHT: Contentful form */}
        <div className={styles.cfPanel}>
          {!current ? (
            <div className={styles.emptyState}>Selecteer een item</div>
          ) : (
            <>
              <div className={styles.panelHeader}>
                <span className={styles.cfSource}>CONTENTFUL</span>
                <span className={styles.panelPath}>{current.label}</span>
                <button className={styles.aiBtn} disabled={!currentFetch || analyzing} onClick={runAI}>
                  {analyzing ? '✦ bezig...' : '✦ AI mapping'}
                </button>
              </div>
              <div className={styles.cfBody}>
                <div className={styles.cfField}>
                  <div className={styles.cfLabel}>Content Type <span className={styles.req}>*</span> {at('contentType')}</div>
                  <select className={`${styles.cfSelect} ${af('contentType')}`} key={currentId + 'type'} defaultValue={v('contentType', current.type)}>
                    {TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className={styles.cfField}>
                  <div className={styles.cfLabel}>Title <span className={styles.req}>*</span> {at('titel')}</div>
                  <input className={`${styles.cfInput} ${af('titel')}`} defaultValue={v('titel', currentFetch?.pageTitle || '')} key={currentId + 'titel'} />
                </div>
                <div className={styles.cfField}>
                  <div className={styles.cfLabel}>Slug <span className={styles.req}>*</span> {at('slug')}</div>
                  <input className={`${styles.cfInput} ${af('slug')}`} defaultValue={v('slug', current.url.split('/').pop() || '')} key={currentId + 'slug'} />
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
                {!currentFetch && (
                  <div className={styles.hintBox}>Haal eerst de pagina op via "⬇ ophalen" voordat je AI mapping uitvoert</div>
                )}
              </div>

              <div className={styles.decisionBar}>
                {currentDecision ? (
                  <div className={styles.currentDecision}>
                    {currentDecision === 'migreren' && <span className={styles.decGreen}>✓ Migreren</span>}
                    {currentDecision === 'later' && <span className={styles.decYellow}>⏸ Later</span>}
                    {currentDecision === 'niet-migreren' && <span className={styles.decRed}>✗ Niet migreren</span>}
                    <button className={styles.resetBtn} onClick={() => setDecisions(p => ({ ...p, [currentId!]: null }))}>↩ reset</button>
                  </div>
                ) : (
                  <div className={styles.decisionBtns}>
                    <button className={`${styles.btn} ${styles.btnMigreren}`} onClick={() => decide('migreren')}>✓ Migreren</button>
                    <button className={`${styles.btn} ${styles.btnLater}`} onClick={() => decide('later')}>⏸ Later</button>
                    <button className={`${styles.btn} ${styles.btnNiet}`} onClick={() => decide('niet-migreren')}>✗ Niet migreren</button>
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
