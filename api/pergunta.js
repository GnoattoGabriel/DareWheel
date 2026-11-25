// Proxy serverless Vercel - chaves (Groq/Gemini) nunca chegam ao cliente.
// POST /api/pergunta
// Body: { tipo: "verdade"|"consequencia", nivel: "sfw"|"moderado"|"nsfw", nome: string, ultimas: string[] }
// Resposta: { "pergunta": "..." } | Erro: { "erro": "..." }

const MAX_ULTIMAS = 15
const MAX_ULTIMA_LEN = 400

// Cadeia unica para todos os niveis e tipos: Groq (gpt-oss-120b) e Gemini
// alternam a primeira tentativa por rodada; um Groq menor e o ultimo fallback.
const MODELO_GROQ = process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b'
const MODELO_GEMINI = process.env.GEMINI_MODEL ?? 'gemini-flash-lite-latest'
const MODELO_GROQ_FALLBACK = process.env.GROQ_FALLBACK_MODEL ?? 'qwen/qwen3.8-27b'
const CADEIA = [
  { modelo: MODELO_GROQ, provedor: 'groq' },
  { modelo: MODELO_GEMINI, provedor: 'gemini' },
  { modelo: MODELO_GROQ_FALLBACK, provedor: 'groq' },
]

/**
 * Revezamento por rodada: Groq e Gemini alternam a primeira tentativa;
 * o Groq menor segue como fallback. Impares comecam no Groq, pares no Gemini.
 */
function ordenarPorRodada(rodada) {
  if (rodada % 2 === 0) {
    return [CADEIA[1], CADEIA[0], ...CADEIA.slice(2)]
  }
  return CADEIA
}

const ENDPOINT_GROQ = 'https://api.groq.com/openai/v1/chat/completions'
const ENDPOINT_GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models'
// 3 modelos x 8s = 24s no pior caso; o cliente espera 25s (src/api.ts).
const TIMEOUT_POR_MODELO_MS = 8000

// Limite simples por instancia da funcao (Vercel cria varias): protege as
// chaves contra uso indiscriminado sem afetar o jogador normal.
const LIMITE_REQ_POR_MINUTO = Number(process.env.LIMITE_REQ_POR_MINUTO ?? 30)
const JANELA_LIMITE_MS = 60_000
const contagemPorIp = new Map()

function excedeuLimite(ip) {
  const agora = Date.now()
  const entrada = contagemPorIp.get(ip)
  if (!entrada || agora - entrada.inicio >= JANELA_LIMITE_MS) {
    // Podas entradas antigas para o Map nao crescer sem limite.
    if (contagemPorIp.size > 1000) {
      for (const [chave, valor] of contagemPorIp) {
        if (agora - valor.inicio >= JANELA_LIMITE_MS) contagemPorIp.delete(chave)
      }
    }
    contagemPorIp.set(ip, { inicio: agora, total: 1 })
    return false
  }
  entrada.total++
  return entrada.total > LIMITE_REQ_POR_MINUTO
}

const BASE = [
  'Você escreve o texto de uma rodada do DareWheel, jogo de verdade ou consequência.',
  'O jogo é presencial: o grupo está reunido na mesma sala. Responda em português do Brasil, coloquial e natural.',
]

// Regras especificas por tipo: antes verdade e desafio compartilhavam a mesma
// instrucao e o modelo cava no padrao ("Qual foi..." / "Faça...").
const REGRAS_TIPO = {
  verdade: 'Crie UMA PERGUNTA DE VERDADE: a pessoa sorteada responde honestamente em voz alta. Termine com "?". Não inclua a resposta e não pergunte "você prefere A ou B?".',
  consequencia: 'Crie UM DESAFIO: uma ação concreta, executada na hora, diante do grupo, em até 30 segundos, sem precisar de celular ou objeto. Diga o que fazer e como o grupo vai saber que foi cumprido.',
}

const NIVEIS = {
  sfw: 'Tom leve e engraçado, seguro para quem se conhece pouco. Sem romance, sexualidade, temas polêmicos ou constrangimento sério. Use preferências bobas, memórias engraçadas, imitações, caretas e mini-performances.',
  moderado: 'Tom pessoal e ousado na medida: romance leve, opiniões, vergonha "de boa", paquera. Sem conteúdo sexual explícito, humilhação ou segredos sérios. Pode envolver outra pessoa da roda de forma respeitosa.',
  nsfw: 'Tom adulto, picante e flertoso, para maiores de 18 anos que consentiram em jogar. Pode falar de vida amorosa e sexual em termos gerais e criar provocações sensuais. Ainda deve ser possível dizer ou fazer na frente do grupo: sem atos sexuais explícitos, sem posições sexuais e sem obrigar contato físico.',
}

const TEMAS = [
  'humor', 'curiosidade', 'memória', 'relacionamento',
  'situação constrangedora', 'criatividade', 'improviso', 'interação entre jogadores',
]

// Freio só para desafios NSFW: verdades seguem explícitas; desafios evitam
// posições sexuais explícitas e atos performáticos, preferindo provocação
// de fala, revelação e paquera. Vale "prefira" em vez de proibição absoluta:
// banir o celular de vez fez o modelo viciar em outros padroes.
const FREIO_DESAFIO_NSFW =
  'Nos desafios NSFW, prefira fala, revelação e paquera; evite posições sexuais e atos performáticos.'

// Desafios ao vivo: o modelo vicia em "grave/envie áudio/vídeo no grupo";
// a graça da festa é a ação na roda, não no celular. Cota em vez de veto.
const DESAFIO_SEM_CELULAR =
  'Prefira ações ao vivo na roda. No máximo 1 em cada 5 desafios pode envolver celular; nunca exija gravar ou enviar áudio, vídeo ou foto.'

function json(statusCode, corpo, headersExtra = {}) {
  return new Response(JSON.stringify(corpo), {
    status: statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headersExtra },
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
  const candidatas = conteudo.match(/"([^"\\\n]{15,380})"/g) ?? []
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
    limpo.length > 380 ||
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
  const candidato = dados.candidates?.[0]
  const partes = candidato?.content?.parts ?? []
  const texto = partes
    .filter((p) => p.thought !== true && typeof p.text === 'string')
    .map((p) => p.text)
    .join('')
    .trim()
  if (!texto) {
    console.error(`Gemini sem texto (${modelo}): finishReason=${candidato?.finishReason ?? '?'} blockReason=${dados.promptFeedback?.blockReason ?? '?'}`)
  }
  return texto
}

async function chamarGroq(modelo, system, apiKey, sinal) {
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    const resposta = await fetch(ENDPOINT_GROQ, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelo,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: 'Gere a próxima pergunta do jogo.' },
        ],
        temperature: 1,
        response_format: { type: 'json_object' },
      }),
      signal: sinal,
    })

    if (resposta.ok) {
      const dados = await resposta.json()
      const conteudo = dados.choices?.[0]?.message?.content
      return typeof conteudo === 'string' ? conteudo.trim() : ''
    }

    const textoErro = await resposta.text()
    const detalhe = textoErro.slice(0, 160)
    // 429 e comum no tier free (TPM). Uma unica tentativa curta evita
    // desperdicar o timeout de 8s do modelo.
    if (resposta.status === 429 && tentativa === 1 && !sinal.aborted) {
      const sugerido = Number(resposta.headers.get('retry-after') ?? (textoErro.match(/try again in ([\d.]+)s/) ?? [])[1] ?? 1)
      const espera = Math.min(Math.max(Number.isFinite(sugerido) ? sugerido : 1, 0.5), 2)
      console.error(`Groq 429 em ${modelo} - retry em ${espera.toFixed(1)}s`)
      await new Promise((resolve) => setTimeout(resolve, espera * 1000))
      continue
    }
    throw new Error(`HTTP ${resposta.status}: ${detalhe}`)
  }
  return ''
}

// Export nomeado por metodo HTTP: o runtime da Vercel reconhece o estilo
// Web API apenas com exports nomeados (GET/POST...); com export default
// ele interpreta a assinatura como Node (req, res) e ignora as respostas
export async function POST(request) {
  const requestId = Math.random().toString(36).slice(2, 10)
  const responder = (status, corpo, headers = {}) =>
    json(status, corpo, { 'X-Request-Id': requestId, ...headers })

  const ip = String(
    request.headers?.get?.('x-forwarded-for') ?? request.headers?.get?.('x-real-ip') ?? 'local'
  ).split(',')[0].trim() || 'local'
  if (excedeuLimite(ip)) {
    return responder(
      429,
      { erro: 'Muitas perguntas em pouco tempo. Tente novamente em instantes.' },
      { 'Retry-After': '60' }
    )
  }

  if (request.method !== 'POST') {
    return responder(405, { erro: 'Método não permitido' })
  }

  let corpo
  try {
    corpo = await request.json()
  } catch {
    return responder(400, { erro: 'JSON inválido' })
  }

  const { tipo, nivel, nome, ultimas, rodada } = corpo ?? {}

  // hasOwn evita chaves do prototype ("toString", "constructor") passarem
  // como tipo/nivel validos e vazarem para dentro do prompt.
  if (
    typeof tipo !== 'string' || !Object.hasOwn(REGRAS_TIPO, tipo) ||
    typeof nivel !== 'string' || !Object.hasOwn(NIVEIS, nivel)
  ) {
    return responder(400, { erro: 'Campos obrigatórios ausentes ou inválidos: tipo, nivel' })
  }
  // Rodada opcional (clientes antigos nao enviam): default 1 = começa no
  // primeiro modelo da cadeia do nivel
  const numeroRodada = Number.isInteger(rodada) && rodada >= 1 ? rodada : 1
  if (typeof nome !== 'string' || nome.trim().length === 0 || nome.length > 40) {
    return responder(400, { erro: 'Campo nome inválido' })
  }
  const historico = Array.isArray(ultimas)
    ? ultimas
        .filter((q) => typeof q === 'string' && q.length <= MAX_ULTIMA_LEN)
        .slice(-MAX_ULTIMAS)
    : []

  const chaveGroq = process.env.GROQ_API_KEY
  const chaveGemini = process.env.GEMINI_API_KEY
  if (!chaveGroq && !chaveGemini) {
    console.error(`[${requestId}] Nenhuma chave de IA configurada (GROQ_API_KEY / GEMINI_API_KEY)`)
    return responder(500, { erro: 'Servidor sem chave de API configurada' })
  }

  const system = [
    ...BASE,
    REGRAS_TIPO[tipo],
    `Nível: ${NIVEIS[nivel]}`,
    'Não use nomes próprios na pergunta; fale de "alguém da roda" de forma genérica.',
    tipo === 'consequencia' ? DESAFIO_SEM_CELULAR : '',
    tipo === 'consequencia' && nivel === 'nsfw' ? FREIO_DESAFIO_NSFW : '',
    `Tema desta rodada: ${TEMAS[(numeroRodada - 1) % TEMAS.length]}. Use como inspiração, mas não escreva o nome do tema na saída.`,
    'Escreva de 1 a 2 frases, no máximo 380 caracteres, sem quebras de linha, sem markdown e sem aspas ao redor.',
    historico.length > 0
      ? `NÃO repita nenhuma destas perguntas: mude tema, estrutura e palavras-chave.\n${historico.map((q) => `- ${q}`).join('\n')}`
      : '',
    'Não mostre raciocínio nem comentários. Responda SOMENTE com JSON válido no formato {"pergunta": "<texto>"}.',
  ]
    .filter(Boolean)
    .join(' ')

  const cadeia = ordenarPorRodada(numeroRodada)
  console.log(`[${requestId}] Rodada ${numeroRodada} (${nivel}/${tipo}): primeira tentativa ${cadeia[0].modelo} (${cadeia[0].provedor})`)

  for (const item of cadeia) {
    const apiKey = item.provedor === 'gemini' ? chaveGemini : chaveGroq
    if (!apiKey) continue // provedor sem chave configurada - proximo da cadeia

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_POR_MODELO_MS)
      let conteudo
      try {
        const chamador = { gemini: chamarGemini, groq: chamarGroq }[item.provedor]
        conteudo = await chamador(item.modelo, system, apiKey, controller.signal)
      } finally {
        // Cancela o timer tambem quando a chamada falha (429, timeout, etc).
        clearTimeout(timeoutId)
      }

      const pergunta = conteudo ? extrairPergunta(conteudo, tipo) : null
      if (pergunta) {
        return responder(200, { pergunta })
      }

      console.error(`[${requestId}] Resposta rejeitada de ${item.modelo} (${item.provedor}). Conteudo: ${JSON.stringify(String(conteudo).slice(0, 250))}`)
    } catch (erro) {
      const abortado = erro?.name === 'AbortError'
      console.error(`[${requestId}] Erro ao chamar ${item.modelo} (${item.provedor}):`, abortado ? 'timeout' : erro?.message ?? erro)
    }
  }

  return responder(502, { erro: 'Nenhum modelo conseguiu gerar uma pergunta valida' })
}
