import { NextRequest, NextResponse } from 'next/server'

function extractContent(markdown: string): { pageTitle: string; metaDescription: string; body: string; mediaItems: string[] } {
  const lines = markdown.split('\n')

  // Extract title — first real # heading after nav
  let pageTitle = ''
  let contentStart = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.startsWith('# ') && !line.includes('VGZ') && !pageTitle) {
      pageTitle = line.replace(/^#\s+/, '').replace(' - VGZ', '').trim()
      contentStart = i
      break
    }
  }
  if (!pageTitle) {
    const titleMatch = markdown.match(/^#\s+(.+)$/m)
    pageTitle = titleMatch?.[1]?.replace(' - VGZ', '').trim() || ''
  }

  // Skip navigation noise — find where real content starts
  // Real content starts after breadcrumbs (numbered list like "1. Home 2. ...")
  let bodyStart = contentStart
  for (let i = contentStart; i < Math.min(contentStart + 30, lines.length); i++) {
    if (lines[i].match(/^\d+\.\s+\[/)) {
      bodyStart = i + 2
      break
    }
  }

  // Extract body — stop at footer signals
  const footerSignals = ['Footer', '### Direct regelen', '### Service & contact', 'Cookieverklaring', 'KvK-nummer', 'Wij maken gebruik van cookies']
  const bodyLines: string[] = []
  const mediaItems: string[] = []

  for (let i = bodyStart; i < lines.length; i++) {
    const line = lines[i]

    // Stop at footer
    if (footerSignals.some(s => line.includes(s))) break

    // Extract media paths
    const imgMatch = line.match(/!\[.*?\]\((https:\/\/cdn\.vgz\.nl[^)]+)\)/)
    if (imgMatch) {
      mediaItems.push(imgMatch[1])
      continue // Don't add image lines to body text
    }

    // Skip nav links (short lines that are just [text](url))
    if (line.match(/^\s*\*\s+\[.+\]\(https:\/\/www\.vgz\.nl.+\)\s*$/) && line.length < 120) continue
    if (line.match(/^\*\s+\[.+\]\(https:\/\/www\.vgz\.nl.+\)\s*$/) && line.length < 120) continue

    bodyLines.push(line)
  }

  // Clean up body
  const body = bodyLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .substring(0, 3000)

  // Extract meta description — first substantial paragraph
  const paragraphs = bodyLines.filter(l =>
    l.trim().length > 80 &&
    !l.startsWith('#') &&
    !l.startsWith('*') &&
    !l.startsWith('-') &&
    !l.startsWith('!')
  )
  const metaDescription = paragraphs[0]?.trim().substring(0, 200) || ''

  return { pageTitle, metaDescription, body, mediaItems }
}

export async function POST(req: NextRequest) {
  const { url } = await req.json()

  if (!url.startsWith('https://www.vgz.nl')) {
    return NextResponse.json({ error: 'Alleen vgz.nl URLs zijn toegestaan' }, { status: 400 })
  }

  // Try Jina first
  try {
    const jinaRes = await fetch(`https://r.jina.ai/${url}`, {
      headers: { 'Accept': 'text/markdown' },
      signal: AbortSignal.timeout(12000),
    })

    if (jinaRes.ok) {
      const markdown = await jinaRes.text()
      const { pageTitle, metaDescription, body, mediaItems } = extractContent(markdown)

      return NextResponse.json({
        pageTitle,
        metaDescription,
        body,
        mediaItems,
        fetchedUrl: url,
        incomplete: !body || body.length < 100,
        source: 'jina',
      })
    }
  } catch { /* fall through */ }

  // Fallback: direct fetch (metadata only)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' },
      signal: AbortSignal.timeout(8000),
    })
    const html = await res.text()
    const pageTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.replace(' - VGZ', '').trim() || ''
    const metaDescription = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] || ''

    return NextResponse.json({
      pageTitle, metaDescription, body: '', mediaItems: [],
      fetchedUrl: url, incomplete: true, source: 'direct',
    })
  } catch {
    return NextResponse.json({
      pageTitle: '', metaDescription: '', body: '', mediaItems: [],
      fetchedUrl: url, incomplete: true, source: 'failed',
    })
  }
}
