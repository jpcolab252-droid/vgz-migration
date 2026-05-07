import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 })

  const body = await req.json()
  const { item, fetchedData, issues } = body

  const name = item.fields?.Title || item.fields?.Name || item.label || ''
  const url = item.fields?.Url || item.url || ''
  const metaDesc = fetchedData?.metaDescription || item.fields?.Summary || ''
  const pageTitle = fetchedData?.pageTitle || item.fields?.Title || item.fields?.Name || name
  const bodyText = (item.fields?.Body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 400)
  const issueList = issues || []

  const prompt = `Je helpt een redacteur bij het migreren van VGZ.nl Sitecore-content naar Contentful.

Sitecore item:
- Naam/titel: ${pageTitle}
- URL pad: ${url}
- Type: ${item.template || item.type}
- Meta description: ${metaDesc}
- Body (indien beschikbaar): ${bodyText || '(niet beschikbaar)'}
- Technische problemen: ${issueList.length ? issueList.join(', ') : 'geen'}

Stel de volgende Contentful velden voor in JSON:
{
  "contentType": "Artikel" | "Service" | "Thema",
  "titel": "...",
  "slug": "...",
  "thema": "Bewegen" | "Voeding" | "Mentale gezondheid",
  "samenvatting": "één zin, max 160 tekens, geen HTML",
  "notitie": "één korte zin voor de redacteur over wat nog aandacht nodig heeft bij deze migratie"
}

Reageer ALLEEN met de JSON.`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const data = await response.json()
  const text = data.content?.[0]?.text || '{}'
  const clean = text.replace(/```json|```/g, '').trim()

  try {
    return NextResponse.json(JSON.parse(clean))
  } catch {
    const slug = url.split('/').pop() || ''
    const thema = url.includes('bewegen') ? 'Bewegen' : url.includes('voeding') ? 'Voeding' : 'Mentale gezondheid'
    return NextResponse.json({
      contentType: item.template || item.type || 'Artikel',
      titel: pageTitle,
      slug,
      thema,
      samenvatting: metaDesc.substring(0, 160),
      notitie: issueList.length ? `Let op: ${issueList[0]}` : 'Velden ingevuld op basis van beschikbare metadata.',
    })
  }
}
