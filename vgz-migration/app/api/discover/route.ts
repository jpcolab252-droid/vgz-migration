import { NextRequest, NextResponse } from 'next/server'

function guessType(url: string): string {
  const path = url.replace('https://www.vgz.nl', '')
  const depth = path.split('/').filter(Boolean).length
  if (depth <= 2) return 'Thema'
  const lower = path.toLowerCase()
  if (['coach', 'gesprek', 'therapieland', 'olga', 'app', 'programma'].some(k => lower.includes(k))) return 'Service'
  return 'Artikel'
}

function labelFromUrl(url: string): string {
  const slug = url.split('/').filter(Boolean).pop() || ''
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export async function POST(req: NextRequest) {
  const { url } = await req.json()

  if (!url.startsWith('https://www.vgz.nl')) {
    return NextResponse.json({ error: 'Alleen vgz.nl URLs zijn toegestaan' }, { status: 400 })
  }

  try {
    const jinaRes = await fetch(`https://r.jina.ai/${url}`, {
      headers: { 'Accept': 'text/markdown' },
      signal: AbortSignal.timeout(12000),
    })

    if (!jinaRes.ok) throw new Error('Jina failed')

    const markdown = await jinaRes.text()

    // Extract all internal vgz.nl links
    const linkRegex = /\[([^\]]+)\]\((https:\/\/www\.vgz\.nl\/[^)]+)\)/g
    const seen = new Set<string>()
    const items: { id: string; label: string; url: string; type: string }[] = []

    // Determine the base path to filter children
    const basePath = url.replace('https://www.vgz.nl', '')

    let match
    while ((match = linkRegex.exec(markdown)) !== null) {
      const linkUrl = match[1].includes('http') ? match[2] : match[2]
      const linkPath = linkUrl.replace('https://www.vgz.nl', '')

      // Only include links that are children of the base path
      if (
        linkPath.startsWith(basePath + '/') &&
        linkPath !== basePath &&
        !seen.has(linkUrl) &&
        !linkUrl.includes('utm_') &&
        !linkUrl.includes('#') &&
        !linkUrl.includes('?') &&
        linkPath.split('/').filter(Boolean).length <= basePath.split('/').filter(Boolean).length + 2
      ) {
        seen.add(linkUrl)
        const slug = linkPath.split('/').filter(Boolean).pop() || ''
        items.push({
          id: slug,
          label: labelFromUrl(linkUrl),
          url: linkPath,
          type: guessType(linkUrl),
        })
      }
    }

    // Extract page title for the root item
    const titleMatch = markdown.match(/^#\s+(.+)$/m)
    const rootTitle = titleMatch?.[1]?.replace(' - VGZ', '').trim() || labelFromUrl(url)

    return NextResponse.json({
      rootItem: {
        id: basePath.split('/').filter(Boolean).pop() || 'root',
        label: rootTitle,
        url: basePath,
        type: guessType(url),
      },
      children: items,
    })
  } catch {
    return NextResponse.json({ error: 'Ophalen mislukt' }, { status: 500 })
  }
}
