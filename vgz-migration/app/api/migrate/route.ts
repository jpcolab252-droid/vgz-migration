import { NextRequest, NextResponse } from 'next/server'

const SPACE_ID = '5gf243ew80ad'
const LOCALE = 'en-US'

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  const cfToken = process.env.CONTENTFUL_CMA_TOKEN

  if (!apiKey) return NextResponse.json({ error: 'Anthropic API key niet geconfigureerd' }, { status: 500 })
  if (!cfToken) return NextResponse.json({ error: 'Contentful token niet geconfigureerd' }, { status: 500 })

  const { item, fetchedData, analysis } = await req.json()

  const contentTypeMap: Record<string, string> = {
    'Artikel': 'artikel',
    'Service': 'service',
    'Thema': 'thema',
  }

  const contentType = contentTypeMap[analysis.contentType] || 'artikel'
  const entryId = `migrated-${analysis.slug}-${Date.now()}`

  const prompt = `Maak een nieuwe draft entry aan in Contentful voor de VGZ Gezond Leven migratie.

Space ID: ${SPACE_ID}
Environment: master
Content Type: ${contentType}
Entry ID: ${entryId}

Velden (locale: ${LOCALE}):
- ${contentType === 'service' ? 'naam' : 'titel'}: "${analysis.titel}"
- slug: "${analysis.slug}"
- ${contentType === 'service' ? 'omschrijving' : 'samenvatting'}: "${analysis.samenvatting}"

Thema link (Entry ID):
- thema-bewegen voor Bewegen
- thema-voeding voor Voeding  
- thema-mentale-gezondheid voor Mentale gezondheid
Gekozen thema: ${analysis.thema}

Maak de entry aan als draft (niet publiceren). Bevestig de aanmaak met het entry ID.`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'mcp-client-2025-04-04',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
        mcp_servers: [
          {
            type: 'url',
            url: 'https://mcp.contentful.com/sse',
            name: 'contentful',
            authorization_token: cfToken,
          }
        ],
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      // Fallback: direct CMA call
      return fallbackCMA(cfToken, contentType, entryId, analysis)
    }

    const responseText = data.content
      ?.filter((b: { type: string }) => b.type === 'text')
      ?.map((b: { text: string }) => b.text)
      ?.join('\n') || ''

    return NextResponse.json({
      success: true,
      entryId,
      contentType,
      message: responseText || `Entry ${entryId} aangemaakt als draft`,
      method: 'mcp',
    })

  } catch {
    return fallbackCMA(cfToken, contentType, entryId, analysis)
  }
}

async function fallbackCMA(cfToken: string, contentType: string, entryId: string, analysis: Record<string, string>) {
  const LOCALE = 'en-US'
  const BASE = `https://api.contentful.com/spaces/${SPACE_ID}/environments/master`

  const themaIdMap: Record<string, string> = {
    'Bewegen': 'thema-bewegen',
    'Voeding': 'thema-voeding',
    'Mentale gezondheid': 'thema-mentale-gezondheid',
  }

  const isService = contentType === 'service'
  const isThema = contentType === 'thema'

  const fields: Record<string, { [locale: string]: unknown }> = {
    [isService ? 'naam' : 'titel']: { [LOCALE]: analysis.titel },
    slug: { [LOCALE]: analysis.slug },
    [isService ? 'omschrijving' : isThema ? 'intro' : 'samenvatting']: { [LOCALE]: analysis.samenvatting },
  }

  if (!isThema && analysis.thema && themaIdMap[analysis.thema]) {
    fields.thema = {
      [LOCALE]: {
        sys: { type: 'Link', linkType: 'Entry', id: themaIdMap[analysis.thema] }
      }
    }
  }

  const res = await fetch(`${BASE}/entries/${entryId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${cfToken}`,
      'Content-Type': 'application/vnd.contentful.management.v1+json',
      'X-Contentful-Content-Type': contentType,
    },
    body: JSON.stringify({ fields }),
  })

  if (res.ok) {
    return NextResponse.json({
      success: true,
      entryId,
      contentType,
      message: `Draft entry aangemaakt: ${analysis.titel}`,
      method: 'cma-fallback',
    })
  }

  const err = await res.json()
  return NextResponse.json({
    success: false,
    error: err.message || 'Aanmaken mislukt',
  }, { status: 400 })
}
