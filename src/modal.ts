export class Modal {
  private overlay: HTMLElement
  private isOpen: boolean = false
  private resolveFn: ((value: string | null) => void) | null = null

  constructor() {
    this.overlay = document.createElement('div')
    this.overlay.className = 'modal-overlay'
    this.overlay.innerHTML = `
      <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h3 id="modal-title"></h3>
        <p id="modal-message"></p>
        <div class="modal-input-wrapper">
          <input type="text" id="modal-input" placeholder="Nome opcional" autocomplete="off" />
        </div>
        <div class="modal-buttons">
          <button class="modal-btn modal-cancel" type="button">Cancelar</button>
          <button class="modal-btn modal-confirm" type="button">Confirmar</button>
        </div>
      </div>`
    document.body.appendChild(this.overlay)

    this.overlay.querySelector('.modal-cancel')?.addEventListener('click', () => this.fechar(null))
    this.overlay.querySelector('.modal-confirm')?.addEventListener('click', () => {
      const input = this.overlay.querySelector('#modal-input') as HTMLInputElement | null
      this.fechar(input?.value?.trim() || null)
    })

    this.overlay.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).classList.contains('modal-overlay')) {
        this.fechar(null)
      }
    })

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.fechar(null)
      }
    })
  }

  private fechar(valor: string | null): void {
    if (!this.isOpen) return
    this.overlay.style.display = 'none'
    this.isOpen = false
    document.body.style.overflow = ''
    if (this.resolveFn) {
      this.resolveFn(valor)
      this.resolveFn = null
    }
  }

  open(titulo: string, mensagem: string, placeholder: string = 'Nome opcional'): Promise<string | null> {
    return new Promise((resolve) => {
      this.resolveFn = resolve

      const titleEl = this.overlay.querySelector('#modal-title') as HTMLElement
      const messageEl = this.overlay.querySelector('#modal-message') as HTMLElement
      const inputEl = this.overlay.querySelector('#modal-input') as HTMLInputElement

      titleEl.textContent = titulo
      messageEl.textContent = mensagem
      inputEl.placeholder = placeholder
      inputEl.value = ''

      this.overlay.style.display = 'flex'
      this.isOpen = true
      document.body.style.overflow = 'hidden'

      requestAnimationFrame(() => {
        inputEl.focus()
      })
    })
  }
}

export const modal = new Modal()