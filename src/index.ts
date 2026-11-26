import { Menu } from "./menu.js"

document.addEventListener("DOMContentLoaded", () => {
  new Menu()
  ativarMeteoroRaro()
})

/** Easter egg: tres ativacoes do titulo soltam um meteoro com o numero 67. */
function ativarMeteoroRaro(): void {
  const titulo = document.getElementById("titulo-jogo")
  const meteoro = document.getElementById("meteoro-raro")
  if (!titulo || !meteoro) return

  let cliques = 0

  const registrarClique = (): void => {
    cliques += 1
    if (cliques < 3) return

    cliques = 0
    meteoro.classList.remove("disparado")
    void meteoro.offsetWidth
    meteoro.classList.add("disparado")
  }

  titulo.addEventListener("click", registrarClique)
  titulo.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter" || evento.key === " ") {
      evento.preventDefault()
      registrarClique()
    }
  })

  meteoro.addEventListener("animationend", () => {
    meteoro.classList.remove("disparado")
  })
}
