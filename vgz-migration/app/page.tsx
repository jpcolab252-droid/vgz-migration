'use client'

import { useEffect, useState, useCallback } from 'react'
import styles from './page.module.css'

const DB = 'https://vgz-migration-default-rtdb.europe-west1.firebasedatabase.app/sitecore_export.json'

type SitecoreItem = {
  id: string
  template: string
  fields: Record<string, string | boolean | null | undefined>
}

type Analysis = {
  contentType: string
  titel: string
  slug: string
  thema: string
  samenvatting: string
  notitie: string
}

type Status = 'pending' | 'ai' | 'done'

const THEMES = ['Bewegen', 'Voeding', 'Mentale gezondheid']
const TYPES = ['Artikel', 'Service', 'Thema']

function scPath(item: SitecoreItem): string {
  const url = String(item.fields.Url || '')
  const parts = url.split('/').filter(Boolean)
  return '/sitecore/content/VGZ/' + parts
    .map(p => p.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '))
    .join('/')
}

function detectIssues(item: SitecoreItem): string[] {
  const issues: string[] = []
  const body = String(item.fields.Body || '')
  if (/0900-\d{4}/.test(body)) issues.push('Hardcoded telefoonnummer in Page Body')
  if (/style=/.test(body)) issues.push('Inline CSS in Page Body')
  if (body.includes('Bewegen is goed voor je gezondheid. Of u nu wandelt')) issues.push('Duplicate boilerplate tekst')
  if (!item.fields.Summary && !item.fields.MetaDescription) issues.push('Meta Description ontbreekt')
  if (item.template === 'Artikel' && !item.fields.Author) issues.push('Author veld leeg')
  const lm = String(item.fields.LastModified || '')
  if (lm && parseInt(lm.substring(0, 4)) <= 2022) issues.push('Niet bijgewerkt sinds 2022')
  return [...new Set(issues)]
}

function groupItems(items: SitecoreItem[]) {
  const g: Record<string, SitecoreItem[]> = { bewegen: [], voeding: [], 'mentale-gezondheid': [] }
  items.forEach(item => {
    const url = String(item.fields.Url || '')
    if (url.includes('/bewegen')) g.bewegen.push(item)
    else if (url.includes('/voeding')) g.voeding.push(item)
    else if (url.includes('/mentale')) g['mentale-gezondheid'].push(item)
  })
  return g
}

export default function Page() {
  const [items, setItems] = useState<SitecoreItem[]>([])
  const [statuses, setStatuses] = useState<Record<string, Status>>({})
  const [aiData, setAiData] = useState<Record<string, Analysis>>({})
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({ bewegen: true, voeding: false, 'mentale-gezondheid': false })
  const [thinking, setThinking] = useState(false)

  useEffect(() => {
    fetch(DB)
      .then(r => r.json())
      .then(data => {
        const all: SitecoreItem[] = []
        ;['themas', 'artikelen', 'services'].forEach(type => {
          Object.values(data[type] || {}).forEach(item => all.push(item as SitecoreItem))
        })
        setItems(all)
      })
  }, [])

  const current = items.find(i => i.id === currentId)
  const grouped = groupItems(items)

  const runAI = useCallback(async () => {
    if (!current) return
    setThinking(true)
    const issues = detectIssues(current)
    try {
      const r = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: current, issues }),
      })
      const data = await r.json()
      setAiData(prev => ({ ...prev, [current.id]: data }))
    } catch {
      const url = String(current.fields.Url || '')
      setAiData(prev => ({
        ...prev,
        [current.id]: {
          contentType: current.template,
          titel: String(current.fields.Title || current.fields.Name || ''),
          slug: url.split('/').pop() || '',
          thema: url.includes('bewegen') ? 'Bewegen' : url.includes('voeding') ? 'Voeding' : 'Mentale gezondheid',
          samenvatting: String(current.fields.Summary || '').substring(0, 160),
          notitie: issues.length ? `Let op: ${issues[0]}.` : 'Content is klaar voor migratie.',
        },
      }))
    }
    setStatuses(prev => ({ ...prev, [current.id]: 'ai' }))
    setThinking(false)
  }, [current])

  const submitItem = () => {
    if (!currentId) return
    setStatuses(prev => ({ ...prev, [currentId]: 'done' }))
    const idx = items.findIndex(i => i.id === currentId)
    if (idx < items.length - 1) setCurrentId(items[idx + 1].id)
  }

  const skipItem = () => {
    const idx = items.findIndex(i => i.id === currentId)
    if (idx < items.length - 1) setCurrentId(items[idx + 1].id)
  }

  const ai = currentId ? aiData[currentId] : null
  const af = (field: string) => ai?.[field as keyof Analysis] ? styles.aiFilled : ''
  const at = (field: string) => ai?.[field as keyof Analysis] ? <span className={styles.aiTag}>AI</span> : null
  const v = (field: string, fallback = '') => ai?.[field as keyof Analysis] || fallback

  const folders = [
    { key: 'bewegen', label: 'Bewegen' },
    { key: 'voeding', label: 'Voeding' },
    { key: 'mentale-gezondheid', label: 'Mentale gezondheid' },
  ]

  const tmplMap: Record<string, string> = {
    Thema: 'Page (Standard Values)',
    Artikel: 'Article Page',
    Service: 'Service Page',
  }

  const typeIcon = (t: string) => t === 'Thema' ? '📋' : t === 'Service' ? '🔧' : '📄'

  return (
    <div className={styles.app}>

      {/* LEFT: Sitecore tree */}
      <div className={styles.scPanel}>
        <div className={styles.scHeader}>
          <span className={styles.scLogo}>SC</span>
          <span className={styles.scHeaderLabel}>Content Editor</span>
        </div>
        <div className={styles.tree}>
          <div className={`${styles.treeFolder} ${styles.treeRoot}`}>
            <span>📁</span>
            <span>sitecore/content/VGZ</span>
          </div>
          {folders.map(({ key, label }) => {
            const folderItems = grouped[key] || []
            const done = folderItems.filter(i => statuses[i.id] === 'done').length
            const isOpen = openFolders[key]
            return (
              <div key={key} className={styles.treeSection}>
                <div
                  className={`${styles.treeFolder} ${isOpen ? styles.open : ''}`}
                  onClick={() => setOpenFolders(prev => ({ ...prev, [key]: !prev[key] }))}
                >
                  <span>{isOpen ? '▾' : '▸'}</span>
                  <span>📁</span>
                  <span>{label}</span>
                  <span className={styles.folderCount}>{done}/{folderItems.length}</span>
                </div>
                {isOpen && (
                  <div className={styles.treeChildren}>
                    {folderItems.map(item => {
                      const st = statuses[item.id] || 'pending'
                      const name = String(item.fields.Title || item.fields.Name || '')
                      return (
                        <div
                          key={item.id}
                          className={`${styles.treeItem} ${currentId === item.id ? styles.active : ''} ${st === 'done' ? styles.done : st === 'ai' ? styles.aiDone : ''}`}
                          onClick={() => setCurrentId(item.id)}
                        >
                          <span className={`${styles.itemDot} ${st === 'done' ? styles.dotDone : st === 'ai' ? styles.dotAi : ''}`} />
                          <span>{typeIcon(item.template)}</span>
                          <span className={styles.itemName}>{name}</span>
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

      {/* MIDDLE: Sitecore item */}
      <div className={styles.midPanel}>
        {!current ? (
          <div className={styles.emptyState}>← Selecteer een item<br />in de Sitecore tree</div>
        ) : (
          <>
            <div className={styles.panelHeader}>
              <span className={`${styles.panelSource} ${styles.scSource}`}>SITECORE</span>
              <span className={styles.panelPath} title={scPath(current)}>{scPath(current)}</span>
            </div>
            <div className={styles.panelBody}>
              <div className={styles.scField}>
                <div className={styles.scFieldLabel}>Template</div>
                <div className={styles.scFieldValue}>{tmplMap[current.template] || current.template}</div>
              </div>
              <div className={styles.scField}>
                <div className={styles.scFieldLabel}>Page Title</div>
                <div className={styles.scFieldValue}>{String(current.fields.Title || current.fields.Name || '—')}</div>
              </div>
              {(current.fields.Summary || current.fields.MetaDescription) && (
                <div className={styles.scField}>
                  <div className={styles.scFieldLabel}>Meta Description</div>
                  <div className={styles.scFieldValue}>{String(current.fields.Summary || current.fields.MetaDescription)}</div>
                </div>
              )}
              <div className={styles.scField}>
                <div className={styles.scFieldLabel}>Page Body</div>
                <div className={`${styles.scFieldValue} ${styles.long}`}>
                  {String(current.fields.Body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 500)}
                </div>
              </div>
              <div className={styles.scField}>
                <div className={styles.scFieldLabel}>Updated</div>
                <div className={styles.scFieldValue}>{String(current.fields.LastModified || '—')}</div>
              </div>
              {current.fields.Author && (
                <div className={styles.scField}>
                  <div className={styles.scFieldLabel}>Author</div>
                  <div className={styles.scFieldValue}>{String(current.fields.Author)}</div>
                </div>
              )}
              {detectIssues(current).length > 0 ? (
                <div className={styles.issuesBox}>
                  <div className={styles.issuesTitle}>⚠ Migration issues detected</div>
                  {detectIssues(current).map(i => (
                    <div key={i} className={styles.issueLine}>{i}</div>
                  ))}
                </div>
              ) : (
                <div className={styles.noIssues}>✓ No migration issues detected</div>
              )}
            </div>
          </>
        )}
      </div>

      {/* BRIDGE */}
      <div className={styles.bridge}>
        <div className={styles.bridgeArrow}>→</div>
        <button
          className={styles.aiBridgeBtn}
          disabled={!current || thinking}
          onClick={runAI}
        >
          {thinking ? '...' : '✦ AI'}
        </button>
        <div className={styles.bridgeArrow}>→</div>
      </div>

      {/* RIGHT: Contentful form */}
      <div className={styles.cfPanel}>
        <div className={styles.panelHeader}>
          <span className={`${styles.panelSource} ${styles.cfSource}`}>CONTENTFUL</span>
          <span className={styles.panelPath}>{current ? String(current.fields.Title || current.fields.Name || '—') : '—'}</span>
        </div>
        {!current ? (
          <div className={styles.emptyState}>AI vult dit formulier in<br />op basis van de Sitecore-content</div>
        ) : thinking ? (
          <div className={styles.emptyState}>
            <span className={styles.thinking}>✦ AI analyseert Sitecore-content<br />en stelt veldmapping voor...</span>
          </div>
        ) : (
          <>
            <div className={styles.cfBody}>
              <div className={styles.cfField}>
                <div className={styles.cfLabel}>Content Type <span className={styles.req}>*</span> {at('contentType')}</div>
                <select className={`${styles.cfSelect} ${af('contentType')}`}>
                  {TYPES.map(t => <option key={t} selected={t === v('contentType', current.template)}>{t}</option>)}
                </select>
              </div>
              <div className={styles.cfField}>
                <div className={styles.cfLabel}>Title <span className={styles.req}>*</span> {at('titel')}</div>
                <input className={`${styles.cfInput} ${af('titel')}`} defaultValue={v('titel', String(current.fields.Title || current.fields.Name || ''))} />
              </div>
              <div className={styles.cfField}>
                <div className={styles.cfLabel}>Slug <span className={styles.req}>*</span> {at('slug')}</div>
                <input className={`${styles.cfInput} ${af('slug')}`} defaultValue={v('slug', String(current.fields.Url || '').split('/').pop() || '')} />
              </div>
              <div className={styles.cfField}>
                <div className={styles.cfLabel}>Thema {at('thema')}</div>
                <select className={`${styles.cfSelect} ${af('thema')}`}>
                  <option value="">— selecteer —</option>
                  {THEMES.map(t => <option key={t} selected={t === v('thema')}>{t}</option>)}
                </select>
              </div>
              <div className={styles.cfField}>
                <div className={styles.cfLabel}>Summary {at('samenvatting')}</div>
                <textarea className={`${styles.cfInput} ${styles.textarea} ${af('samenvatting')}`} defaultValue={v('samenvatting', String(current.fields.Summary || ''))} />
              </div>
              {ai?.notitie && (
                <div className={styles.aiNote}>
                  <div className={styles.aiNoteTitle}>✦ AI-notitie voor redacteur</div>
                  {ai.notitie}
                </div>
              )}
              {!ai && (
                <div className={styles.emptyState} style={{ padding: '16px 0', fontSize: 11 }}>
                  Klik ✦ AI om veldmapping voor te stellen
                </div>
              )}
            </div>
            <div className={styles.cfFooter}>
              <button className={`${styles.btn} ${styles.btnSkip}`} onClick={skipItem}>Overslaan</button>
              <button className={`${styles.btn} ${styles.btnSubmit}`} onClick={submitItem}>→ Doorzetten naar Contentful</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
