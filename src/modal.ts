export class Modal {
  private overlay: HTMLElement
  private isOpen: boolean = false
  private resolveFn: ((value: string | null) => void) | null = null
  private resolveConfirm: ((value: boolean) => void) | null = null
  private inputEl: HTMLInputElement
  private inputWrapper: HTMLElement
  private ultimoFoco: HTMLElement | null = null

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

    this.inputEl = this.overlay.querySelector('#modal-input') as HTMLInputElement
    this.inputWrapper = this.overlay.querySelector('.modal-input-wrapper') as HTMLElement

    this.overlay.querySelector('.modal-cancel')?.addEventListener('click', () => this.fechar(null))
    this.overlay.querySelector('.modal-confirm')?.addEventListener('click', () => {
      if (this.resolveConfirm !== null) {
        this.fecharConfirm(true)
      } else {
        const input = this.overlay.querySelector('#modal-input') as HTMLInputElement | null
        this.fechar(input?.value?.trim() || null)
      }
    })

    this.overlay.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).classList.contains('modal-overlay')) {
        if (this.resolveConfirm !== null) {
          this.fecharConfirm(false)
        } else {
          this.fechar(null)
        }
      }
    })

    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this.isOpen && this.resolveConfirm === null) {
        e.preventDefault()
        this.fechar(this.inputEl.value.trim() || null)
      }
    })

    document.addEventListener('keydown', (e) => {
      if (!this.isOpen) return
      if (e.key === 'Escape') {
        if (this.resolveConfirm !== null) {
          this.fecharConfirm(false)
        } else {
          this.fechar(null)
        }
        return
      }
      if (e.key !== 'Tab') return

      // Focus trap: o dialogo nao pode deixar o foco escapar para a pagina.
      const focaveis = Array.from(
        this.overlay.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')
      ).filter((el) => el.offsetParent !== null || el === this.inputEl)
      if (focaveis.length === 0) return
      const primeiro = focaveis[0]
      const ultimo = focaveis[focaveis.length - 1]
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault()
        primeiro.focus()
      }
    })
  }

  private restaurarFoco(): void {
    if (this.ultimoFoco?.isConnected) this.ultimoFoco.focus()
    this.ultimoFoco = null
  }

  private fechar(valor: string | null): void {
    if (!this.isOpen) return
    this.isOpen = false
    this.restaurarFoco()
    document.body.style.overflow = ''
    this.overlay.classList.remove('visivel')
    window.setTimeout(() => {
      if (this.isOpen) return
      this.overlay.classList.remove('aberto')
      this.overlay.style.display = 'none'
    }, 200)
    if (this.resolveFn) {
      this.resolveFn(valor)
      this.resolveFn = null
    }
  }

  private fecharConfirm(valor: boolean): void {
    if (!this.isOpen) return
    this.isOpen = false
    this.restaurarFoco()
    document.body.style.overflow = ''
    this.overlay.classList.remove('visivel')
    window.setTimeout(() => {
      if (this.isOpen) return
      this.overlay.classList.remove('aberto')
      this.overlay.style.display = 'none'
    }, 200)
    if (this.resolveConfirm) {
      this.resolveConfirm(valor)
      this.resolveConfirm = null
    }
  }

  open(titulo: string, mensagem: string, placeholder: string = 'Nome opcional'): Promise<string | null> {
    if (this.isOpen) return Promise.resolve(null)
    return new Promise((resolve) => {
      this.ultimoFoco = document.activeElement instanceof HTMLElement ? document.activeElement : null
      this.resolveFn = resolve
      this.resolveConfirm = null

      const titleEl = this.overlay.querySelector('#modal-title') as HTMLElement
      const messageEl = this.overlay.querySelector('#modal-message') as HTMLElement

      titleEl.textContent = titulo
      messageEl.textContent = mensagem
      this.inputEl.placeholder = placeholder
      this.inputEl.value = ''
      this.inputWrapper.style.display = 'block'

      this.overlay.style.display = 'flex'
      this.overlay.classList.add('aberto')
      this.isOpen = true
      document.body.style.overflow = 'hidden'

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.overlay.classList.add('visivel')
        })
        this.inputEl.focus()
      })
    })
  }

  confirm(titulo: string, mensagem: string): Promise<boolean> {
    if (this.isOpen) return Promise.resolve(false)
    return new Promise((resolve) => {
      this.ultimoFoco = document.activeElement instanceof HTMLElement ? document.activeElement : null
      this.resolveConfirm = resolve
      this.resolveFn = null

      const titleEl = this.overlay.querySelector('#modal-title') as HTMLElement
      const messageEl = this.overlay.querySelector('#modal-message') as HTMLElement

      titleEl.textContent = titulo
      messageEl.textContent = mensagem
      this.inputWrapper.style.display = 'none'

      this.overlay.style.display = 'flex'
      this.overlay.classList.add('aberto')
      this.isOpen = true
      document.body.style.overflow = 'hidden'

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.overlay.classList.add('visivel')
        })
        ;(this.overlay.querySelector('.modal-confirm') as HTMLElement)?.focus()
      })
    })
  }
}

export const modal = new Modal()