// Proxy serverless Vercel - a chave OpenRouter nunca chega ao cliente.
// POST /api/pergunta
// Body: { tipo: "verdade"|"consequencia", nivel: "sfw"|"moderado"|"nsfw", nome: string, ultimas: string[] }
// Resposta: { "pergunta": "..." } | Erro: { "erro": "..." }

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
const MAX_ULTIMAS = 5

// Cadeia de modelos: o roteador gratuito as vezes cai em "reasoners"
// gigantes que estouram o timeout sem produzir conteudo - tentamos os
// reservas antes de desistir e deixar o cliente usar o banco /bkp.
// O primeiro da lista pode ser sobrescrito via env OPENROUTER_MODEL.
const MODELOS = [
  process.env.OPENROUTER_MODEL ?? 'nvidia/nemotron-3-ultra-550b-a55b:free',
  'google/gemma-4-31b-it:free',
  'openrouter/free',
]

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

/**
 * Extrai o texto da pergunta do conteudo devolvido pelo modelo.
 * 1) JSON puro; 2) chave com typo; 3) resgate generico de string citada
 * (modelos que invertem as chaves do JSON ou vazam texto ao redor).
 */
function extrairPergunta(conteudo, tipo) {
  // 1) JSON direto
  try {
    const direto = JSON.parse(conteudo)?.pergunta
    if (typeof direto === 'string' && direto.trim()) {
      return validarPergunta(direto.trim(), tipo)
    }
  } catch {
    // nao e JSON puro - segue para estrategias tolerantes
  }
  // 2) Chave com typo, ex.: "pergunta:" em vez de "pergunta"
  const m = conteudo.match(/"pergunta[^"]*"\s*:\s*"((?:[^"\\]|\\.)*)"/)
  if (m) {
    try {
      const embutida = JSON.parse(`"${m[1]}"`)
      if (typeof embutida === 'string' && embutida.trim()) {
        return validarPergunta(embutida.trim(), tipo)
      }
    } catch {
      // segue para resgate generico
    }
  }
  // 3) Resgate generico: strings citadas longas que parecem pergunta/desafio
  const candidatas = conteudo.match(/"([^"\\\n]{15,300})"/g) ?? []
  let melhor = null
  for (const bruta of candidatas) {
    try {
      const texto = JSON.parse(bruta)
      if (typeof texto !== 'string') continue
      if (/[[\]{}<>]/.test(texto)) continue
      if (!/[?!]/.test(texto)) continue
      if (/^[a-z_]+\s*:/.test(texto.toLowerCase())) continue
      if (!melhor || texto.length > melhor.length) melhor = texto
    } catch {
      // string escapada invalida - ignora
    }
  }
  return melhor ? validarPergunta(melhor, tipo) : null
}

/** Heuristica contra vazamento de raciocinio/meta-texto do modelo */
function pareceInvalida(texto, tipo) {
  // Remove aspas de embrulho que alguns modelos adicionam
  const limpo = texto.replace(/^["'“”«»\s]+|["'“”«»\s]+$/g, "").trim()
  const baixo = limpo.toLowerCase()
  const suspeitos = [
    'json', 'pergunta"', '```', 'markdown', 'system:', 'user:',
    'we need', 'precisamos', 'raciocínio', 'raciocinio',
    'o modelo', 'placeholder',
  ]
  const interrogacoes = (limpo.match(/\?/g) || []).length
  return (
    limpo.length < 10 ||
    limpo.length > 280 ||
    /\n/.test(limpo) ||
    /[<>]/.test(limpo) ||                                  // placeholders tipo <text>
    /^[a-záéíóúâêôãõç]+\s*:/i.test(limpo) ||               // rotulos tipo "Perto:"
    (tipo === 'verdade' && (!limpo.includes('?') || interrogacoes > 2)) ||
    suspeitos.some((s) => baixo.includes(s))
  )
}

/** Devolve o texto limpo quando valido; null caso contrario */
function validarPergunta(texto, tipo) {
  if (typeof texto !== 'string') return null
  const limpo = texto.replace(/^["'“”«»\s]+|["'“”«»\s]+$/g, "").trim()
  return pareceInvalida(limpo, tipo) ? null : limpo
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

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    console.error('OPENROUTER_API_KEY nao configurada no ambiente')
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
    'Não mostre raciocínio, planejamento ou comentários - apenas o resultado final.',
    'Responda APENAS com JSON válido no formato {"pergunta": "<texto da pergunta>"} sem markdown.',
  ]
    .filter(Boolean)
    .join(' ')

  for (const modelo of MODELOS) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000)

      const resposta = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          // Atribuicao do app recomendada pelo OpenRouter
          'HTTP-Referer': 'https://darewheel.vercel.app',
          'X-Title': 'DareWheel',
        },
        body: JSON.stringify({
          model: modelo,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: 'Gere a próxima pergunta do jogo.' },
          ],
          temperature: 1,
          // Modelos de raciocinio consomem tokens "pensando" antes do conteudo
          max_tokens: 900,
          response_format: { type: 'json_object' },
          // Modelos de raciocinio gratuitos: nao devolver tokens de "thinking"
          reasoning: { exclude: true },
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!resposta.ok) {
        console.error(`OpenRouter respondeu ${resposta.status} para ${modelo}`)
        continue
      }

      const dados = await resposta.json()
      const conteudo = dados.choices?.[0]?.message?.content
      const bruta = typeof conteudo === 'string' ? extrairPergunta(conteudo, tipo) : null
      const pergunta = validarPergunta(bruta, tipo)

      if (pergunta) {
        return json(200, { pergunta })
      }

      const bruto = typeof conteudo === 'string'
        ? JSON.stringify(conteudo.slice(0, 250))
        : JSON.stringify(dados).slice(0, 400)
      console.error(`Resposta rejeitada de ${modelo}. Payload: ${bruto}`)
    } catch (erro) {
      const abortado = erro?.name === 'AbortError'
      console.error(`Erro ao chamar ${modelo}:`, abortado ? 'timeout' : erro)
    }
  }

  return json(502, { erro: 'Nenhum modelo conseguiu gerar uma pergunta valida' })
}
