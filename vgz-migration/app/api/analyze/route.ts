import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 })

  const { item, fetchedData } = await req.json()

  const pageTitle = fetchedData?.pageTitle || item.label || ''
  const metaDesc = fetchedData?.metaDescription || ''
  const body = (fetchedData?.body || '').substring(0, 800)
  const url = item.url || ''
  const mediaCount = fetchedData?.mediaItems?.length || 0

  const prompt = `Je helpt een redacteur bij het migreren van VGZ.nl content naar Contentful.

Sitecore pagina:
- URL: ${url}
- Paginatitel: ${pageTitle}
- Meta description: ${metaDesc}
- Body (eerste 800 tekens): ${body || '(niet beschikbaar)'}
- Aantal media-items gevonden: ${mediaCount}

Stel Contentful veldmapping voor als JSON:
{
  "contentType": "Artikel" | "Service" | "Thema",
  "titel": "...",
  "slug": "...",
  "thema": "Bewegen" | "Voeding" | "Mentale gezondheid",
  "samenvatting": "max 160 tekens, geen HTML, op basis van meta description of eerste alinea",
  "notitie": "één zin: wat heeft de redacteur nog te doen na de automatische mapping?"
}

Regels:
- contentType = Thema als het een overzichtspagina is, Service als het een tool/app/programma betreft, anders Artikel
- slug = laatste deel van de URL, zonder speciale tekens
- thema bepaal je op basis van het URL-pad en de inhoud
- notitie = concreet, bijv. "Body bevat hardcoded telefoonnummer — vervangen door contactcomponent" of "Media nog handmatig toe te voegen (${mediaCount} afbeeldingen gevonden)"

Reageer ALLEEN met de JSON.`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
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

  const data = await res.json()
  const text = data.content?.[0]?.text || '{}'

  try {
    return NextResponse.json(JSON.parse(text.replace(/```json|```/g, '').trim()))
  } catch {
    const slug = url.split('/').pop() || ''
    const thema = url.includes('bewegen') ? 'Bewegen' : url.includes('voeding') ? 'Voeding' : 'Mentale gezondheid'
    return NextResponse.json({
      contentType: item.type || 'Artikel',
      titel: pageTitle,
      slug,
      thema,
      samenvatting: metaDesc.substring(0, 160),
      notitie: mediaCount > 0 ? `${mediaCount} media-items gevonden — handmatig toe te voegen.` : 'Velden ingevuld o.b.v. beschikbare metadata.',
    })
  }
}
