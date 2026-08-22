import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const SRC_DIR = "dist/src"
const OUT_FILE = "dist/bundle.js"

function extrairImports(codigo) {
  const deps = []
  const regex = /import\s+[^"']*from\s+"\.\/([^"]+)\.js"/g
  let match
  while ((match = regex.exec(codigo)) !== null) {
    deps.push(match[1])
  }
  return deps
}

function ordenarTopologico(modulos) {
  const ordenados = []
  const visitando = new Set()
  const visitados = new Set()

  function visitar(nome) {
    if (visitados.has(nome)) return
    if (visitando.has(nome)) throw new Error(`Dependencia circular em ${nome}`)
    visitando.add(nome)
    for (const dep of modulos[nome].imports) {
      if (modulos[dep]) visitar(dep)
    }
    visitando.delete(nome)
    visitados.add(nome)
    ordenados.push(nome)
  }

  Object.keys(modulos).forEach(visitar)
  return ordenados
}

const arquivos = readdirSync(SRC_DIR).filter((f) => f.endsWith(".js") && f !== "bundle.js")
const modulos = {}

for (const arquivo of arquivos) {
  const nome = arquivo.replace(/\.js$/, "")
  const codigo = readFileSync(join(SRC_DIR, arquivo), "utf-8")
  modulos[nome] = { codigo, imports: extrairImports(codigo) }
}

const ordem = ordenarTopologico(modulos)

const codigoFinal = ordem
  .map((nome) => {
    let codigo = modulos[nome].codigo
    codigo = codigo.replace(/^import\s+[^"']*from\s+"[^"]*"\s*;\s*$/gm, "")
    codigo = codigo.replace(/^export\s+/gm, "")
    return `// === ${nome}.ts ===\n${codigo.trim()}`
  })
  .join("\n\n")

writeFileSync(OUT_FILE, `(() => {\n"use strict";\n${codigoFinal}\n})();\n`, "utf-8")
console.log(`Bundle gerado: ${OUT_FILE} (${ordem.length} modulos: ${ordem.join(", ")})`)
