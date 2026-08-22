export enum ModoJogo { VERDADE = "verdade", DESAFIO = "desafio", COMPLETO = "completo" }

export enum NivelPicancia { SFW = "sfw", MODERADO = "moderado", NSFW = "nsfw" }

export interface Participante {
  id: string
  nome: string
  cor?: string
}

export interface ConfigJogo {
  modo: ModoJogo
  nivel: NivelPicancia
  participantes: Participante[]
}

export interface EstadoJogo {
  config: ConfigJogo
  rodadaAtual: number
  vencedorAtual: Participante | null
  perguntasUsadas: string[]
}