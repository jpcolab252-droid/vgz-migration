import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { url } = await req.json()

  // Try Jina AI reader first — renders JS and returns markdown
  try {
    const jinaResponse = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        'Accept': 'text/markdown',
        'User-Agent': 'Mozilla/5.0 (compatible; VGZ-Migration-Tool/1.0)',
      },
      signal: AbortSignal.timeout(12000),
    })

    if (jinaResponse.ok) {
      const markdown = await jinaResponse.text()

      // Extract title from first # heading
      const titleMatch = markdown.match(/^#\s+(.+)$/m)
      const pageTitle = titleMatch?.[1]?.replace(' - VGZ', '').trim() || ''

      // Extract first meaningful paragraph as summary (skip nav/header noise)
      const lines = markdown.split('\n').filter(l => l.trim())
      const paragraphs = lines.filter(l =>
        !l.startsWith('#') &&
        !l.startsWith('[') &&
        !l.startsWith('!') &&
        !l.startsWith('*') &&
        !l.startsWith('-') &&
        l.length > 60
      )
      const metaDescription = paragraphs[0]?.substring(0, 200) || ''

      // Get body — skip navigation lines, take content
      const contentStart = markdown.indexOf('\n\n')
      const rawBody = contentStart > 0 ? markdown.substring(contentStart).trim() : markdown
      const body = rawBody
        .split('\n')
        .filter(l => !l.includes('vgz.nl') || l.length > 80)
        .join('\n')
        .substring(0, 3000)

      return NextResponse.json({
        pageTitle,
        metaDescription,
        ogTitle: '',
        body,
        fetchedUrl: url,
        incomplete: false,
        source: 'jina',
      })
    }
  } catch {
    // Jina failed, fall through to direct fetch
  }

  // Fallback: direct fetch (metadata only)
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VGZ-Migration-Tool/1.0)',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(8000),
    })

    const html = await response.text()
    const pageTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.replace(' - VGZ', '').trim() || ''
    const metaDescription = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] || ''
    const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] || ''

    return NextResponse.json({
      pageTitle,
      metaDescription,
      ogTitle,
      body: '',
      fetchedUrl: url,
      incomplete: true,
      source: 'direct',
    })
  } catch {
    return NextResponse.json({
      pageTitle: '',
      metaDescription: '',
      ogTitle: '',
      body: '',
      fetchedUrl: url,
      incomplete: true,
      source: 'failed',
    })
  }
}
