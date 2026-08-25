import { Participante } from "./types.js"
import { audio } from "./audio.js"

export interface ResultadoGiro {
  boca: Participante
  bunda: Participante
  /** Vitorias consecutivas da boca, incluindo a rodada atual. */
  streak: number
}

interface Fatia {
  fimAngulo: number
  indiceJogador: number
}

/**
 * Embaralha uma copia da lista (Fisher-Yates). Usado para sortear os
 * assentos dos jogadores na roleta a cada rodada, garantindo que todos
 * os pares boca/bunda acontecam ao longo da sessao.
 */
export function embaralhar<T>(lista: T[]): T[] {
  const copia = [...lista]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia
}

/**
 * Estrategias visuais para aplicar a nova ordem de assentos.
 * - "pulso-giro": troca escondida no pulso borrado no inicio do giro
 * - "deslize": FUTURO (Opcao 3) - emojis deslizam FLIP para os novos assentos
 */
export type EstrategiaEmbaralho = "pulso-giro" | "deslize"

export class Wheel {
  private static readonly PESO_INICIAL = 1.0
  private static readonly FATOR_REDUCAO = 0.75
  private static readonly PESO_MINIMO = 0.2

  private readonly rodaElement: HTMLElement
  private readonly agulhaElement: HTMLElement
  private participantes: Participante[]
  private ordemExibicao: Participante[] = []
  private rotacaoAtual: number = 0
  private pesos: Map<string, number> = new Map()
  private streakPorId: Map<string, number> = new Map()
  private coresPorId: Map<string, string> = new Map()
  private fatias: Fatia[] = []
  private labelsElement: HTMLElement | null = null
  private girando: boolean = false
  private estrategia: EstrategiaEmbaralho = "pulso-giro"
  private geracao: number = 0
  private readonly onResultado: (resultado: ResultadoGiro) => void
  private readonly respeitarReducedMotion: boolean

  constructor(
    rodaId: string,
    agulhaId: string,
    onResultado: (resultado: ResultadoGiro) => void,
    participantes: Participante[] = [],
    respeitarReducedMotion: boolean = true
  ) {
    this.rodaElement = document.getElementById(rodaId) as HTMLElement
    this.agulhaElement = document.getElementById(agulhaId) as HTMLElement
    this.participantes = participantes
    this.ordemExibicao = participantes
    this.onResultado = onResultado
    this.respeitarReducedMotion = respeitarReducedMotion

    this.inicializar()
  }

  /**
   * Ponto unico de troca da estrategia visual de embaralhamento.
   * Para adotar a Opcao 3 no futuro: setEstrategiaEmbaralho("deslize")
   * e implementar o bloco correspondente em aplicarOrdemVisual().
   */
  public setEstrategiaEmbaralho(estrategia: EstrategiaEmbaralho): void {
    this.estrategia = estrategia
  }

  private static readonly CORES = [
    "#3182ce", "#e53e3e", "#38a169", "#dd6b20",
    "#805ad5", "#d69e2e", "#319795", "#d53f8c",
    "#4a5568", "#2f855a", "#c05621", "#6b46c1",
  ]

  /** Paleta publica para o menu atribuir cor fixa a cada jogador. */
  public static get PALETA_CORES(): string[] {
    return Wheel.CORES
  }

  private inicializar(): void {
    if (!this.rodaElement || !this.agulhaElement) {
      console.error("Elementos da roleta não encontrados")
      return
    }

    // Overlay para os emojis das fatias (reutiliza se ja existir)
    const pai = this.rodaElement.parentElement
    if (pai) {
      this.labelsElement =
        (pai.querySelector('.roda-labels') as HTMLElement | null) ?? document.createElement('span')
      this.labelsElement.className = 'roda-labels'
      if (!this.labelsElement.parentElement) {
        pai.appendChild(this.labelsElement)
      }
    }
  }

  private obterPeso(participante: Participante): number {
    return this.pesos.get(participante.id) ?? Wheel.PESO_INICIAL
  }

  /**
   * Cor fixa por jogador (identidade visual): prefere a cor persistida no
   * participante (p.cor, escolhida no menu); se ausente, atribui a proxima
   * cor livre de CORES e mantem nas rodadas seguintes.
   */
  private corDe(participante: Participante): string {
    if (participante.cor) return participante.cor

    let cor = this.coresPorId.get(participante.id)
    if (!cor) {
      const usadas = new Set(this.coresPorId.values())
      cor = Wheel.CORES.find((c) => !usadas.has(c)) ?? Wheel.CORES[this.coresPorId.size % Wheel.CORES.length]
      this.coresPorId.set(participante.id, cor)
    }
    return cor
  }

  /**
   * Reduz multiplicativamente o peso do vencedor (x0.75, piso 0.2) enquanto
   * ele permanecer em sequencia de vitorias. Quando outro jogador e sorteado,
   * o vencedor anterior recupera o peso padrao.
   */
  public aplicarVitoria(vencedorId: string): void {
    // Vencedor anterior (diferente do atual) recupera o peso padrao e zera o streak
    if (this.ultimoVencedorId && this.ultimoVencedorId !== vencedorId) {
      this.pesos.set(this.ultimoVencedorId, Wheel.PESO_INICIAL)
      this.streakPorId.set(this.ultimoVencedorId, 0)
    }

    const atual = this.pesos.get(vencedorId) ?? Wheel.PESO_INICIAL
    this.pesos.set(vencedorId, Math.max(Wheel.PESO_MINIMO, atual * Wheel.FATOR_REDUCAO))
    this.streakPorId.set(vencedorId, (this.streakPorId.get(vencedorId) ?? 0) + 1)
    this.ultimoVencedorId = vencedorId
  }

  private ultimoVencedorId: string | null = null

  /**
   * Reseta todos os pesos para o valor inicial (novo jogo).
   */
  public resetarPesos(): void {
    this.pesos.clear()
    this.streakPorId.clear()
    this.ultimoVencedorId = null
  }

  /**
   * Calcula o raio da roleta baseado no número de jogadores.
   * Formula: raio = Math.min(200, 100 + qtd * 15)
   */
  public calcularRaio(qtdJogadores: number): number {
    return Math.min(200, 100 + Math.max(2, qtdJogadores) * 15)
  }

  /**
   * Numero de sub-fatias por jogador (intercaladas round-robin).
   * Alvo ~12 fatias totais. Impar obrigatorio: com k par, o offset de +180°
   * da bunda coincide com o periodo do padrao (360/k) e boca/bunda apontam
   * sempre para o mesmo jogador.
   */
  private calcularRepeticoes(qtd: number): number {
    let k = Math.max(1, Math.round(12 / qtd))
    if (k % 2 === 0) k += 1
    return k
  }

  /**
   * Pinta as fatias da roleta usando conic-gradient na ordem de exibicao.
   * Cada jogador tem participacao angular proporcional ao seu peso,
   * dividida em k sub-fatias iguais intercaladas (round-robin).
   * A tabela de fatias acumulada e usada depois no calculo do resultado.
   */
  private atualizarVisual(): void {
    const qtd = this.ordemExibicao.length
    if (qtd < 2) return

    const k = this.calcularRepeticoes(qtd)
    const somaPesos = this.ordemExibicao.reduce((soma, p) => soma + this.obterPeso(p), 0)
    const anguloPorCiclo = this.ordemExibicao.map((p) => (this.obterPeso(p) / somaPesos) * 360)
    const anguloSubFatia = anguloPorCiclo.map((angulo) => angulo / k)

    const paradas: string[] = []
    this.fatias = []
    let acumulado = 0

    for (let ciclo = 0; ciclo < k; ciclo++) {
      for (let i = 0; i < qtd; i++) {
        const fim = acumulado + anguloSubFatia[i]
        // Linha branca fina no fim de cada fatia (separador visual)
        const linha = Math.min(1.2, anguloSubFatia[i] * 0.12)
        paradas.push(`${this.corDe(this.ordemExibicao[i])} ${acumulado}deg ${fim - linha}deg`)
        paradas.push(`#f5f2ea ${fim - linha}deg ${fim}deg`)
        acumulado = fim
        this.fatias.push({ fimAngulo: acumulado, indiceJogador: i })
      }
    }

    // Garantir que a ultima fatia fecha exatamente em 360deg
    if (paradas.length > 0) {
      paradas[paradas.length - 1] = paradas[paradas.length - 1].replace(/[\d.]+deg$/, "360deg")
    }

    this.rodaElement.style.background = `conic-gradient(${paradas.join(", ")})`
    this.renderizarLabels(anguloSubFatia)
  }

  /**
   * Posiciona o emoji de cada jogador no angulo medio de cada sub-fatia
   * (k rotulos por jogador, como uma roleta real). Emojis ficam sempre "em pe".
   */
  private renderizarLabels(anguloSubFatia: number[]): void {
    if (!this.labelsElement) return

    this.labelsElement.replaceChildren()

    const tamanho = this.rodaElement.clientWidth || 400
    const dist = (tamanho / 2) * 0.68 // posicao do emoji: 68% do centro ate a borda

    let acumulado = 0
    for (let ciclo = 0; ciclo < this.calcularRepeticoes(this.ordemExibicao.length); ciclo++) {
      for (let i = 0; i < this.ordemExibicao.length; i++) {
        const meio = acumulado + anguloSubFatia[i] / 2
        acumulado += anguloSubFatia[i]

        // 0deg = topo (12h), sentido horario
        const rad = ((meio - 90) * Math.PI) / 180
        const left = 50 + (dist / tamanho) * 100 * Math.cos(rad)
        const top = 50 + (dist / tamanho) * 100 * Math.sin(rad)

        // Fonte proporcional ao arco disponivel na fatia
        const arcoPx = dist * ((anguloSubFatia[i] * Math.PI) / 180)
        const fontSize = Math.max(12, Math.min(28, arcoPx * 0.9))

        const span = document.createElement('span')
        span.textContent = this.ordemExibicao[i].nome
        span.style.left = `${left}%`
        span.style.top = `${top}%`
        span.style.fontSize = `${fontSize}px`
        this.labelsElement.appendChild(span)
      }
    }
  }

  /**
   * Costura unica da estrategia visual de embaralhamento.
   *
   * "pulso-giro" (padrao): no instante do clique a roleta pulsa borrada
   * (~350ms), os assentos sao reconstruidos no pico do pulso (~175ms) e
   * a agulha dispara em seguida.
   *
   * "deslize" (PONTO DE PLUG DA OPCAO 3): capturar as posicoes atuais dos
   * labels antes de atualizarVisual(), reconstruir e animar left/top via CSS
   * transition nos spans (.roda-labels span com transicao), sem pulso.
   */
  private aplicarOrdemVisual(geracao: number): void {
    if (this.estrategia === "deslize") {
      // TODO Opcao 3: FLIP dos labels aqui
      this.atualizarVisual()
      return
    }

    const alvo = this.rodaElement.closest('.roleta-wrapper')
    alvo?.classList.add('embaralhando')

    window.setTimeout(() => {
      if (geracao !== this.geracao) {
        alvo?.classList.remove('embaralhando')
        return
      }
      this.atualizarVisual()
    }, 175)

    window.setTimeout(() => {
      alvo?.classList.remove('embaralhando')
    }, 375)
  }

  /**
   * Gira a agulha (estilo garrafa) sobre a roleta parada.
   * - Assentos embaralhados a cada rodada (mascarados pelo pulso de giro)
   * - Rotação acumulativa: sempre avança 4 voltas (+ aleatório 0-360)
   * - Animação dura 4s com cubic-bezier easing
   * - Boca aponta quem responde; bunda (oposto, +180°), quem pergunta
   */
  public girar(participantes: Participante[]): boolean {
    this.participantes = participantes

    if (participantes.length < 2) {
      console.error("Precisa de pelo menos 2 participantes para girar a roleta")
      return false
    }

    if (this.girando) {
      console.info("Roleta ja esta girando - giro ignorado")
      return false
    }

    // Novos assentos a cada rodada; aplicados visualmente com mascara
    // enquanto a agulha acelera (ver aplicarOrdemVisual)
    this.ordemExibicao = embaralhar(participantes)
    this.geracao++

    // Respeitar prefers-reduced-motion - pular animação
    if (this.respeitarReducedMotion && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      console.info("prefers-reduced-motion ativo: animação da roleta pulada")
      // Sem animacao nao ha momento de velocidade para mascarar a troca:
      // aplica direto e sorteia ponderado pelos pesos
      this.atualizarVisual()
      const boca = this.sortearPonderado()
      const bundaIndice =
        (this.ordemExibicao.indexOf(boca) + Math.ceil(this.ordemExibicao.length / 2)) %
        this.ordemExibicao.length
      this.onResultado({
        boca,
        bunda: this.ordemExibicao[bundaIndice],
        streak: (this.streakPorId.get(boca.id) ?? 0) + 1,
      })
      return true
    }

    // Rotação ACUMULATIVA da agulha: sempre avança 4 voltas (+ aleatório)
    // a partir da posição atual. Piso alto = variação percebida menor
    // entre giros (antes 3-4 voltas parecia inconsistente demais)
    const delta = 1440 + Math.random() * 360
    this.rotacaoAtual += delta

    this.girando = true
    this.rodaElement.closest('.roleta-wrapper')?.classList.add('girando')

    // Monitor rAF: ticks ao cruzar fatias + wobble na fase lenta
    this.iniciarMonitorGiro(this.geracao)

    // Conclusao unica: transitionend OU timeout de seguranca (4.3s),
    // para que girando nunca fique preso em true
    let concluido = false
    const concluir = () => {
      if (concluido) return
      concluido = true
      this.girando = false
      this.rodaElement.closest('.roleta-wrapper')?.classList.remove('girando')
      this.calcularResultado()
    }
    this.agulhaElement.addEventListener("transitionend", concluir, { once: true })
    window.setTimeout(concluir, 4300)

    // Aplicar animação na agulha (roleta fica estática)
    this.agulhaElement.style.transition = "transform 4s cubic-bezier(0.23, 1, 0.32, 1)"
    this.agulhaElement.style.transform = `translate(-50%, -50%) rotate(${this.rotacaoAtual}deg)`

    // Mascara do embaralhamento: troca de assentos escondida no pulso
    this.aplicarOrdemVisual(this.geracao)
    return true
  }

  /**
   * Loop rAF durante o giro: le o angulo real da agulha (matriz CSS),
   * dispara um tick sonoro a cada fatia cruzada e balanca a agulha
   * apenas na fase lenta final.
   */
  private iniciarMonitorGiro(geracao: number): void {
    const tamanhoFatia = 360 / Math.max(1, this.fatias.length)
    const corpo = this.agulhaElement.querySelector('.agulha-corpo')
    let ultimaFatia: number | null = null
    let wobbleAtivo = false

    const passo = () => {
      if (geracao !== this.geracao || !this.girando) return

      const matriz = window.getComputedStyle(this.agulhaElement).transform
      if (matriz && matriz !== "none") {
        const partes = matriz.slice(7, -1).split(",").map(Number)
        const angulo = (Math.atan2(partes[1], partes[0]) * 180) / Math.PI
        const fatiaAtual = Math.floor((((angulo % 360) + 360) % 360) / tamanhoFatia)

        if (ultimaFatia !== null && fatiaAtual !== ultimaFatia) {
          audio.tick()
          if (!wobbleAtivo && corpo instanceof HTMLElement) {
            wobbleAtivo = true
            corpo.classList.add('wobble')
            window.setTimeout(() => {
              corpo.classList.remove('wobble')
              wobbleAtivo = false
            }, 110)
          }
        }
        ultimaFatia = fatiaAtual
      }

      requestAnimationFrame(passo)
    }
    requestAnimationFrame(passo)
  }

  private sortearPonderado(): Participante {
    const somaPesos = this.ordemExibicao.reduce((soma, p) => soma + this.obterPeso(p), 0)
    let alvo = Math.random() * somaPesos
    for (let i = 0; i < this.ordemExibicao.length; i++) {
      alvo -= this.obterPeso(this.ordemExibicao[i])
      if (alvo < 0) {
        return this.ordemExibicao[i]
      }
    }
    return this.ordemExibicao[this.ordemExibicao.length - 1]
  }

  private indiceSobAngulo(angulo: number): number | null {
    const normalizado = ((angulo % 360) + 360) % 360
    // epsilon evita que erro de ponto flutuante na acumulacao das bordas
    // faca um angulo exatamente em cima da fronteira cair na fatia anterior
    const EPS = 1e-9
    const fatia = this.fatias.find((f) => normalizado < f.fimAngulo - EPS)
    return fatia ? fatia.indiceJogador : this.fatias[this.fatias.length - 1]?.indiceJogador ?? null
  }

  /**
   * Calcula os dois papéis após a animação.
   * Em repouso a boca aponta para a DIREITA (3h), que equivale a 90 graus
   * no sistema do conic-gradient (0 = topo, sentido horario). Apos girar
   * R graus, ela indica o angulo (R + 90). A bunda fica oposta (+180).
   */
  private calcularResultado(): void {
    if (!this.agulhaElement || this.fatias.length === 0) return

    const anguloBoca = (this.rotacaoAtual + 90) % 360
    const anguloBunda = (anguloBoca + 180) % 360

    const indiceBoca = this.indiceSobAngulo(anguloBoca)
    const indiceBunda = this.indiceSobAngulo(anguloBunda)

    if (indiceBoca === null || indiceBunda === null) return

    const boca = this.ordemExibicao[indiceBoca]
    this.onResultado({
      boca,
      bunda: this.ordemExibicao[indiceBunda],
      // Streak incluindo a vitoria desta rodada
      streak: (this.streakPorId.get(boca.id) ?? 0) + 1,
    })
  }
}
