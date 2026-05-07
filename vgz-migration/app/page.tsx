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
  advies: 'behouden' | 'aanpassen' | 'weggooien'
  reden: string
  acties: string[]
}

type Decision = 'approved' | 'edit' | 'rejected' | null

function detectIssues(item: SitecoreItem): string[] {
  const issues: string[] = []
  const body = String(item.fields.Body || '')
  if (/0900-\d{4}/.test(body)) issues.push('hardcoded telefoonnummer')
  if (/style=/.test(body)) issues.push('inline CSS')
  if (body.includes('Bewegen is goed voor je gezondheid. Of u nu wandelt')) issues.push('duplicate boilerplate')
  if (!item.fields.Summary && !item.fields.Intro && !item.fields.MetaDescription) issues.push('samenvatting ontbreekt')
  if (item.template === 'Artikel' && !item.fields.Author) issues.push('auteur ontbreekt')
  if (item.template === 'Artikel' && !item.fields.Summary) issues.push('samenvatting ontbreekt')
  if (item.template === 'Service' && !item.fields.Summary) issues.push('samenvatting ontbreekt')
  const lm = String(item.fields.LastModified || '')
  if (lm && parseInt(lm.substring(0, 4)) <= 2022) issues.push('verouderd (2022 of ouder)')
  if (/<div|<h[2-6]/.test(body)) issues.push('structurele HTML in body')
  return [...new Set(issues)]
}

function TemplateBadge({ template }: { template: string }) {
  const cls = template === 'Thema' ? styles.badgeThema
    : template === 'Artikel' ? styles.badgeArtikel
    : styles.badgeService
  return <span className={`${styles.templateBadge} ${cls}`}>{template.toUpperCase()}</span>
}

function AiBadge({ analysis, analyzing, issues, onAnalyze }: {
  analysis: Analysis | null, analyzing: boolean, issues: string[], onAnalyze: () => void
}) {
  if (analyzing) return <span className={`${styles.aiBadge} ${styles.aiLoading}`}>analyseren...</span>
  if (analysis) {
    const icons = { behouden: '✓', aanpassen: '✎', weggooien: '✗' }
    const cls = analysis.advies === 'behouden' ? styles.aiBehouden
      : analysis.advies === 'aanpassen' ? styles.aiAanpassen
      : styles.aiWeggooien
    return <span className={`${styles.aiBadge} ${cls}`}>{icons[analysis.advies]} {analysis.advies}</span>
  }
  if (issues.length > 0) {
    return (
      <span
        className={`${styles.aiBadge} ${styles.aiLoading}`}
        style={{ cursor: 'pointer' }}
        onClick={e => { e.stopPropagation(); onAnalyze() }}
      >
        ⚡ analyseer
      </span>
    )
  }
  return null
}

function Card({
  item, analysis, analyzing, decision, expanded,
  onToggle, onAnalyze, onDecide
}: {
  item: SitecoreItem
  analysis: Analysis | null
  analyzing: boolean
  decision: Decision
  expanded: boolean
  onToggle: () => void
  onAnalyze: () => void
  onDecide: (d: Decision) => void
}) {
  const issues = detectIssues(item)
  const name = String(item.fields.Title || item.fields.Name || '')
  const body = String(item.fields.Body || '')

  return (
    <div className={`${styles.card} ${expanded ? styles.expanded : ''}`}>
      <div className={styles.cardHeader} onClick={onToggle}>
        <TemplateBadge template={item.template} />
        <span className={styles.cardTitle}>{name}</span>
        {issues.length > 0 && (
          <span style={{ fontSize: 11, color: '#f87171', flexShrink: 0 }}>{issues.length} ⚠</span>
        )}
        <AiBadge analysis={analysis} analyzing={analyzing} issues={issues} onAnalyze={onAnalyze} />
        {decision === 'approved' && <span className={`${styles.decBadge} ${styles.decApproved}`}>✓ behouden</span>}
        {decision === 'rejected' && <span className={`${styles.decBadge} ${styles.decRejected}`}>✗ weggegooid</span>}
        {decision === 'edit' && <span className={`${styles.decBadge} ${styles.decEdit}`}>✎ bewerken</span>}
        <span style={{ color: '#6b7280', fontSize: 13, flexShrink: 0 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className={styles.cardBody}>
          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>URL</span>
            <span className={styles.fieldValue}>{String(item.fields.Url || '-')}</span>
          </div>
          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>Gewijzigd</span>
            <span className={styles.fieldValue}>{String(item.fields.LastModified || '-')}</span>
          </div>
          {(item.fields.Summary || item.fields.MetaDescription) && (
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Samenvatting</span>
              <span className={styles.fieldValue} style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#c9cdd6' }}>
                {String(item.fields.Summary || item.fields.MetaDescription)}
              </span>
            </div>
          )}
          <div>
            <div className={styles.fieldLabel} style={{ fontSize: 11, marginBottom: 5 }}>Body (raw Sitecore)</div>
            <div className={styles.bodyPreview}>{body.substring(0, 500)}</div>
          </div>
          {issues.length > 0 && (
            <div>
              <div className={styles.fieldLabel} style={{ fontSize: 11, marginBottom: 5 }}>Gedetecteerde problemen</div>
              <div className={styles.issues}>
                {issues.map(i => <span key={i} className={styles.issueChip}>{i}</span>)}
              </div>
            </div>
          )}
          {analysis && (
            <div className={styles.aiSection}>
              <div className={styles.aiSectionHeader}>✦ AI-analyse</div>
              <div style={{ fontSize: 12, color: '#c9cdd6', marginBottom: 8 }}>{analysis.reden}</div>
              <div className={styles.aiBullets}>
                {analysis.acties.map((a, i) => (
                  <div key={i} className={styles.aiBullet}>{a}</div>
                ))}
              </div>
            </div>
          )}
          <div className={styles.actions}>
            {!analysis && !analyzing && (
              <button className={`${styles.btn} ${styles.btnAnalyze}`} onClick={e => { e.stopPropagation(); onAnalyze() }}>
                ✦ AI analyseren
              </button>
            )}
            {decision !== 'approved' && (
              <button className={`${styles.btn} ${styles.btnApprove}`} onClick={e => { e.stopPropagation(); onDecide('approved') }}>
                ✓ Behouden
              </button>
            )}
            {decision !== 'edit' && (
              <button className={`${styles.btn} ${styles.btnEdit}`} onClick={e => { e.stopPropagation(); onDecide('edit') }}>
                ✎ Bewerken
              </button>
            )}
            {decision !== 'rejected' && (
              <button className={`${styles.btn} ${styles.btnReject}`} onClick={e => { e.stopPropagation(); onDecide('rejected') }}>
                ✗ Weggooien
              </button>
            )}
            {decision && (
              <button
                className={styles.btn}
                style={{ background: '#161b27', borderColor: '#2d3748', color: '#6b7280' }}
                onClick={e => { e.stopPropagation(); onDecide(null) }}
              >
                ↩ Reset
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Page() {
  const [items, setItems] = useState<SitecoreItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [analyses, setAnalyses] = useState<Record<string, Analysis>>({})
  const [analyzing, setAnalyzing] = useState<Record<string, boolean>>({})
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  useEffect(() => {
    fetch(DB)
      .then(r => r.json())
      .then(data => {
        const all: SitecoreItem[] = []
        ;['themas', 'artikelen', 'services'].forEach(type => {
          Object.values(data[type] || {}).forEach((item) => all.push(item as SitecoreItem))
        })
        setItems(all)
        setLoading(false)
        setTimeout(() => {
          all.forEach((item, i) => {
            setTimeout(() => analyzeItem(item, all), i * 700)
          })
        }, 1000)
      })
  }, [])

  const analyzeItem = useCallback(async (item: SitecoreItem, allItems?: SitecoreItem[]) => {
    const list = allItems || items
    const found = list.find(i => i.id === item.id)
    if (!found) return
    setAnalyzing(prev => ({ ...prev, [item.id]: true }))
    const issues = detectIssues(item)
    try {
      const r = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item, issues }),
      })
      const data = await r.json()
      setAnalyses(prev => ({ ...prev, [item.id]: data }))
    } catch {
      setAnalyses(prev => ({
        ...prev,
        [item.id]: {
          advies: issues.length > 2 ? 'aanpassen' : 'behouden',
          reden: issues.length ? `${issues.length} problemen gevonden.` : 'Content ziet er goed uit.',
          acties: issues.slice(0, 2).map(i => `Fix: ${i}`),
        },
      }))
    }
    setAnalyzing(prev => ({ ...prev, [item.id]: false }))
  }, [items])

  const filtered = items.filter(item => {
    if (filter === 'all') return true
    if (filter === 'pending') return !decisions[item.id]
    return item.template.toLowerCase() === filter
  })

  const approved = Object.values(decisions).filter(d => d === 'approved').length
  const rejected = Object.values(decisions).filter(d => d === 'rejected').length
  const pending = items.length - approved - rejected
  const analyzed = Object.keys(analyses).length

  if (loading) {
    return (
      <div className={styles.app}>
        <div className={styles.topbar}>
          <div className={styles.logo}>VGZ Migration <span>/ review interface</span></div>
        </div>
        <div className={styles.loadingState}>Firebase data ophalen...</div>
      </div>
    )
  }

  return (
    <div className={styles.app}>
      <div className={styles.topbar}>
        <div className={styles.logo}>VGZ Migration <span>/ review interface</span></div>
        <div className={styles.stats}>
          <span className={styles.stat}><strong>{pending}</strong> te reviewen</span>
          <span className={styles.stat}><strong>{approved}</strong> behouden</span>
          <span className={styles.stat}><strong>{rejected}</strong> weggegooid</span>
          <span className={styles.stat}><strong>{analyzed}/{items.length}</strong> geanalyseerd</span>
        </div>
      </div>

      <div className={styles.filters}>
        {[
          ['all', 'Alles', items.length],
          ['thema', "Thema's", items.filter(i => i.template === 'Thema').length],
          ['artikel', 'Artikelen', items.filter(i => i.template === 'Artikel').length],
          ['service', 'Services', items.filter(i => i.template === 'Service').length],
          ['pending', 'Te doen', items.filter(i => !decisions[i.id]).length],
        ].map(([key, label, count]) => (
          <button
            key={key as string}
            className={`${styles.filterBtn} ${filter === key ? styles.active : ''}`}
            onClick={() => setFilter(key as string)}
          >
            {label} <span style={{ opacity: .5 }}>{count}</span>
          </button>
        ))}
      </div>

      <div className={styles.list}>
        {filtered.length === 0 ? (
          <div className={styles.empty}>Geen items in deze categorie</div>
        ) : (
          filtered.map(item => (
            <Card
              key={item.id}
              item={item}
              analysis={analyses[item.id] || null}
              analyzing={!!analyzing[item.id]}
              decision={decisions[item.id] || null}
              expanded={!!expanded[item.id]}
              onToggle={() => setExpanded(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
              onAnalyze={() => analyzeItem(item)}
              onDecide={d => setDecisions(prev => ({ ...prev, [item.id]: d }))}
            />
          ))
        )}
      </div>
    </div>
  )
}
