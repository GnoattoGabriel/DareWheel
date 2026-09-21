export class Modal {
  private overlay: HTMLElement
  private isOpen: boolean = false
  private resolveFn: ((value: string | null) => void) | null = null
  private resolveConfirm: ((value: boolean) => void) | null = null
  private inputEl: HTMLInputElement
  private inputWrapper: HTMLElement

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

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        if (this.resolveConfirm !== null) {
          this.fecharConfirm(false)
        } else {
          this.fechar(null)
        }
      }
    })
  }

  private fechar(valor: string | null): void {
    if (!this.isOpen) return
    this.isOpen = false
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
    return new Promise((resolve) => {
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
    return new Promise((resolve) => {
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