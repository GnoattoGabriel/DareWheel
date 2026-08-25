// Proxy serverless Vercel - chaves (Gemini/OpenRouter) nunca chegam ao cliente.
// POST /api/pergunta
// Body: { tipo: "verdade"|"consequencia", nivel: "sfw"|"moderado"|"nsfw", nome: string, ultimas: string[] }
// Resposta: { "pergunta": "..." } | Erro: { "erro": "..." }

const MAX_ULTIMAS = 5

// Cadeias por nivel: o free tier do Gemini bloqueia saida sexualmente
// explicita (finishReason SAFETY, inconfiguravel), entao NSFW comeca pelo
// OpenRouter (Nemotron Ultra aceita); os demais niveis usam o caminho
// rapido do Gemini. Aliases "-latest" acompanham o modelo atual.
const CADEIA_GEMINI_PRIMEIRO = [
  { modelo: process.env.GEMINI_MODEL ?? 'gemini-flash-lite-latest', provedor: 'gemini' },
  { modelo: 'gemini-flash-latest', provedor: 'gemini' },
  { modelo: 'openrouter/free', provedor: 'openrouter' },
]
const CADEIA_NSFW = [
  { modelo: 'nvidia/nemotron-3-ultra-550b-a55b:free', provedor: 'openrouter' },
  { modelo: process.env.GEMINI_MODEL ?? 'gemini-flash-lite-latest', provedor: 'gemini' },
]

function cadeiaParaNivel(nivel) {
  return nivel === 'nsfw' ? CADEIA_NSFW : CADEIA_GEMINI_PRIMEIRO
}

const ENDPOINT_GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models'
const ENDPOINT_OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions'
const TIMEOUT_POR_MODELO_MS = 15000

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

async function chamarGemini(modelo, system, apiKey, sinal) {
  const resposta = await fetch(`${ENDPOINT_GEMINI}/${modelo}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: 'Gere a próxima pergunta do jogo.' }] }],
      generationConfig: {
        temperature: 1,
        // Modelos com thinking consomem tokens antes do conteudo final
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
      },
      // Relaxado para permitir perguntas picantes do nivel NSFW;
      // recusas eventuais caem no banco /bkp normalmente
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
      ],
    }),
    signal: sinal,
  })

  if (!resposta.ok) {
    throw new Error(`HTTP ${resposta.status}`)
  }

  const dados = await resposta.json()
  const partes = dados.candidates?.[0]?.content?.parts ?? []
  return partes
    .filter((p) => p.thought !== true && typeof p.text === 'string')
    .map((p) => p.text)
    .join('')
    .trim()
}

async function chamarOpenRouter(modelo, system, apiKey, sinal) {
  const resposta = await fetch(ENDPOINT_OPENROUTER, {
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
    signal: sinal,
  })

  if (!resposta.ok) {
    throw new Error(`HTTP ${resposta.status}`)
  }

  const dados = await resposta.json()
  const conteudo = dados.choices?.[0]?.message?.content
  return typeof conteudo === 'string' ? conteudo.trim() : ''
}

// Export nomeado por metodo HTTP: o runtime da Vercel reconhece o estilo
// Web API apenas com exports nomeados (GET/POST...); com export default
// ele interpreta a assinatura como Node (req, res) e ignora as respostas
export async function POST(request) {
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

  const chaveGemini = process.env.GEMINI_API_KEY
  const chaveOpenRouter = process.env.OPENROUTER_API_KEY
  if (!chaveGemini && !chaveOpenRouter) {
    console.error('Nenhuma chave de IA configurada (GEMINI_API_KEY / OPENROUTER_API_KEY)')
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

  for (const item of cadeiaParaNivel(nivel)) {
    const apiKey = item.provedor === 'gemini' ? chaveGemini : chaveOpenRouter
    if (!apiKey) continue // provedor sem chave configurada - proximo da cadeia

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_POR_MODELO_MS)

      const chamador = item.provedor === 'gemini' ? chamarGemini : chamarOpenRouter
      const conteudo = await chamador(item.modelo, system, apiKey, controller.signal)

      clearTimeout(timeoutId)

      const pergunta = conteudo ? extrairPergunta(conteudo, tipo) : null
      if (pergunta) {
        return json(200, { pergunta })
      }

      console.error(`Resposta rejeitada de ${item.modelo} (${item.provedor}). Conteudo: ${JSON.stringify(String(conteudo).slice(0, 250))}`)
    } catch (erro) {
      const abortado = erro?.name === 'AbortError'
      console.error(`Erro ao chamar ${item.modelo} (${item.provedor}):`, abortado ? 'timeout' : erro?.message ?? erro)
    }
  }

  return json(502, { erro: 'Nenhum modelo conseguiu gerar uma pergunta valida' })
}
