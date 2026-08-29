import { readFileSync } from "node:fs"

const codigo = readFileSync("src/levels.ts", "utf8")
// Remove comentarios de linha para nao confundir com itens do banco
const semComentarios = codigo.split("\n").filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("/*") && !l.trim().startsWith("//")).join("\n")

// Extrai arrays do banco NSFW
const secaoNsfw = semComentarios.split("[NivelPicancia.NSFW]")[1]
const extrair = (chave) => {
  const bloco = secaoNsfw.split(`${chave}: [`)[1].split("],")[0]
  return [...bloco.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1])
}
const nsfwVerdade = extrair("verdade")
const nsfwConsequencia = extrair("consequencia")

// Extrai arrays SFW e Moderado
const secaoSfw = semComentarios.split("[NivelPicancia.SFW]")[1].split("[NivelPicancia.MODERADO]")[0]
const secaoModerado = semComentarios.split("[NivelPicancia.MODERADO]")[1].split("[NivelPicancia.NSFW]")[0]
const extrairSecao = (secao, chave) => {
  const bloco = secao.split(`${chave}: [`)[1].split("],")[0]
  return [...bloco.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1])
}
const sfwVerdade = extrairSecao(secaoSfw, "verdade")
const sfwConsequencia = extrairSecao(secaoSfw, "consequencia")
const moderadoVerdade = extrairSecao(secaoModerado, "verdade")
const moderadoConsequencia = extrairSecao(secaoModerado, "consequencia")

let falhas = 0
const checar = (nome, cond, detalhe) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${nome}${detalhe ? ` (${detalhe})` : ""}`)
  if (!cond) falhas++
}

checar("NSFW verdade = 50", nsfwVerdade.length === 50, String(nsfwVerdade.length))
checar("NSFW consequencia = 50", nsfwConsequencia.length === 50, String(nsfwConsequencia.length))
checar("SFW verdade = 50", sfwVerdade.length === 50, String(sfwVerdade.length))
checar("SFW consequencia = 50", sfwConsequencia.length === 50, String(sfwConsequencia.length))
checar("Moderado verdade = 50", moderadoVerdade.length === 50, String(moderadoVerdade.length))
checar("Moderado consequencia = 50", moderadoConsequencia.length === 50, String(moderadoConsequencia.length))

const todos = [...sfwVerdade, ...sfwConsequencia, ...moderadoVerdade, ...moderadoConsequencia, ...nsfwVerdade, ...nsfwConsequencia]
const duplicatas = todos.filter((q, i) => todos.indexOf(q) !== i)
checar("Zero duplicatas globais", duplicatas.length === 0, duplicatas.slice(0, 3).join(" | "))

const semSuffixo = todos.filter((q) => !q.endsWith(" /bkp"))
checar("Todos terminam com ' /bkp'", semSuffixo.length === 0, semSuffixo.slice(0, 3).join(" | "))

const curtas = todos.filter((q) => q.replace(" /bkp", "").length < 15)
checar("Nenhuma pergunta muito curta (<15 chars)", curtas.length === 0, curtas.slice(0, 3).join(" | "))

console.log(`\nTotal de perguntas no banco: ${todos.length} (SFW ${sfwVerdade.length + sfwConsequencia.length} + Moderado ${moderadoVerdade.length + moderadoConsequencia.length} + NSFW ${nsfwVerdade.length + nsfwConsequencia.length})`)
process.exit(falhas > 0 ? 1 : 0)

