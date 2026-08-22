# AGENTS.md — DareWheel

## Project structure

- **/** — TypeScript project (entry: `src/index.ts`, output: `dist/`)
- **`src/`** — Source TypeScript files (types, menu, wheel, levels [bancos /bkp], audio [WebAudio]; api e participants virao em sprints futuros)
- **`scripts/`** — build-bundle.mjs (bundle file://) e auditoria-contraste.mjs
- **`dist/`** — Compiled JavaScript output (never commit)
- **`.vscode/`** — VS Code configuration

## Critical setup commands

| Action | Command |
|--------|---------|
| Install deps | `npm install` |
| Build (tsc + bundle) | `npm run build` |
| Typecheck | `npx tsc --noEmit` |
| Rodar o jogo | Abrir `index.html` no navegador (duplo clique/file:// ou Live Server) — o bundle `dist/bundle.js` e script classico, funciona sem servidor |

## TypeScript config

- TypeScript 7.0.2 (port nativo) — opcoes descontinuadas do TS 6/7 causam erro no editor; nao usar `forceConsistentCasingInFileNames` nem `resolveJsonModule`
- `tsconfig.json`: `target: ES2020`, `module: ES2020`, `strict: true`
- `package.json`: `"type": "module"` — obrigatorio para o output ESM carregar via `<script type="module">`
- `esModuleInterop: true` for `import/export` compatibility across packages
- `skipLibCheck: true` to avoid library type errors

## VS Code

- Extensions recommended: `typescript-tools`, `esbenp.prettier-vscode`
- Settings auto-applied: `editor.formatOnSave`, `source.organizeImports`
- `.vscode/settings.json` committed — nao definir `typescript.tsdk` (incompativel com TS 7 nativo)
- Tip: use `Cmd+Shift+B` (or `F5`) to rebuild after TS changes

## Sprint-based Development (Scrum-style)

This project uses short sprints defined in `AGENTS.md`. Each sprint has:

| Sprint | Duracao | Foco Principal |
|--------|---------|----------------|
| 0 | 2 days | Setup inicial (já concluído) ✓ |
| 1 | 5 days | Menu principal + toggles + localStorage ✓ |
| 2 | 5 days | Roleta mecânica + cálculo de ângulo | Em andamento |
| 3 | 5 days | Níveis de picancia (SFW/Mod/NSFW) | Por vir |
| 4 | 5 days | API ChatGPT integration | Por vir |
| 5 | 5 days | Polishing, mobile, beta test | Por vir |

### Por sprint:
- Cada sprint tem *deliverables* claros e *definition of done* mensurável
- Para começar um sprint: verifique os checkboxes no AGENTS.md e o `tsconfig.json`
- Commits devem seguir: `git commit -m "feat: <curta descricao>"`
- Branch naming: `feature/<nome>` ou `bugfix/<nome>`

## Workflow

```bash
# 1. Build (compila e gera dist/bundle.js)
npm run build

# 2. Lint/typecheck
npx tsc --noEmit

# 3. Rodar: abrir index.html no navegador (browser-only, sem testes ainda)
```

### Bundle (file:// compatibility)

- `index.html` carrega `dist/bundle.js` como script classico (nao `<script type="module">`) — ES Modules sao bloqueados via file:// por CORS
- `scripts/build-bundle.mjs` concatena o output do tsc em ordem topologica de imports e remove `import`/`export`
- Novos arquivos em `src/` sao detectados automaticamente pelo script (nao precisa atualizar lista manual)

## Game-Specific Guidelines

### Modos de Jogo ( definidos em `src/types.ts` )

| Modo | Comportamento após roleta parar |
|------|--------------------------------|
| **Só Verdade** (`modo: "verdade"`) | Exibe pergunta via API/category: verdade imediatamente |
| **Só Desafio** (`modo: "desafio"`) | Exibe pergunta via API/category: desafio imediatamente |
| **Verdade ou Desafio** (`modo: "completo"`) | Apresenta prompt: "Verdade ou Desafio?" → usuário escolhe → pergunta exibida |

### Niveis de Picancia ( definidos em `src/types.ts` )

| Nivel | Descricao |
|-------|-----------|
| **SFW** (`nivel: "sfw"`) | Perguntas leves, apropriadas para todos, para quebrar o gelo |
| **Moderado** (`nivel: "moderado"`) | Perguntas pessoais, balanceamento leve/picante |
| **NSFW +18** (`nivel: "nsfw"`) | Perguntas explicitas — apenas maiores de 18 anos |

### Roleta ( `src/wheel.ts` — quando implementado )

- Tamanho escala por numero de jogadores: `raio = Math.min(200, 100 + qtd * 15)`
- Animacao: `transform: rotate(${anguloTotal}deg)` em 4s com `cubic-bezier(0.23, 1, 0.32, 1)`
- Roleta gira 2 voltas completas (+ angulo aleatorio 0-360) antes de parar
- Cada jogador tem espaco angular igual: `360 / qtdJogadores`
- `prefers-reduced-motion`: pular animacao e ir direto ao vencedor

### Persistencia

- Configuracoes salvas no `localStorage` chave `darewheel_config` (inclui participantes com cor fixa)
- Estado do jogo salvo em `darewheel_estado` (inclui `perguntasUsadas` anti-repeticao)
- Preferencia de som em `darewheel_som` ("som" | "mudo")
- Limpar `localStorage` se querer começar do zero

## Repository Conventions

### Commits

- Mensagens curtas em ingles: `feat: toggle de modos`, `fix: roleta nao gira no mobile`
- Prefixos: `feat:`, `fix:`, `doc:`, `style:`, `refactor:`, `test:`
- Issues referenciadas opcionalmente: `feat: novo menu (closes #12)`

### Pastas importantes

- `src/types.ts` — definicoes compartilhadas (enums, interfaces)
- `src/menu.ts` — controle principal de UI e config
- `src/participants.ts` — gerenciamento de nomes (ainda nao criado, sera criado no sprint 3)
- `src/wheel.ts` — mecânica da roleta (sprint 2)
- `src/api.ts` — integracao ChatGPT (sprint 4)
- `src/levels.ts` — bancos de perguntas por nivele (sprint 3)
- `src/estado.ts` — gerenciador de estado global (nao criado; estado atual vive em `src/menu.ts` via localStorage)

### Variaveis de ambiente

- `OPENAI_API_KEY` — configurar no painel Vercel (nunca commitar no codigo)
- Criar `.env.local` para desenvolvimento local quando a integracao API for implementada (sprint 4) — adicionar ao `.gitignore`

## Gotchas

- **No SonarQube** — este projeto nao usa SonarQube. O erro "Cannot connect to SonarQube" vem de outro repositorio.
- **`dist/` e `node_modules/`** — nunca commitar output compilado ou node_modules
- **TypeScript errors** — `npx tsc` deve ser verde antes de executar qualquer coisa
- **Mobile-first** — todas as novas features devem ser testadas em width < 640px
- **Roleta injusta em 2 jogadores** — com apenas 2 players, cada um tem 180°. O ângulo inicial aleatorio `0-360` garante probabilidade igual.
- **Custos API** — usar `gpt-3.5-turbo`; nivel NSFW usa banco proprio de perguntas (nao chama API para evitar custos/blocos)
- **Confirmacao de idade** — modo NSFW deve mostrar aviso na tela inicial antes de permitir jogar

## Recent Changes (Ultima sessao)

- Sprint 2 em andamento: roleta mecanica implementada em `src/wheel.ts` (animacao 4s, reduced-motion, calculo de vencedor)
- Correcoes: modo completo definido como padrao (`ativo` no index.html + fallback em `menu.ts`); config invalida no localStorage eliminada
- `tsconfig.json` limpo de opcoes descontinuadas do TS 7 (`forceConsistentCasingInFileNames`, `resolveJsonModule` removidas)
- `package.json` com `"type": "module"` e `main: dist/src/index.js`
- `.vscode/settings.json`: `typescript.tsdk` removido (incompativel com TS 7 nativo)
- Auditoria de interface: contraste dos botoes corrigido (>= 4.5:1), labels/aria-pressed/role=status adicionados, prompt de Verdade/Desafio substituido por botoes na tela, foco gerenciado nas trocas de view, estado vazio da lista, input 16px anti-zoom iOS
- Roleta virou jogo da garrafa: agulha de duas pontas gira no centro (>= 3 voltas + aleatorio), boca = quem responde, bunda = quem pergunta; a propria roleta e o botao de proxima rodada; roleta 400px/300px mobile
- Tema visual de jogo: fundo noite de festa, cards translucidos, fonte Fredoka, aro de lampadas piscando no giro, separadores brancos entre fatias, wobble da agulha, sons WebAudio discretos (tick/fanfarra, botao mute), contador de rodadas, streak 🔥xN, chips de cor por jogador (cor fixa persistida em Participante.cor)
- Sprint 3 concluido: `src/levels.ts` com bancos /bkp (6 categorias x 10 perguntas), anti-repeticao via perguntasUsadas, fallback consome o banco
- Jogadores sao emojis: seletor curado de 32 emojis (limite 8, sem duplicatas), emojis renderizados dentro das fatias, cor fixa por jogador (Participante.cor)