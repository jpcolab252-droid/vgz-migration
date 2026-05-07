import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
  }

  const body = await req.json()
  const { item, issues } = body

  const name = item.fields?.Title || item.fields?.Name || ''
  const body_text = (item.fields?.Body || '').replace(/<[^>]+>/g, '').substring(0, 400)

  const prompt = `Je analyseert een stukje content van VGZ.nl dat gemigreerd wordt van Sitecore naar Contentful.

Content item:
- Type: ${item.template}
- Titel/naam: ${name}
- Body (tekst): ${body_text}
- Gedetecteerde problemen: ${issues.length ? issues.join(', ') : 'geen'}

Geef een migratieadvies in het volgende JSON-formaat:
{
  "advies": "behouden" | "aanpassen" | "weggooien",
  "reden": "één zin waarom",
  "acties": ["actie 1", "actie 2"]
}

Reageer ALLEEN met de JSON, geen andere tekst.`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const data = await response.json()
  const text = data.content?.[0]?.text || '{}'
  const clean = text.replace(/```json|```/g, '').trim()

  try {
    return NextResponse.json(JSON.parse(clean))
  } catch {
    return NextResponse.json({
      advies: issues.length > 2 ? 'aanpassen' : 'behouden',
      reden: issues.length ? `${issues.length} problemen gevonden.` : 'Content ziet er goed uit.',
      acties: issues.slice(0, 2).map((i: string) => `Fix: ${i}`),
    })
  }
}
