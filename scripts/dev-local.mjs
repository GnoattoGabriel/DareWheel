/**
 * Servidor local de desenvolvimento - alternativa ao `vercel dev`
 * (cujo emulador de funções pode travar no Windows).
 *
 * - Serve os estáticos de public/ (igual à Vercel em produção)
 * - Executa as funções reais de api/ via Web Request/Response
 * - Carrega .env.local para process.env (mesma convenção da Vercel)
 *
 * Uso: npm run dev:node  →  http://localhost:3000
 */
import { createServer } from "node:http"
import { readFileSync, existsSync, readdirSync } from "node:fs"
import { extname, join } from "node:path"

const PORT = 3000
const PUBLIC_DIR = "public"
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
}

// .env.local -> process.env (sem sobrescrever o que ja existe)
if (existsSync(".env.local")) {
  for (const linha of readFileSync(".env.local", "utf-8").split("\n")) {
    const m = linha.trim().match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "")
    }
  }
}

// Descobre as funcoes de api/ uma unica vez
const funcoes = {}
for (const arquivo of readdirSync("api").filter((f) => f.endsWith(".js"))) {
  const rota = `/api/${arquivo.replace(/\.js$/, "")}`
  funcoes[rota] = (await import(`../api/${arquivo}`)).default
}

async function lerCorpo(req) {
  const partes = []
  for await (const pedaco of req) partes.push(pedaco)
  return Buffer.concat(partes)
}

const servidor = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`)

    // 1) Funcoes serverless de api/
    if (funcoes[url.pathname]) {
      const corpo = req.method === "GET" || req.method === "HEAD" ? undefined : await lerCorpo(req)
      const request = new Request(url, {
        method: req.method,
        headers: Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : v ?? ""]),
        body: corpo,
      })
      const resposta = await funcoes[url.pathname](request)
      const headers = {}
      resposta.headers.forEach((valor, chave) => { headers[chave] = valor })
      res.writeHead(resposta.status, headers)
      res.end(await resposta.text())
      return
    }

    // 2) Estaticos de public/ (index.html na raiz)
    let caminho = join(PUBLIC_DIR, decodeURIComponent(url.pathname))
    if (url.pathname === "/") caminho = join(PUBLIC_DIR, "index.html")
    if (!existsSync(caminho) || !caminho.startsWith(join(PUBLIC_DIR, ""))) {
      res.writeHead(404, { "Content-Type": "text/plain" })
      res.end("404")
      return
    }
    const conteudo = readFileSync(caminho)
    res.writeHead(200, { "Content-Type": MIME[extname(caminho)] ?? "application/octet-stream" })
    res.end(conteudo)
  } catch (erro) {
    console.error("Erro no servidor local:", erro)
    res.writeHead(500, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ erro: String(erro?.message ?? erro) }))
  }
})

servidor.listen(PORT, () => {
  console.log(`Dev local em http://localhost:${PORT} (estaticos: public/, funcoes: ${Object.keys(funcoes).join(", ")})`)
})
