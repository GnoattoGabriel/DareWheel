/**
 * Cliente da API de perguntas (proxy serverless na Vercel).
 * Qualquer falha lanca erro - quem chama decide o fallback.
 */

export interface PedidoPergunta {
  nome: string
  tipo: "verdade" | "consequencia"
  nivel: string
  /** Ultimas perguntas exibidas, mais recentes por ultimo */
  ultimas: string[]
  /** Numero da rodada atual (1-based) - define o revezamento de modelos */
  rodada: number
}

const TIMEOUT_MS = 8000

export async function pedirPergunta(pedido: PedidoPergunta): Promise<string> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch('/api/pergunta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo: pedido.tipo,
        nivel: pedido.nivel,
        nome: pedido.nome,
        ultimas: pedido.ultimas.slice(-5),
        rodada: pedido.rodada,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Proxy respondeu ${response.status}`)
    }

    const dados: unknown = await response.json()
    const pergunta = (dados as { pergunta?: unknown })?.pergunta

    if (typeof pergunta !== 'string' || pergunta.trim().length === 0) {
      throw new Error('Resposta sem pergunta valida')
    }

    return pergunta.trim()
  } finally {
    clearTimeout(timeoutId)
  }
}
