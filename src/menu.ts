import { ConfigJogo, EstadoJogo, ModoJogo, NivelPicancia, Participante } from "./types.js"
import { ResultadoGiro, Wheel } from "./wheel.js"
import { BANCOS_PERGUNTAS, TipoPergunta } from "./levels.js"
import { audio } from "./audio.js"
import { pedirPergunta } from "./api.js"
import { modal } from "./modal.js"

const PALETA = Wheel.PALETA_CORES

export class Menu {
  private static readonly EMOJIS_DISPONIVEIS = [
    "😈", "🦄", "👽", "🤖", "🐸", "🦃", "🍕", "💀",
    "🌮", "🐧", "🦖", "⭐", "🔥", "🍀", "🎯", "🚀",
    "🐼", "🦊", "🐨", "🦁", "🐷", "🐵", "🐶", "🐱",
    "🦉", "🐙", "🦈", "🌈", "👑", "🧙", "🥑", "🍩",
  ]
  private static readonly MAX_PARTICIPANTES = 8
  private readonly configKey = "darewheel_config"

  private readonly estadoKey = "darewheel_estado"

  private wheel: Wheel | null = null
  private rerollUsos: number = 0
  private readonly maxReroll: number = 3
  private wheelVencedor: Participante | null = null
  private escolhaPendente: Participante | null = null
  private ultimoTipo: "verdade" | "consequencia" = "verdade"
  private perguntasUsadas: Set<string> = new Set()
  private rodadaAtual: number = 1

  constructor() {
    this.inicializar()
  }

  private inicializar(): void {
    this.carregarConfig()
    this.carregarPerguntasUsadas()
    this.adicionarEventListeners()
    // Aplica a config efetiva mesmo sem localStorage: normaliza avisos,
    // aria-pressed, botao iniciar, picker e lista de participantes
    this.aplicarConfig(
      this.obterConfig() ?? {
        modo: ModoJogo.COMPLETO,
        nivel: NivelPicancia.SFW,
        participantes: [],
      }
    )
    // Migra jogadores antigos que ficaram sem cor persistida
    this.migrarCoresLegadas()
  }

  /**
   * Jogadores criados antes do sistema de cores ficam com chip cinza.
   * Atribui uma cor livre da paleta e persiste.
   */
  private migrarCoresLegadas(): void {
    const config = this.obterConfig()
    if (!config) return

    if (!config.participantes.some((p) => !p.cor)) return

    const usadas = new Set(config.participantes.map((p) => p.cor).filter(Boolean))
    const migrados = config.participantes.map((p) => {
      if (p.cor) return p
      const cor = PALETA.find((c) => !usadas.has(c)) ?? "#999"
      usadas.add(cor)
      return { ...p, cor }
    })

    this.salvarConfig({ ...config, participantes: migrados })
  }

  private carregarPerguntasUsadas(): void {
    const salvo = localStorage.getItem(this.estadoKey)
    if (!salvo) return
    try {
      const parsed = JSON.parse(salvo) as Partial<EstadoJogo>
      if (Array.isArray(parsed.perguntasUsadas)) {
        this.perguntasUsadas = new Set(parsed.perguntasUsadas)
      }
    } catch (erro) {
      console.error("Estado corrompido no localStorage - perguntas usadas descartadas", erro)
    }
  }

  private carregarConfig(): void {
    const salvo = localStorage.getItem(this.configKey)
    if (salvo) {
      const config: ConfigJogo = JSON.parse(salvo)
      this.aplicarConfig(config)
    }
  }

  private salvarConfig(config: ConfigJogo): void {
    localStorage.setItem(this.configKey, JSON.stringify(config))
    this.aplicarConfig(config)
  }

  private aplicarConfig(config: ConfigJogo): void {
    // Atualizar DOM - modos (usar data-attr selector, não getElementById)
    const modoBotoes = document.querySelectorAll('.modo-toggle')
    modoBotoes.forEach((btn) => btn.classList.remove('ativo'))

    const modoSelecionado = document.querySelector(`.modo-toggle[data-modo="${config.modo}"]`)
    if (modoSelecionado instanceof HTMLElement) {
      modoSelecionado.classList.add('ativo')
    }

    // Nível de picancia
    const nivelBotoes = document.querySelectorAll('.nivel-toggle')
    nivelBotoes.forEach((btn) => btn.classList.remove('ativo'))

    const nivelSelecionado = document.querySelector(`.nivel-toggle[data-nivel="${config.nivel}"]`)
    if (nivelSelecionado instanceof HTMLElement) {
      nivelSelecionado.classList.add('ativo')
    }

    // Estado acessivel dos toggles
    document.querySelectorAll('.modo-toggle, .nivel-toggle').forEach((btn) => {
      btn.setAttribute('aria-pressed', btn.classList.contains('ativo') ? 'true' : 'false')
    })

    // Aviso NSFW visivel apenas quando o nivel nsfw esta selecionado
    const avisoNsfw = document.querySelector('.aviso-nsfw') as HTMLElement | null
    if (avisoNsfw) {
      avisoNsfw.style.display = config.nivel === NivelPicancia.NSFW ? 'block' : 'none'
    }

    // Dica de escolha visivel apenas no modo completo
    const avisoCompleto = document.querySelector('.aviso-completo') as HTMLElement | null
    if (avisoCompleto) {
      avisoCompleto.style.display = config.modo === ModoJogo.COMPLETO ? 'block' : 'none'
    }

    // Atualizar lista de participantes
    this.atualizarParticipantes(config.participantes)

    // Habilitar botão iniciar se tiver participantes
    const btnIniciar = document.getElementById('btn-iniciar') as HTMLButtonElement | null
    if (btnIniciar) {
      btnIniciar.disabled = config.participantes.length < 2
    }
  }

  private atualizarParticipantes(participantes: Participante[]): void {
    const lista = document.getElementById('participantes-lista')
    if (!lista) return

    if (participantes.length === 0) {
      lista.innerHTML =
        '<p class="lista-vazia">Nenhum participante ainda — escolha pelo menos 2 emojis para começar.</p>'
    } else {
      lista.innerHTML = participantes
        .map(
          (p) =>
            `<div class="participante-item" data-id="${p.id}" data-cor="${p.cor ?? ""}" data-display-name="${p.displayName ?? ""}">
                 <span class="chip-cor" style="background:${p.cor ?? "#999"}" aria-hidden="true"></span>
                 <span class="participante-emoji">${p.nome}</span>
                 <button class="remover-participante" data-id="${p.id}" aria-label="Remover jogador ${p.nome}">×</button>
             </div>`
        )
        .join("")

      // Adicionar event listeners para remover
      document.querySelectorAll('.remover-participante').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation()
          const idAttr = btn.getAttribute('data-id')
          if (idAttr) {
            this.removerParticipante(idAttr)
          }
        })
      })
    }

    // Picker sempre sincronizado com o estado atual
    this.renderizarEmojiPicker()
  }

  /**
   * Renderiza a grade de emojis. Emojis ja usados ficam desabilitados;
   * ao atingir o limite de jogadores, todos os demais desabilitam.
   */
  private renderizarEmojiPicker(): void {
    const picker = document.getElementById('emoji-picker')
    if (!picker) return

    const config = this.obterConfig()
    const usados = new Set(config?.participantes.map((p) => p.nome))
    const cheio = (config?.participantes.length ?? 0) >= Menu.MAX_PARTICIPANTES

    picker.replaceChildren()
    for (const emoji of Menu.EMOJIS_DISPONIVEIS) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'emoji-opcao'
      btn.textContent = emoji
      const indisponivel = cheio || usados.has(emoji)
      btn.disabled = indisponivel
      btn.setAttribute('aria-label', `Adicionar jogador ${emoji}`)
      if (!indisponivel) {
        btn.addEventListener('click', () => this.adicionarParticipante(emoji))
      }
      picker.appendChild(btn)
    }

    const dica = document.querySelector('.picker-dica')
    if (dica) {
      dica.textContent = cheio
        ? `limite de ${Menu.MAX_PARTICIPANTES} jogadores atingido`
        : 'escolha um emoji para adicionar um jogador'
    }
  }

  private removerParticipante(id: string): void {
    const configAtual = this.obterConfig()
    if (!configAtual) return

    const filtrados = configAtual.participantes.filter((p) => p.id !== id)
    this.salvarConfig({ ...configAtual, participantes: filtrados })
  }

  // Event listeners
  private adicionarEventListeners(): void {
    // Toggles de modo
    document.querySelectorAll('.modo-toggle').forEach((btn) => {
      const elemento = btn as HTMLElement
      elemento.addEventListener('click', () => this.selecionarModo(elemento))
    })

    // Toggles de nível
    document.querySelectorAll('.nivel-toggle').forEach((btn) => {
      const elemento = btn as HTMLElement
      elemento.addEventListener('click', () => this.selecionarNivel(elemento))
    })

    // Botão iniciar
    const btnIniciar = document.getElementById('btn-iniciar') as HTMLButtonElement | null
    if (btnIniciar) {
      btnIniciar.addEventListener('click', () => this.iniciarJogo())
    }

    // Botão proxima rodada = a propria roleta
    const btnRoleta = document.getElementById('btn-roleta') as HTMLButtonElement | null
    if (btnRoleta) {
      btnRoleta.addEventListener('click', () => this.proximaRodada())
    }

    // Botão Reroll
    const btnReroll = document.getElementById('btn-reroll') as HTMLButtonElement | null
    if (btnReroll) {
      btnReroll.addEventListener('click', () => this.handleReroll())
    }

    // Botão Voltar ao Menu
    const btnVoltar = document.getElementById('btn-voltar') as HTMLButtonElement | null
    if (btnVoltar) {
      btnVoltar.addEventListener('click', () => this.voltarAoMenu())
    }

    // Botão de som (preferencia persistida)
    const btnSom = document.getElementById('btn-som') as HTMLButtonElement | null
    if (btnSom) {
      this.atualizarBotaoSom(btnSom)
      btnSom.addEventListener('click', () => {
        audio.alternarMudo()
        this.atualizarBotaoSom(btnSom)
      })
    }

    // Escolha Verdade/Desafio (modo completo)
    const btnEscolhaVerdade = document.getElementById('btn-escolha-verdade') as HTMLButtonElement | null
    const btnEscolhaDesafio = document.getElementById('btn-escolha-desafio') as HTMLButtonElement | null
    if (btnEscolhaVerdade) {
      btnEscolhaVerdade.addEventListener('click', () => void this.resolverEscolha("verdade"))
    }
    if (btnEscolhaDesafio) {
      btnEscolhaDesafio.addEventListener('click', () => void this.resolverEscolha("consequencia"))
    }
  }

  private atualizarBotaoSom(btn: HTMLButtonElement): void {
    const mudo = audio.estaMudo()
    btn.textContent = mudo ? "🔇" : "🔊"
    btn.setAttribute('aria-label', mudo ? 'Ativar som' : 'Silenciar som')
    btn.setAttribute('aria-pressed', mudo ? 'false' : 'true')
  }

  private selecionarModo(btn: HTMLElement): void {
    // Remover ativo de todos os modos
    document.querySelectorAll('.modo-toggle').forEach((b) => b.classList.remove('ativo'))
    btn.classList.add('ativo')

    const modoAttr = btn.getAttribute('data-modo')
    if (!modoAttr) return
    const modo: ModoJogo = modoAttr as ModoJogo

    const config: ConfigJogo = {
      modo,
      nivel: this.obterConfig()?.nivel || NivelPicancia.SFW,
      participantes: this.obterConfig()?.participantes || [],
    }
    this.salvarConfig(config)
  }

  private selecionarNivel(btn: HTMLElement): void {
    // Remover ativo de todos os níveis
    document.querySelectorAll('.nivel-toggle').forEach((b) => b.classList.remove('ativo'))
    btn.classList.add('ativo')

    const nivelAttr = btn.getAttribute('data-nivel')
    if (!nivelAttr) return
    const nivel: NivelPicancia = nivelAttr as NivelPicancia

    const config: ConfigJogo = {
      modo: this.obterConfig()?.modo || ModoJogo.COMPLETO,
      nivel,
      participantes: this.obterConfig()?.participantes || [],
    }
    this.salvarConfig(config)
  }

  private adicionarParticipante(emoji: string): void {
    const configAtual = this.obterConfig() ?? {
      modo: ModoJogo.COMPLETO,
      nivel: NivelPicancia.SFW,
      participantes: [],
    }

    if (configAtual.participantes.length >= Menu.MAX_PARTICIPANTES) return
    if (configAtual.participantes.some((p) => p.nome === emoji)) return

    modal
      .open(
        "Nome do Jogador",
        `Digite um nome para ${emoji} (opcional, apenas para a legenda ao lado da roleta).`,
        "Nome opcional"
      )
      .then((displayName) => {
        const usadas = new Set(configAtual.participantes.map((p) => p.cor))
        const cor = PALETA.find((c) => !usadas.has(c))

        const novoParticipante: Participante = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          nome: emoji,
          displayName: displayName || undefined,
          cor,
        }
        const participantes = [...configAtual.participantes, novoParticipante]

        this.salvarConfig({ ...configAtual, participantes })
      })
  }

  private async iniciarJogo(): Promise<void> {
    const config = this.obterConfig()
    if (!config || config.participantes.length < 2) {
      alert("Adicione pelo menos 2 participantes para iniciar o jogo!")
      return
    }

    // Verificar idade para modo NSFW
    if (config.nivel === NivelPicancia.NSFW) {
      const confirmado = await modal.confirm(
        "Confirmação de Idade",
        "Você tem 18 anos ou mais? Este modo contém perguntas explícitas para maiores de 18 anos.\n\nAo confirmar, você declara ter a idade mínima permitida."
      )
      if (!confirmado) {
        alert("Jogo não iniciado. Selecione outro nível de picância.")
        return
      }
    }

    // Esconder menu, mostrar área do jogo
    this.esconderMenu()

    // Resetar contador de reroll
    this.rerollUsos = 0
    this.atualizarBotaoReroll(false)

    // Salvar estado inicial do jogo
    const estado: EstadoJogo = {
      config,
      rodadaAtual: 1,
      vencedorAtual: null,
      perguntasUsadas: [],
    }
    localStorage.setItem(this.estadoKey, JSON.stringify(estado))

    // Contador de rodadas
    this.atualizarContadorRodadas(1)

    // Mostrar a área do jogo ANTES de girar - transições CSS não iniciam
    // em elementos dentro de display:none
    const areaJogo = document.getElementById('area-jogo') as HTMLElement
    if (areaJogo) {
      areaJogo.style.display = 'block'
    }

    // Focar no wrapper da roleta (focavel via tabindex="-1")
    const wrapper = document.querySelector('.roleta-wrapper') as HTMLElement | null
    if (wrapper) {
      wrapper.focus()
    }

    // Inicializar e girar após o primeiro paint da área do jogo,
    // garantindo que exista estilo computado para animar
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.inicializarRoleta(config.participantes)
      })
    })
  }

  private esconderMenu(): void {
    const menu = document.getElementById('menu-principal')
    if (menu) menu.style.display = 'none'
  }

  private voltarAoMenu(): void {
    // Esconder área do jogo
    const areaJogo = document.getElementById('area-jogo') as HTMLElement
    if (areaJogo) {
      areaJogo.style.display = 'none'
    }

    // Limpar pergunta e resultado
    const perguntaElem = document.getElementById('pergunta') as HTMLElement
    const resultadoElem = document.getElementById('resultado') as HTMLElement
    if (perguntaElem) {
      perguntaElem.style.display = 'none'
      perguntaElem.replaceChildren()
    }
    if (resultadoElem) {
      resultadoElem.style.display = 'none'
      resultadoElem.textContent = ''
    }

    // Esconder escolha de modo pendente
    const escolha = document.getElementById('escolha-modo') as HTMLElement | null
    if (escolha) escolha.style.display = 'none'
    this.escolhaPendente = null

    // Limpar legenda
    const legenda = document.getElementById('legenda-participantes')
    if (legenda) legenda.innerHTML = ''

    // Mostrar menu e devolver o foco para um elemento visivel
    const menu = document.getElementById('menu-principal')
    if (menu) menu.style.display = ''

    const btnIniciar = document.getElementById('btn-iniciar') as HTMLButtonElement | null
    if (btnIniciar) btnIniciar.focus()

    // Resetar wheel
    this.wheel = null
  }

  private obterConfig(): ConfigJogo | null {
    const elementoModoAtivo = document.querySelector('.modo-toggle.ativo') as HTMLElement | null
    const elementoNivelAtivo = document.querySelector('.nivel-toggle.ativo') as HTMLElement | null

    if (!elementoModoAtivo || !elementoNivelAtivo) return null

    const modoAttr = elementoModoAtivo.getAttribute('data-modo')
    const nivelAttr = elementoNivelAtivo.getAttribute('data-nivel')

    if (!modoAttr || !nivelAttr) return null

    return {
      modo: modoAttr as ModoJogo,
      nivel: nivelAttr as NivelPicancia,
      participantes: this.obterParticipantes(),
    }
  }

  private obterParticipantes(): Participante[] {
    const itens = document.querySelectorAll('.participante-item')
    return Array.from(itens).map((item) => {
      // Leitura por CLASSE: o primeiro span generico e o chip de cor (sem texto)
      const nomeElem = item.querySelector('.participante-emoji')
      const nome = nomeElem ? nomeElem.textContent || '' : ''
      const idAttr = item.getAttribute('data-id')
      const id = idAttr || Date.now().toString()
      const cor = item.getAttribute('data-cor') || undefined
      const displayName = item.getAttribute('data-display-name') || undefined
      return cor || displayName ? { id, nome, cor, displayName: displayName || undefined } : { id, nome }
    })
  }

  private inicializarRoleta(participantes: Participante[]): void {
    // Criar a instancia da roleta - nasce PARADA; o primeiro giro parte
    // do clique do jogador na propria roleta (garante audio e intencionalidade)
    this.wheel = new Wheel(
      'roda',
      'agulha',
      (resultado: ResultadoGiro) => void this.procesarVencedor(resultado),
      participantes,
      true // respeitarReducedMotion
    )
    this.renderizarLegenda(participantes)
  }

  private renderizarLegenda(participantes: Participante[]): void {
    const container = document.getElementById('legenda-participantes')
    if (!container) return

    if (participantes.length === 0) {
      container.innerHTML = ''
      return
    }

    container.innerHTML = participantes
      .map((p) => {
        const nome = p.displayName ? `${p.displayName} ${p.nome}` : p.nome
        return `<span class="legenda-item" style="color:${p.cor || '#999'}">${nome}</span>`
      })
      .join(' &nbsp;|&nbsp; ')
  }

  private configAtual: ConfigJogo = {
    modo: ModoJogo.COMPLETO,
    nivel: NivelPicancia.SFW,
    participantes: [],
  }

  private async procesarVencedor(resultado: ResultadoGiro): Promise<void> {
    const boca = resultado.boca        // quem responde (pergunta gerada para ele)
    const bunda = resultado.bunda      // quem pergunta

    // Fanfarra discreta ao revelar o vencedor
    audio.fanfarra()

    // Armazenar o vencedor no estado
    this.configAtual = this.obterConfig() || this.configAtual
    const estado = localStorage.getItem(this.estadoKey)
    const parsedEstado = estado ? JSON.parse(estado) : {
      config: this.configAtual,
      rodadaAtual: 1,
      vencedorAtual: null,
      perguntasUsadas: [],
    }

    // Numero da rodada em exibicao: a contagem so avanca DEPOIS do resultado
    // (primeira rodada mostra "Rodada 1", nao "Rodada 2")
    const numeroRodada = parsedEstado.rodadaAtual || 1

    parsedEstado.vencedorAtual = boca
    this.wheelVencedor = boca  // Armazenar para usar no reroll
    parsedEstado.rodadaAtual = numeroRodada + 1

    // Reduzir peso do respondedor sorteado (x0.75, piso 0.2) - demais ganham chance proporcional
    this.wheel?.aplicarVitoria(boca.id)

    // Exibir resultado com os dois papeis e indicador de streak
    this.exibirResultadoRoleta(boca, bunda, resultado.streak)
    this.atualizarContadorRodadas(numeroRodada)

    // Esconder reroll ate a pergunta aparecer
    this.atualizarBotaoReroll(false)

    // Gerar pergunta conforme o modo selecionado (para quem esta na boca)
    if (this.configAtual.modo === ModoJogo.COMPLETO) {
      // Limpar pergunta anterior antes de apresentar a escolha
      const perguntaAnterior = document.getElementById('pergunta') as HTMLElement | null
      if (perguntaAnterior) {
        perguntaAnterior.style.display = 'none'
        perguntaAnterior.replaceChildren()
      }
      // Modo completo: usuario escolhe Verdade ou Desafio na tela
      this.perguntarVerdadeOuDesafio(boca)
    } else {
      const tipo: "verdade" | "consequencia" =
        this.configAtual.modo === ModoJogo.DESAFIO ? "consequencia" : "verdade"
      this.exibirCarregando()
      try {
        this.ultimoTipo = tipo
        const pergunta = await this.gerarPergunta(boca.nome, tipo, this.configAtual.nivel)
        this.exibirPergunta(pergunta, this.configAtual)
      } catch (erro) {
        console.error("Erro ao gerar pergunta", erro)
        const fallback = this.obterPerguntaFallback(boca.nome, tipo, this.configAtual.nivel)
        this.exibirPergunta(fallback, this.configAtual)
      }
    }

    // Salvar estado atualizado (incluindo perguntas de banco ja usadas)
    parsedEstado.perguntasUsadas = Array.from(this.perguntasUsadas)
    localStorage.setItem(this.estadoKey, JSON.stringify(parsedEstado))
  }

  private perguntarVerdadeOuDesafio(vencedor: Participante): void {
    this.escolhaPendente = vencedor
    const container = document.getElementById('escolha-modo') as HTMLElement | null
    const texto = document.getElementById('escolha-pergunta') as HTMLElement | null

    if (!container || !texto) {
      // Nunca auto-resolver: sem os elementos, a escolha fica indisponivel
      console.error("Elementos de escolha de modo não encontrados - escolha indisponível")
      this.escolhaPendente = null
      return
    }

    texto.textContent = `Para ${vencedor.nome}: verdade ou desafio?`
    this.definirBotoesEscolha(true)
    container.style.display = 'block'
  }

  private definirBotoesEscolha(habilitados: boolean): void {
    for (const id of ['btn-escolha-verdade', 'btn-escolha-desafio']) {
      const btn = document.getElementById(id) as HTMLButtonElement | null
      if (btn) btn.disabled = !habilitados
    }
  }

  /** Estado de espera visivel enquanto a API gera a pergunta */
  private exibirCarregando(): void {
    const perguntaElem = document.getElementById('pergunta') as HTMLElement | null
    if (!perguntaElem) return

    perguntaElem.replaceChildren()
    const p = document.createElement('p')
    p.className = 'pergunta-carregando'
    p.textContent = 'Gerando pergunta…'
    perguntaElem.appendChild(p)
    perguntaElem.style.display = 'flex'
  }

  private async resolverEscolha(tipo: "verdade" | "consequencia"): Promise<void> {
    const vencedor = this.escolhaPendente

    const container = document.getElementById('escolha-modo') as HTMLElement | null
    if (container) container.style.display = 'none'
    this.definirBotoesEscolha(false)
    this.escolhaPendente = null

    if (!vencedor) {
      console.error("resolverEscolha chamado sem escolha pendente")
      return
    }

    const config = this.obterConfig() || this.configAtual
    this.ultimoTipo = tipo
    this.exibirCarregando()

    try {
      const pergunta = await this.gerarPergunta(vencedor.nome, tipo, config.nivel)
      this.exibirPergunta(pergunta, config)
    } catch (erro) {
      console.error("Erro ao gerar pergunta", erro)
      const fallback = this.obterPerguntaFallback(vencedor.nome, tipo, config.nivel)
      this.exibirPergunta(fallback, config)
    }
  }

  private async gerarPerguntaAPI(nome: string, tipo: "verdade" | "consequencia", nivel: NivelPicancia): Promise<string> {
    // Proxy serverless na Vercel - qualquer falha propaga e o chamador
    // cai no banco /bkp. Perguntas da IA entram no historico anti-repeticao.
    const pergunta = await pedirPergunta({
      nome,
      tipo,
      nivel,
      ultimas: [...this.perguntasUsadas].slice(-15),
    })
    this.perguntasUsadas.add(pergunta)
    return pergunta
  }

  /**
   * Seleciona uma pergunta do banco de backup (sufixo /bkp) evitando
   * repeticoes na sessao. Recicla a categoria quando esgotar.
   */
  private selecionarPerguntaBanco(tipo: TipoPergunta, nivel: NivelPicancia): string | null {
    const banco = BANCOS_PERGUNTAS[nivel]?.[tipo]
    if (!banco || banco.length === 0) return null

    let disponiveis = banco.filter((q) => !this.perguntasUsadas.has(q))
    if (disponiveis.length === 0) {
      // Categoria esgotada - recicla e comeca de novo
      for (const q of banco) this.perguntasUsadas.delete(q)
      disponiveis = [...banco]
    }

    const escolhida = disponiveis[Math.floor(Math.random() * disponiveis.length)]
    this.perguntasUsadas.add(escolhida)
    return escolhida
  }

  private obterPerguntaFallback(nome: string, tipo: "verdade" | "consequencia", nivel: NivelPicancia): string {
    void nome // mantido na assinatura para uso futuro pela API
    const chaveTipo: TipoPergunta = tipo === "verdade" ? "verdade" : "consequencia"

    return (
      this.selecionarPerguntaBanco(chaveTipo, nivel) ??
      (chaveTipo === "verdade"
        ? "Qual a qualidade que você mais valoriza em um amigo?"
        : "Faça 10 polichinelos agora!")
    )
  }

  private exibirResultadoRoleta(boca: Participante, bunda: Participante, streak: number): void {
    const resultadoElem = document.getElementById('resultado') as HTMLElement | null
    if (!resultadoElem) return

    // Linha 1: quem responde (+ streak); linha 2: quem pergunta
    const fogo = streak >= 2 ? ` 🔥×${streak}` : ""
    const linha1 = document.createElement('strong')
    linha1.textContent = `A rodada pertence a: ${boca.nome}!${fogo}`
    const linha2 = document.createElement('span')
    linha2.className = 'resultado-papel'
    linha2.textContent = `${bunda.nome} faz a pergunta`

    resultadoElem.replaceChildren(linha1, document.createElement('br'), linha2)
    resultadoElem.style.display = 'block'

    // Pop-in do card
    resultadoElem.classList.remove('pop-in')
    void resultadoElem.offsetWidth
    resultadoElem.classList.add('pop-in')
  }

  private atualizarContadorRodadas(rodada: number): void {
    const contador = document.getElementById('contador-rodadas')
    if (contador) contador.textContent = `Rodada ${rodada}`
  }

  private getRodadaAtual(): number {
    const estado = localStorage.getItem(this.estadoKey)
    if (estado) {
      try {
        const parsed = JSON.parse(estado) as Partial<EstadoJogo>
        if (typeof parsed.rodadaAtual === 'number') {
          // O valor armazenado é a próxima rodada (incrementado após cada giro).
          // Para exibição e lógica de padrão, usamos o número da rodada atual (armazenado - 1).
          this.rodadaAtual = Math.max(1, parsed.rodadaAtual - 1)
          return this.rodadaAtual
        }
      } catch {
        // ignora erro
      }
    }
    return this.rodadaAtual
  }

  private deveUsarBanco(): boolean {
    const rodada = this.getRodadaAtual()
    if (rodada < 20) {
      return false
    }
    const posicao = (rodada - 20) % 3
    return posicao === 0 || posicao === 1
  }

  private async gerarPergunta(nome: string, tipo: "verdade" | "consequencia", nivel: NivelPicancia): Promise<string> {
    if (this.deveUsarBanco()) {
      const pergunta = this.selecionarPerguntaBanco(tipo, nivel)
      if (pergunta) {
        this.perguntasUsadas.add(pergunta)
        return pergunta
      }
    }
    try {
      const pergunta = await this.gerarPerguntaAPI(nome, tipo, nivel)
      return pergunta
    } catch (erro) {
      console.error("Erro ao gerar pergunta via API, caindo no banco", erro)
      const fallback = this.selecionarPerguntaBanco(tipo, nivel)
      if (fallback) {
        this.perguntasUsadas.add(fallback)
        return fallback
      }
      return tipo === "verdade"
        ? "Qual a qualidade que você mais valoriza em um amigo?"
        : "Faça 10 polichinelos agora!"
    }
  }

  private exibirPergunta(pergunta: string, config: ConfigJogo): void {
    const perguntaElem = document.getElementById('pergunta') as HTMLElement | null
    const areaJogo = document.getElementById('area-jogo') as HTMLElement | null

    if (perguntaElem) {
      // Construir via DOM - texto da API nunca e injetado como HTML.
      // Perguntas do banco carregam o sufixo /bkp: vira tag visual,
      // o texto exibido fica limpo. Perguntas da IA nao tem marcacao.
      const SUFIXO_BANCO = ' /bkp'
      const doBanco = pergunta.endsWith(SUFIXO_BANCO)
      const textoLimpo = doBanco ? pergunta.slice(0, -SUFIXO_BANCO.length) : pergunta

      perguntaElem.replaceChildren()
      const p = document.createElement('p')
      const strong = document.createElement('strong')
      strong.textContent = textoLimpo
      p.appendChild(strong)

      if (doBanco) {
        const tag = document.createElement('span')
        tag.className = 'origem-banco'
        tag.textContent = '📦 banco de perguntas'
        p.appendChild(tag)
      }

      perguntaElem.appendChild(p)
      perguntaElem.style.display = 'flex'
    }

    if (areaJogo) {
      areaJogo.style.display = 'block'
    }

    // Reroll aparece junto com a pergunta
    this.atualizarBotaoReroll(true)
  }

  private exibirPerguntaFallback(vencedor: Participante, config: ConfigJogo): void {
    const tipoFallback = config.modo === ModoJogo.DESAFIO ? "consequencia" : "verdade"
    const pergunta = this.obterPerguntaFallback(vencedor.nome, tipoFallback as "verdade" | "consequencia", config.nivel)
    this.exibirPergunta(pergunta, config)
  }

  private proximaRodada(): void {
    // Esconder a pergunta atual, preparar para nova rodada
    const perguntaElem = document.getElementById('pergunta') as HTMLElement
    const resultadoElem = document.getElementById('resultado') as HTMLElement

    if (perguntaElem) {
      perguntaElem.style.display = 'none'
      perguntaElem.replaceChildren()
    }
    if (resultadoElem) {
      resultadoElem.style.display = 'none'
      resultadoElem.textContent = ''
    }

    // Garantir escolha pendente encerrada
    const escolha = document.getElementById('escolha-modo') as HTMLElement | null
    if (escolha) escolha.style.display = 'none'
    this.escolhaPendente = null

    // Resetar reroll para nova rodada (aparece de novo quando a pergunta carregar)
    this.rerollUsos = 0
    this.atualizarBotaoReroll(false)

    // Desbloquear audio dentro do gesto do clique (antes do giro comecar)
    audio.desbloquear()

    // Girar a roleta novamente
    this.girarRoletaNovamente()
  }

  private girarRoletaNovamente(): void {
    if (!this.wheel) return

    const config = this.obterConfig()
    const participantes = config?.participantes || this.obterParticipantes()
    if (participantes.length < 2) {
      alert("Precisa ter participantes para girar a roleta!")
      return
    }

    this.wheel.girar(participantes)
    this.renderizarLegenda(participantes)
  }

  private async handleReroll(): Promise<void> {
    if (this.rerollUsos >= this.maxReroll) return

    this.rerollUsos++
    this.atualizarBotaoReroll()

    // Gerar nova pergunta/desafio mantendo o mesmo participante e config
    const config = this.obterConfig()
    if (!config || !this.wheelVencedor) return

    // Gerar nova pergunta usando o mesmo tipo da rodada atual
    this.exibirCarregando()
    try {
      const pergunta = await this.gerarPergunta(this.wheelVencedor.nome, this.ultimoTipo, config.nivel)
      this.exibirPergunta(pergunta, config)
    } catch (erro) {
      console.error("Erro ao reroll pergunta", erro)
      const fallback = this.obterPerguntaFallback(this.wheelVencedor.nome, this.ultimoTipo, config.nivel)
      this.exibirPergunta(fallback, config)
    }
  }

  /**
   * Atualiza o botão de reroll. Visivel apenas quando ha pergunta na tela
   * e ainda restam usos - troca a pergunta sem girar a roleta.
   */
  private atualizarBotaoReroll(visivel: boolean = true): void {
    const btn = document.getElementById('btn-reroll') as HTMLButtonElement | null
    if (!btn) return

    const restantes = this.maxReroll - this.rerollUsos
    btn.textContent = `Trocar pergunta (${restantes}/${this.maxReroll})`
    btn.disabled = this.rerollUsos >= this.maxReroll
    btn.style.display = visivel && restantes > 0 ? 'block' : 'none'
  }
}