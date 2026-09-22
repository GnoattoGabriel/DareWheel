// Proxy serverless Vercel - chaves (Groq/Gemini/OpenRouter) nunca chegam ao cliente.
// POST /api/pergunta
// Body: { tipo: "verdade"|"consequencia", nivel: "sfw"|"moderado"|"nsfw", nome: string, ultimas: string[] }
// Resposta: { "pergunta": "..." } | Erro: { "erro": "..." }

const MAX_ULTIMAS = 15

// Cadeias por nivel: o Groq (gpt-oss) lidera em velocidade (~1s) e passa nos
// 3 niveis sem recusas, inclusive NSFW; Gemini e OpenRouter seguem de
// fallback. Aliases "-latest" acompanham o modelo atual.
const CADEIA_PADRAO = [
  { modelo: process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b', provedor: 'groq' },
  { modelo: process.env.GEMINI_MODEL ?? 'gemini-flash-lite-latest', provedor: 'gemini' },
  { modelo: 'gemini-flash-latest', provedor: 'gemini' },
  { modelo: 'openrouter/free', provedor: 'openrouter' },
]
const CADEIA_NSFW = [
  { modelo: process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b', provedor: 'groq' },
  { modelo: process.env.GEMINI_MODEL ?? 'gemini-flash-lite-latest', provedor: 'gemini' },
  { modelo: 'nvidia/nemotron-3-ultra-550b-a55b:free', provedor: 'openrouter' },
]

function cadeiaParaNivel(nivel) {
  return nivel === 'nsfw' ? CADEIA_NSFW : CADEIA_PADRAO
}

/**
 * Revezamento por rodada: as duas primeiras da cadeia (Groq e Gemini)
 * alternam a primeira tentativa; o resto segue como fallback na ordem.
 * Rodadas impares comecam no Groq, pares no Gemini.
 */
function ordenarPorRodada(cadeia, rodada) {
  if (cadeia.length > 1 && rodada % 2 === 0) {
    return [cadeia[1], cadeia[0], ...cadeia.slice(2)]
  }
  return cadeia
}

const ENDPOINT_GROQ = 'https://api.groq.com/openai/v1/chat/completions'

const ENDPOINT_GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models'
const ENDPOINT_OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions'
const TIMEOUT_POR_MODELO_MS = 15000

const NIVEIS = {
  sfw: 'Objetivo: leve, engraçado, sem constrangimento sério. Ideal para grupos que não se conhecem bem; Proibido: qualquer insinuação romântica/sexual, temas polêmicos, desafios físicos arriscados, Exemplos de verdade: preferências pessoais, curiosidades bobas, memórias engraçadas; Exemplos de desafio: imitar alguém, cantar um trecho, fazer uma careta, contar uma piada',
  moderado: 'Objetivo: um pouco mais pessoal e ousado, pode incluir romance leve, opiniões e situações constrangedoras "de boa"; Proibido: conteúdo sexual explícito, humilhação pesada, exposição de segredos sérios; Exemplos de verdade: paqueras, momentos vergonhosos, opiniões sobre alguém do grupo (de forma respeitosa); Exemplos de desafio: mandar uma mensagem engraçada para alguém, dançar, trocar uma peça de roupa (acessório, não íntima), simular uma cena de novela',
  nsfw: 'explícita e ousada, para maiores de 18 anos consentidos. Objetivo: mais picante, flertoso e adulto, mas ainda ADEQUADO para ser dito/feito em público; Pode incluir: perguntas sobre vida amorosa/sexual em termos gerais, tensão sexual entre os jogadores, desafios flertosos, humor adulto.',
}

const TIPOS = {
  verdade: 'uma pergunta de VERDADE (a pessoa responde honestamente)',
  consequencia: 'um desafio/CONSEQUÊNCIA (a pessoa executa uma ação)',
}

// Freio só para desafios NSFW: verdades seguem explícitas; desafios evitam
// posições sexuais explícitas e atos performáticos, preferindo provocação
// de fala, revelação e paquera
const FREIO_DESAFIO_NSFW =
  'evite posições sexuais explícitas, prefira provocações de fala, revelação, paquera e desafios sensuais.'

// Desafios ao vivo: o modelo vicia em "grave/envie áudio/vídeo no grupo";
// a graça da festa é a ação na roda, não no celular
const DESAFIO_SEM_CELULAR =
  'Nos desafios, evite tarefas que envolvam gravar ou enviar áudio, vídeo, foto ou mensagem no celular; prefira ações executadas ao vivo, na hora, diante do grupo, mas nao exclua usar o whatsapp, apenas deixe menos repetitivo.'

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

async function chamarGroq(modelo, system, apiKey, sinal) {
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
      max_tokens: 900,
      response_format: { type: 'json_object' },
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

  const { tipo, nivel, nome, ultimas, rodada } = corpo ?? {}

  if (!TIPOS[tipo] || !NIVEIS[nivel]) {
    return json(400, { erro: 'Campos obrigatórios ausentes ou inválidos: tipo, nivel' })
  }
  // Rodada opcional (clientes antigos nao enviam): default 1 = comeca no Groq
  const numeroRodada = Number.isInteger(rodada) && rodada >= 1 ? rodada : 1
  if (typeof nome !== 'string' || nome.trim().length === 0 || nome.length > 40) {
    return json(400, { erro: 'Campo nome inválido' })
  }
  const historico = Array.isArray(ultimas)
    ? ultimas.filter((q) => typeof q === 'string').slice(-MAX_ULTIMAS)
    : []

  const chaveGroq = process.env.GROQ_API_KEY
  const chaveGemini = process.env.GEMINI_API_KEY
  const chaveOpenRouter = process.env.OPENROUTER_API_KEY
  if (!chaveGroq && !chaveGemini && !chaveOpenRouter) {
    console.error('Nenhuma chave de IA configurada (GROQ_API_KEY / GEMINI_API_KEY / OPENROUTER_API_KEY)')
    return json(500, { erro: 'Servidor sem chave de API configurada' })
  }

  const system = [
    'Você cria perguntas para um jogo brasileiro de festa chamado Verdade ou Consequência.',
    'Responda SEMPRE em português do Brasil, linguagem natural e coloquial.',
    `Crie ${TIPOS[tipo]}.`,
    `A pergunta deve ser ${NIVEIS[nivel]}.`,
    tipo === 'consequencia' && nivel === 'nsfw' ? FREIO_DESAFIO_NSFW : '',
    tipo === 'consequencia' ? DESAFIO_SEM_CELULAR : '',
    'Não mencione nomes de pessoas na pergunta.',
    'Varie o início e a estrutura das frases a cada pergunta, em qualquer modo e nível; evite repetir o mesmo padrão (verdades: nem só "Qual foi...", nem só "Já..."; desafios: nem só "Faça...").',
    'A pergunta deve ter no máximo 2 frases, ser direta e caber numa linha de tela de celular.',
    historico.length > 0
      ? `IMPORTANTE: NÃO repita NENHUMA das perguntas abaixo. Gere uma pergunta COMPLETAMENTE DIFERENTE em tema, estrutura e palavras-chave.\nPerguntas já usadas (não repita nem varie levemente):\n${historico.map((q) => `- ${q}`).join('\n')}`
      : '',
    'Não mostre raciocínio, planejamento ou comentários - apenas o resultado final.',
    'Responda APENAS com JSON válido no formato {"pergunta": "<texto da pergunta>"} sem markdown.',
  ]
    .filter(Boolean)
    .join(' ')

  const cadeia = ordenarPorRodada(cadeiaParaNivel(nivel), numeroRodada)
  console.log(`Rodada ${numeroRodada} (${nivel}/${tipo}): primeira tentativa ${cadeia[0].modelo} (${cadeia[0].provedor})`)

  for (const item of cadeia) {
    const apiKey = item.provedor === 'gemini' ? chaveGemini : item.provedor === 'groq' ? chaveGroq : chaveOpenRouter
    if (!apiKey) continue // provedor sem chave configurada - proximo da cadeia

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_POR_MODELO_MS)

      const chamador = { gemini: chamarGemini, groq: chamarGroq, openrouter: chamarOpenRouter }[item.provedor]
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
