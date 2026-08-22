import { NivelPicancia } from "./types.js"

export type TipoPergunta = "verdade" | "consequencia"

/**
 * Bancos de perguntas de backup (usados quando a API falha, nao ha chave,
 * ou no nivel NSFW por custo/bloqueio). Toda pergunta do banco termina com
 * o sufixo "/bkp" para identificar a origem.
 */
export const BANCOS_PERGUNTAS: Record<NivelPicancia, Record<TipoPergunta, string[]>> = {
  [NivelPicancia.SFW]: {
    verdade: [
      "Qual seu maior medo irracional? /bkp",
      "Se você pudesse jantar com qualquer pessoa, viva ou morta, quem seria? /bkp",
      "Qual o melhor conselho que já recebeu? /bkp",
      "Qual foi a mentira mais boba que você contou quando criança? /bkp",
      "Que talento escondido você tem que quase ninguém conhece? /bkp",
      "Se você ganhar na loteria amanhã, qual é a primeira coisa compra? /bkp",
      "Qual é o apelido mais constrangedor que já teve? /bkp",
      "Qual comida você comeria todos os dias pelo resto da vida? /bkp",
      "Qual foi a coisa mais embaraçosa da sua infância? /bkp",
      "Se pudesse trocar de nome, qual nome escolheria? /bkp",
    ],
    consequencia: [
      "Imite alguém da roda e deixe os outros adivinharem quem é! /bkp",
      "Mande uma mensagem engraçada para o último contato do seu celular. /bkp",
      "Faça uma dança de 10 segundos sem música! /bkp",
      "Fale o alfabeto de trás para frente em 15 segundos ou perca a vez! /bkp",
      "Deixe a roda escolher seu novo status por 24 horas. /bkp",
      "Cante o refrão da última música que ouviu em voz alta! /bkp",
      "Finja ser um animal à sua escolha até alguém adivinhar qual é. /bkp",
      "Conte uma piada ruim — se ninguém rir, conte outra! /bkp",
      "Faça 10 polichinelos cantando! /bkp",
      "Deixe a pessoa à sua direita mexer no seu cabelo como quiser por 1 minuto. /bkp",
    ],
  },
  [NivelPicancia.MODERADO]: {
    verdade: [
      "Qual a maior mentira que já contou para conseguir sair de uma situação? /bkp",
      "Qual qualidade você mais admira nos seus amigos? /bkp",
      "Qual o maior risco que já assumiu? /bkp",
      "Você já teve um crush em alguém desta roda? Em quem? /bkp",
      "Qual foi a pior coisa que já fez bêbado(a)? /bkp",
      "Já stalkou o perfil de um ex depois do término? Por quanto tempo? /bkp",
      "Qual é o segredo mais vergonhoso que você guarda? /bkp",
      "Você já fingiu gostar de um presente? Qual? /bkp",
      "Qual mentira você contou que demorou mais para ser descoberta? /bkp",
      "Já traiu ou foi traído(a)? Como foi descobrir? /bkp",
    ],
    consequencia: [
      "Deixe alguém da roda postar algo no seu story! /bkp",
      "Ligue para alguém e diga 'eu te amo' sem explicar o contexto. /bkp",
      "Coma algo escolhido pela pessoa à sua esquerda! /bkp",
      "Mostre os últimos 5 áudios que enviou no WhatsApp. /bkp",
      "Ligue para o penúltimo contato do seu celular e cante tudo o que falar por 2 minutos! /bkp",
      "Revele a última foto da sua galeria para toda a roda. /bkp",
      "Envie 'preciso te contar uma coisa grave...' para um contato aleatório e deixe na dúvida. /bkp",
      "Deixe a roda ler suas últimas buscas no navegador. /bkp",
      "Faça uma declaração dramática de amor para o jogador à sua esquerda. /bkp",
      "Poste uma foto antiga e constrangedora sua nas redes sociais agora. /bkp",
    ],
  },
  [NivelPicancia.NSFW]: {
    verdade: [
      "Qual sua maior fantasia secreta? /bkp",
      "Qual a parte do seu corpo que mais gosta? /bkp",
      "Onde foi o lugar mais inusitado em que já transou? /bkp",
      "Quantas pessoas você já beijou em uma mesma noite? /bkp",
      "Qual é a coisa mais ousada que já fez em público? /bkp",
      "Você já ficou com alguém desta roda? Conte a história. /bkp",
      "Qual foi a experiência mais estranha que já teve na cama? /bkp",
      "Já mandou nude? Para quem e por quê? /bkp",
      "Qual seu ponto fraco que faz você perder a cabeça? /bkp",
      "O que você faria se soubesse que ninguém nunca ficaria sabendo? /bkp",
    ],
    consequencia: [
      "Sussurre algo ousado no ouvido da pessoa à sua direita. /bkp",
      "Deixe alguém da roda escolher uma foto constrangedora do seu celular para mostrar. /bkp",
      "Descreva seu último encontro em apenas 3 palavras para a roda. /bkp",
      "Deixe a roda fazer uma pergunta íntima — você não pode recusar. /bkp",
      "Troque uma peça de roupa visível com a pessoa à sua esquerda. /bkp",
      "Conte o detalhe mais picante que lembra sobre seu último encontro. /bkp",
      "Imite seu melhor 'olhar sedutor' e mantenha por 10 segundos sem rir. /bkp",
      "Mostre o aplicativo de mensagem mais recente e deixe a roda ver as notificações. /bkp",
      "Receba um elogio ousado de cada pessoa da roda sem reagir. /bkp",
      "Diga em voz alta qual é o tipo físico que mais te atrai, sem filtros. /bkp",
    ],
  },
}
