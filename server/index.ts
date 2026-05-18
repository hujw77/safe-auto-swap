import 'dotenv/config'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const port = Number(process.env.PORT ?? 8787)
const sorRouterBaseUrl = process.env.SOR_ROUTER_BASE_URL ?? 'https://sor-router.helixbox.ai'

app.use(express.json())

app.use((request, response, next) => {
  const manifestLikeAsset =
    request.path === '/manifest.json' ||
    request.path === '/icon.svg' ||
    request.path === '/.well-known/safe-apps.json'

  if (manifestLikeAsset) {
    response.setHeader('Access-Control-Allow-Origin', '*')
    response.setHeader('Access-Control-Allow-Methods', 'GET')
    response.setHeader(
      'Access-Control-Allow-Headers',
      'X-Requested-With, content-type, Authorization'
    )
  }

  next()
})

const requiredOkxEnv = [
  'OKX_ACCESS_KEY',
  'OKX_SECRET_KEY',
  'OKX_ACCESS_PASSPHRASE',
  'OKX_ACCESS_PROJECT'
] as const

const assertOkxEnv = () => {
  for (const key of requiredOkxEnv) {
    if (!process.env[key]) {
      throw new Error(`Missing ${key} for OKX balance API proxy`)
    }
  }
}

const signOkxRequest = (timestamp: string, method: string, requestPath: string): string => {
  const secret = process.env.OKX_SECRET_KEY
  if (!secret) {
    throw new Error('Missing OKX_SECRET_KEY')
  }

  const prehash = `${timestamp}${method.toUpperCase()}${requestPath}`

  return crypto.createHmac('sha256', secret).update(prehash).digest('base64')
}

app.get('/api/health', (_request, response) => {
  response.json({ ok: true })
})

app.get('/api/tokens', async (request, response) => {
  try {
    assertOkxEnv()

    const address = request.query.address
    const chainId = request.query.chainId

    if (typeof address !== 'string' || typeof chainId !== 'string') {
      response.status(400).json({ error: 'address and chainId are required' })
      return
    }

    const requestPath = `/api/v5/wallet/asset/all-token-balances-by-address?address=${encodeURIComponent(
      address
    )}&chains=${encodeURIComponent(chainId)}&filter=0`
    const timestamp = new Date().toISOString()
    const signature = signOkxRequest(timestamp, 'GET', requestPath)
    const upstream = await fetch(`https://web3.okx.com${requestPath}`, {
      headers: {
        'Content-Type': 'application/json',
        'OK-ACCESS-KEY': process.env.OKX_ACCESS_KEY!,
        'OK-ACCESS-PASSPHRASE': process.env.OKX_ACCESS_PASSPHRASE!,
        'OK-ACCESS-PROJECT': process.env.OKX_ACCESS_PROJECT!,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp
      }
    })

    if (!upstream.ok) {
      const body = await upstream.text()
      response.status(upstream.status).send(body)
      return
    }

    const json = (await upstream.json()) as {
      code?: string
      msg?: string
      data?: Array<{
        tokenAssets?: Array<Record<string, unknown>>
      }>
    }
    const tokens = json.data?.flatMap((item) => item.tokenAssets ?? []) ?? []

    response.json({
      code: json.code,
      msg: json.msg,
      tokens: tokens.map((token) => ({
        ...token,
        chainId: Number(chainId),
        name: token.symbol,
        decimals: Number(token.decimals ?? 18)
      }))
    })
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : String(error)
    })
  }
})

app.post('/api/quote', async (request, response) => {
  try {
    const body = request.body as Record<string, unknown>
    const chainId = body.chain_id

    if (typeof chainId !== 'number') {
      response.status(400).json({ error: 'chain_id is required' })
      return
    }

    const upstream = await fetch(`${sorRouterBaseUrl}/api/chain/${chainId}/quotesV2`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })

    const text = await upstream.text()

    response
      .status(upstream.status)
      .type(upstream.headers.get('content-type') ?? 'application/json')
      .send(text)
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : String(error)
    })
  }
})

const distPath = path.resolve(__dirname, '../dist')
app.use(express.static(distPath))

app.use((request, response) => {
  if (request.path.startsWith('/api/')) {
    response.status(404).json({ error: `Unknown API route: ${request.path}` })
    return
  }

  response.sendFile(path.join(distPath, 'index.html'))
})

app.listen(port, () => {
  console.log(`Safe Auto Swap server listening on http://localhost:${port}`)
})
