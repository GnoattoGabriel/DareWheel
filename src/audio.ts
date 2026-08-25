/**
 * Sons discretos do jogo via WebAudio - sem arquivos externos.
 * Contexto criado preguiçadamente na primeira interação (politica de
 * autoplay dos navegadores). Preferencia de mudo persistida no localStorage.
 */
const SOM_KEY = "darewheel_som"

class AudioJogo {
  private ctx: AudioContext | null = null
  private ultimoTick = 0

  private carregarMudo(): boolean {
    return localStorage.getItem(SOM_KEY) === "mudo"
  }

  public estaMudo(): boolean {
    return this.carregarMudo()
  }

  public alternarMudo(): boolean {
    const novoMudo = !this.estaMudo()
    localStorage.setItem(SOM_KEY, novoMudo ? "mudo" : "som")
    return novoMudo
  }

  private contexto(): AudioContext | null {
    if (this.estaMudo()) return null
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      this.ctx = new Ctor()
    }
    if (this.ctx.state === "suspended") void this.ctx.resume()
    return this.ctx
  }

  /**
   * Cria/resume o AudioContext DENTRO do gesto do usuario, antes do giro.
   * Sem isso os primeiros ticks se perdem: o resume() e assincrono e o
   * contexto acorda depois de os osciladores ja terem sido agendados.
   */
  public desbloquear(): void {
    this.contexto()
  }

  private nota(freq: number, duracaoSeg: number, volume: number, quando = 0, tipo: OscillatorType = "triangle"): void {
    const ctx = this.contexto()
    if (!ctx) return

    const osc = ctx.createOscillator()
    const ganho = ctx.createGain()
    const inicio = ctx.currentTime + quando

    osc.type = tipo
    osc.frequency.value = freq
    ganho.gain.setValueAtTime(0, inicio)
    ganho.gain.linearRampToValueAtTime(volume, inicio + 0.008)
    ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + duracaoSeg)

    osc.connect(ganho)
    ganho.connect(ctx.destination)
    osc.start(inicio)
    osc.stop(inicio + duracaoSeg + 0.05)
  }

  /**
   * Tick curto ao cruzar uma fatia. Taxa limitada para nao saturar
   * durante a fase rapida do giro.
   */
  public tick(): void {
    const agora = performance.now()
    if (agora - this.ultimoTick < 45) return
    this.ultimoTick = agora

    // Frequencia levemente aleatoria para nao ficar robotico
    const freq = 720 + Math.random() * 160
    this.nota(freq, 0.035, 0.045, 0, "square")
  }

  /** Arpejo suave de 3 notas ao revelar o vencedor. */
  public fanfarra(): void {
    this.nota(523.25, 0.14, 0.07, 0)     // C5
    this.nota(659.25, 0.14, 0.07, 0.1)   // E5
    this.nota(783.99, 0.22, 0.08, 0.2)   // G5
  }
}

export const audio = new AudioJogo()
