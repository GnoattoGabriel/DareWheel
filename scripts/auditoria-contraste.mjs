// Auditoria de contraste do tema escuro (WCAG)
function srgb(v) {
  v /= 255
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}
function lum(hex) {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => srgb(parseInt(h.slice(i, i + 2), 16)))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function ratio(a, b) {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}
function hex(r, g, b) { return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('') }
function blend(topo, alpha, baixo) {
  const p = (h, i) => parseInt(h.replace('#', '').slice(i, i + 2), 16)
  return hex(
    p(topo, 0) * alpha + p(baixo, 0) * (1 - alpha),
    p(topo, 2) * alpha + p(baixo, 2) * (1 - alpha),
    p(topo, 4) * alpha + p(baixo, 4) * (1 - alpha),
  )
}

const FUNDO_CLARO = '#2b1b5e'   // extremo mais claro do gradiente
const CARD = blend('#ffffff', 0.07, FUNDO_CLARO)          // superficie do card
const TOGGLE_BG = blend('#ffffff', 0.06, FUNDO_CLARO)     // toggle inativo
const AVISO_BG = blend('#8b0000', 0.35, CARD)             // aviso nsfw sobre card

const pares = [
  ['texto principal', '#f0eef8', FUNDO_CLARO],
  ['texto suave (dicas/avisos)', '#cfcbe6', FUNDO_CLARO],
  ['texto sobre card', '#f0eef8', CARD],
  ['suave sobre card', '#cfcbe6', CARD],
  ['toggle inativo: texto/bg efetivo', '#f0eef8', TOGGLE_BG],
  ['toggle ativo: branco/teal', '#ffffff', '#2c7a7b'],
  ['aviso nsfw', '#ffb4b4', AVISO_BG],
  ['resultado: branco/teal (topo)', '#ffffff', '#2d8182'],
]

let falhas = 0
for (const [nome, fg, bg] of pares) {
  const r = ratio(fg, bg)
  const ok = r >= 4.5
  if (!ok) falhas++
  console.log(`${nome}: ${r.toFixed(2)}:1 ${ok ? 'OK' : 'FALHA'}`)
}
console.log(falhas === 0 ? 'TODOS OS PARES >= 4.5:1' : `FALHAS: ${falhas}`)
