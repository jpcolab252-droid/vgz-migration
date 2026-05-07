import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { url } = await req.json()

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VGZ-Migration-Tool/1.0)',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(8000),
    })

    const html = await response.text()

    // Extract metadata from HTML
    const pageTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.replace(' - VGZ', '').trim() || ''
    const metaDescription = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] || ''
    const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] || ''
    const ogDescription = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] || ''

    return NextResponse.json({
      pageTitle,
      metaDescription,
      ogTitle,
      ogDescription,
      fetchedUrl: url,
      incomplete: !metaDescription && !ogDescription,
    })
  } catch {
    return NextResponse.json({
      pageTitle: '',
      metaDescription: '',
      ogTitle: '',
      ogDescription: '',
      fetchedUrl: url,
      incomplete: true,
    })
  }
}
