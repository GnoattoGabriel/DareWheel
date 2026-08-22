// Proxy serverless Vercel - a chave OpenAI nunca chega ao cliente.
// POST /api/pergunta
// Body: { tipo: "verdade"|"consequencia", nivel: "sfw"|"moderado"|"nsfw", nome: string, ultimas: string[] }
// Resposta: { "pergunta": "..." } | Erro: { "erro": "..." }

const MODEL = 'gpt-5.4-mini'
const MAX_ULTIMAS = 5

// Limite de execucao da funcao na Vercel (segundos) - nao afeta os
// timeouts internos (abort 15s), so evita que a plataforma mate a
// funcao durante chamadas longas a OpenAI
export const maxDuration = 60

const NIVEIS = {
  sfw: 'leve e apropriada para todos os públicos, para quebrar o gelo',
  moderado: 'pessoal e com um toque picante leve, equilibrando intimidade e bom gosto',
  nsfw: 'explícita e ousada, para uma festa de adultos maiores de 18 anos que consentiram em jogar',
}

const TIPOS = {
  verdade: 'uma pergunta de VERDADE (a pessoa responde honestamente)',
  consequencia: 'um desafio/CONSEQUÊNCIA (a pessoa executa uma ação divertida)',
}

function json(statusCode, corpo) {
  return new Response(JSON.stringify(corpo), {
    status: statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

export default async function handler(request) {
  if (request.method !== 'POST') {
    return json(405, { erro: 'Método não permitido' })
  }

  let corpo
  try {
    corpo = await request.json()
  } catch {
    return json(400, { erro: 'JSON inválido' })
  }

  const { tipo, nivel, nome, ultimas } = corpo ?? {}

  if (!TIPOS[tipo] || !NIVEIS[nivel]) {
    return json(400, { erro: 'Campos obrigatórios ausentes ou inválidos: tipo, nivel' })
  }
  if (typeof nome !== 'string' || nome.trim().length === 0 || nome.length > 40) {
    return json(400, { erro: 'Campo nome inválido' })
  }
  const historico = Array.isArray(ultimas)
    ? ultimas.filter((q) => typeof q === 'string').slice(-MAX_ULTIMAS)
    : []

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('OPENAI_API_KEY nao configurada no ambiente')
    return json(500, { erro: 'Servidor sem chave de API configurada' })
  }

  const system = [
    'Você cria perguntas para um jogo brasileiro de festa chamado Verdade ou Consequência.',
    'Responda SEMPRE em português do Brasil, linguagem natural e coloquial.',
    `Crie ${TIPOS[tipo]}.`,
    `A pergunta deve ser ${NIVEIS[nivel]}.`,
    `Personalize levemente usando o nome do jogador: ${nome.trim()}. Não comece a pergunta pelo nome.`,
    'A pergunta deve ter no máximo 2 frases, ser direta e caber numa linha de tela de celular.',
    historico.length > 0
      ? `NÃO repita nem crie algo muito parecido com estas perguntas recentes:\n${historico.map((q) => `- ${q}`).join('\n')}`
      : '',
    'Responda APENAS com JSON válido no formato {"pergunta": "<texto da pergunta>"} sem markdown.',
  ]
    .filter(Boolean)
    .join(' ')

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    const resposta = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: 'Gere a próxima pergunta do jogo.' },
        ],
        temperature: 1,
        max_tokens: 200,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!resposta.ok) {
      console.error(`OpenAI respondeu ${resposta.status}`)
      return json(502, { erro: 'Falha na API da OpenAI' })
    }

    const dados = await resposta.json()
    const conteudo = dados.choices?.[0]?.message?.content

    let pergunta = null
    if (conteudo) {
      try {
        pergunta = JSON.parse(conteudo)?.pergunta ?? null
      } catch {
        // Modelo ignorou o formato JSON - usa o texto cru como plano B
        pergunta = typeof conteudo === 'string' ? conteudo.trim() : null
      }
    }

    if (typeof pergunta !== 'string' || pergunta.length < 10) {
      return json(502, { erro: 'Resposta vazia ou recusada pelo modelo' })
    }

    return json(200, { pergunta })
  } catch (erro) {
    const abortado = erro?.name === 'AbortError'
    console.error('Erro ao chamar OpenAI:', abortado ? 'timeout' : erro)
    return json(502, { erro: abortado ? 'Timeout ao consultar a IA' : 'Erro inesperado' })
  }
}
