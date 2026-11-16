# Retroteca Web (Vercel)

Versão enxuta da Retroteca para rodar no navegador, hospedada na Vercel: **Game Boy, Game Boy Color e Game Boy Advance**.

- As ROMs são escolhidas do aparelho (no Android/iPhone o seletor mostra o Google Drive) e ficam **só no navegador** (IndexedDB). Nada de ROM no servidor.
- Os saves (`.srm` e progresso) ficam no navegador e, com um **código de sincronização**, também na nuvem (Vercel Blob, privado). Ao abrir um jogo, o save mais recente vence, então dá para trocar de navegador ou aparelho.
- Emulador: EmulatorJS 4.2.3 (cores `mgba` e `gambatte`), carregado da CDN oficial `cdn.emulatorjs.org`.
- Celular: controle virtual na tela e botão ☰ para o menu. PC: teclado ou controle, como na Retroteca original.

## Publicar na Vercel

1. Suba esta branch para o GitHub.
2. Na Vercel: **Add New → Project**, importe o repositório e em **Root Directory** escolha `web`. Framework: *Other*. Deploy.
3. No projeto: **Storage → Create → Blob**, escolha acesso **Private** e conecte ao projeto. A variável `BLOB_READ_WRITE_TOKEN` é criada sozinha.
4. **Deployments → Redeploy** para a função pegar o token.

## Usar

1. Abra o site e toque em **+ Adicionar jogos**.
2. Toque em **Nuvem** e defina um código de sincronização (mínimo 8 caracteres, difícil de adivinhar). Use o mesmo código em todos os navegadores.
3. Jogue. O save vai para a nuvem a cada 30 s (se mudou), ao salvar pelo menu, ao sair e quando a aba vai para segundo plano.

Não jogue o mesmo jogo em dois aparelhos ao mesmo tempo: o último a salvar vence.

## Testar localmente

```
node web/dev.mjs
```

Abre em http://localhost:8791 com uma nuvem simulada em memória.
