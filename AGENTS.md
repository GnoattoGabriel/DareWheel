# AGENTS.md — DareWheel

## Project structure

- **/** — TypeScript project (entry: `src/index.ts`, output: `dist/`)
- **`public/`** — Estáticos servidos pela Vercel (`index.html`, `styles/`, `dist/bundle.js` gerado no build)
- **`src/`** — Source TypeScript files (types, menu, wheel, levels [bancos /bkp], audio [WebAudio], api [cliente do proxy])
- **`api/`** — Funções serverless Vercel (`pergunta.js` = proxy OpenAI)
- **`scripts/`** — build-bundle.mjs (bundle file://), dev-local.mjs (servidor dev), auditoria-contraste.mjs e verifica-banco.mjs (integridade dos bancos /bkp)
- **`dist/`** — Output do tsc (intermediário, never commit)
- **`.vscode/`** — VS Code configuration

## Critical setup commands

| Action | Command |
|--------|---------|
| Install deps | `npm install` |
| Build (tsc + bundle) | `npm run build` |
| Typecheck | `npx tsc --noEmit` |
| Rodar o jogo | Abrir `public/index.html` no navegador (duplo clique/file:// ou Live Server) — o bundle `public/dist/bundle.js` e script classico, funciona sem servidor |

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
| 2 | 5 days | Roleta mecânica + cálculo de ângulo ✓ |
| 3 | 5 days | Níveis de picancia (SFW/Mod/NSFW) + bancos /bkp ✓ |
| 4 | 5 days | API ChatGPT via proxy serverless Vercel ✓ |
| 5 | 5 days | Polishing, mobile, beta test | Por vir |

### Por sprint:
- Cada sprint tem *deliverables* claros e *definition of done* mensurável
- Para começar um sprint: verifique os checkboxes no AGENTS.md e o `tsconfig.json`
- Commits devem seguir: `git commit -m "feat: <curta descricao>"`
- Branch naming: `feature/<nome>` ou `bugfix/<nome>`

## Workflow

```bash
# 1. Build (compila e gera public/dist/bundle.js)
npm run build

# 2. Lint/typecheck
npx tsc --noEmit

# 3. Rodar: abrir index.html no navegador (browser-only, sem testes ainda)
```

### Testando a API localmente (sem deploy)

O jogo via `file://` (abra `public/index.html`) sempre usa o banco /bkp —
para exercitar o proxy da IA localmente:

```bash
npm run dev:local   # servidor Node proprio em http://localhost:3000
```

Serve `public/` + executa as funcoes reais de `api/`, lendo `.env.local`
(chaves `GEMINI_API_KEY=AIza...` e `OPENROUTER_API_KEY=sk-or-...`, ja
ignoradas pelo git). Abrir `http://localhost:3000` roda o jogo completo com IA real.

> **Nota:** o `vercel dev` oficial pode TRAVAR nas funções `/api/*` no
> Windows (estáticos servem, requisições à função ficam pendentes sem log)
> — por isso existe o `dev-local.mjs`. O deploy de produção na Vercel não
> é afetado.

Smoke test sem navegador:

```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/pergunta -Method Post `
  -ContentType "application/json" `
  -Body '{"tipo":"verdade","nivel":"moderado","nome":"🔥","ultimas":[]}'
```

Erro 429 `insufficient_quota`/rate limit = limites do plano gratis atingidos;
o jogo cai no banco /bkp normalmente.

### Bundle (file:// compatibility)

- `public/index.html` carrega `dist/bundle.js` como script classico (nao `<script type="module">`) — ES Modules sao bloqueados via file:// por CORS
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
- `src/api.ts` — cliente do proxy de perguntas (timeout 8s, lanca erro em falha)
- `api/pergunta.js` — funcao serverless Vercel (proxy para a OpenAI; chave nunca vai ao cliente)
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
- **Arquitetura da API** — cliente chama `/api/pergunta` (proxy serverless na Vercel); chaves `GEMINI_API_KEY` e `OPENROUTER_API_KEY` vivem so nas env vars do painel (local via `.env.local` para `dev-local.mjs`). Cadeia por nivel: SFW/Moderado = `gemini-flash-lite-latest` → `gemini-flash-latest` → `openrouter/free`; **NSFW comeca pelo OpenRouter** (`nvidia/nemotron-3-ultra`) porque o free tier do Gemini bloqueia saida explicita (finishReason SAFETY, inconfiguravel mesmo com threshold OFF). Resposta sempre em pt-BR, JSON com extracao em 3 camadas + heuristica anti-vazamento. Anti-repeticao: as ultimas 5 perguntas vao no prompt
- **Limites de cota** — Gemini free tier: ~1.500 req/dia (Flash-Lite), reset meia-noite Pacific, sem cartao; OpenRouter free: 50/dia (1.000 apos US$ 10 unicos), reset meia-noite UTC. 429 e respostas invalidas caem no banco /bkp automaticamente
- **NSFW via API** — os 3 niveis chamam a API (desde sprint 4); recusa/vazio do modelo cai no banco /bkp automaticamente
- **Origem da pergunta** — perguntas do banco mostram tag "📦 banco de perguntas"; perguntas da IA nao tem marcacao. Sufixo `/bkp` nunca aparece cru no texto
- **Confirmacao de idade** — modo NSFW deve mostrar aviso na tela inicial antes de permitir jogar

## Recent Changes (Ultima sessao)

- Migracao de provedor: Gemini nativo como caminho rapido (flash-lite ~1s/request) com OpenRouter de reserva; cadeia condicionada ao nivel (NSFW via Nemotron Ultra); safetySettings BLOCK_ONLY_HIGH no Gemini; smoke tests 6/6 aceitos (0,9s-3,8s)
- Sprint 4 concluido: `api/pergunta.js` (proxy serverless, OpenRouter com cadeia de modelos gratuitos, JSON mode) + `src/api.ts` (cliente timeout 8s); os 3 niveis chamam a API; ultimas 5 perguntas vao no prompt (anti-repeticao); tag "📦 banco de perguntas" substitui o sufixo /bkp cru na exibicao
- Rebrand para DareWheel: titulo/h1/package.json/localStorage keys (`darewheel_config|estado|som`)/AGENTS.md; repo github.com/GnoattoGabriel/DareWheel com `main` (prod) + `dev`; `vercel.json` com buildCommand `npm run build` e estaticos em `public/` (convencao da plataforma)
- Sprint 3 concluido: `src/levels.ts` com bancos /bkp, anti-repeticao via perguntasUsadas, fallback consome o banco; banco NSFW expandido para 50 verdades + 50 desafios (total do jogo: 140 perguntas)
- Jogadores sao emojis: seletor curado de 32 emojis (limite 8, sem duplicatas), emojis renderizados dentro das fatias, cor fixa por jogador (Participante.cor)
## Roadmap

### Critico (concluido)
- [x] Merge dev -> main com correcao da API em producao (export POST nomeado)
- [x] GEMINI_API_KEY configurada no painel Vercel
- [x] Producao validada manualmente: IA respondendo, som no primeiro giro, giros consistentes

### Sprint 5 - Polimento e beta (em andamento)
- [ ] Beta test com pessoas reais (celular + desktop), coletando feedback
- [ ] Revisao de UX mobile jogando de verdade (< 640px)
- [ ] Ajustes visuais/fluxos apontados pelo beta

### Backlog (nao bloqueante)
- [ ] Ampliar bancos SFW e Moderado /bkp (hoje 10+10 cada)
- [ ] Extrair src/estado.ts e src/participants.ts (refatoracoes previstas)
- [ ] Substituir window.confirm do aviso NSFW por modal proprio no estilo do jogo
- [ ] Favicon + meta tags og para compartilhamento
- [ ] CI simples nos PRs (GitHub Actions: tsc --noEmit + build)
- [ ] Perguntas personalizadas criadas pelos jogadores (misturar com IA/banco; opcional modo "so minhas perguntas")
