# Retroteca

Central de jogos retrô para o PC (e, em breve, para a TV): mostra sua coleção de ROMs com capas,
logos e vídeos de prévia, e joga **dentro da própria interface**, navegando tudo pelo controle.

- Menu lateral por console, início com carrossel de destaques e prateleiras, biblioteca com lista e página do jogo
- Emulador embutido (EmulatorJS/libretro em WebAssembly): Game Boy, Game Boy Color, Game Boy Advance, Nintendo 64 e Nintendo DS
- Continua de onde parou: o progresso e a bateria do jogo ficam salvos no próprio HD
- Favoritos, "Continuar jogando" e tempo jogado
- Opcional: abrir um console no RetroArch instalado no PC (modo `nativo`)

Nenhuma ROM acompanha o projeto: use os seus próprios jogos.

## Requisitos

- Windows com Microsoft Edge ou Google Chrome
- [Node.js](https://nodejs.org) 18 ou mais novo (não há dependências npm)
- Uma pasta de jogos no formato do Batocera/EmulationStation:

```
E:\Jogos\
  gba\
    gamelist.xml          (nome, descrição, gênero, nota...)
    Jogo.zip
    images\ thumbs\ marquee\ videos\
  n64\ nds\ gb\ gbc\ ...
```

As ROMs podem estar em `.zip`. Os `gamelist.xml` são opcionais: sem eles o nome vem do arquivo.

## Instalação

```
node instalar-emulador.js
```

Baixa o EmulatorJS e os cores do npm para `public/emu/` (cerca de 25 MB, uma vez só).
Depois ajuste `romsDir` no `config.json` se a pasta de jogos não for `E:/Jogos`.

## Uso

- `Retroteca.bat`: abre em tela cheia (modo quiosque do Edge). Para sair, use "Sair" no menu ou Alt+F4.
- Ou `node serve.js` e abra http://localhost:8790

| Controle | Teclado | Ação |
|---|---|---|
| Direcional / analógico | Setas | Navegar |
| A | Enter | Abrir / confirmar |
| B | Esc | Voltar |
| Start | P | Jogar direto |
| Y | F | Favoritar |
| X | M | Som das prévias |
| LB / RB | Tab | Trocar de console |
| LT / RT | PageUp / PageDown | Pular letra na lista |

Dentro do jogo, **Start + Select** (ou Home, ou Esc) abre o menu: continuar, salvar progresso, voltar ao progresso salvo,
reiniciar e sair. Ao sair, o progresso é salvo sozinho.

Saves: `<romsDir>\_saves\<console>\` (bateria, `.srm`) e `<romsDir>\_states\<console>\` (progresso, `.state.auto`),
com os mesmos nomes do RetroArch, então valem nos dois modos.

## Levar no HD externo

```
powershell -ExecutionPolicy Bypass -File publicar-hd.ps1 -Destino E:\
```

Monta o HD para abrir em qualquer PC com Node.js, com dois cliques em `Retroteca.exe`:

```
E:\
  Retroteca.exe     lançador (sem janela de console; avisa se faltar o Node.js)
  Retroteca\        servidor, interface, emulador e fontes
  Jogos\            suas ROMs
```

No HD, o `config.json` aponta para `../Jogos`, então não importa a letra da unidade. Os favoritos e o histórico
ficam no próprio HD (`Retroteca\dados.json`) e são preservados ao publicar de novo. O lançador é compilado na hora
com o compilador C# que vem no Windows (fonte em `launcher/Retroteca.cs`). `Retroteca.exe --servidor` sobe só o servidor.

## Configuração (`config.json`)

Por console: `modo` (`web` = emulador embutido, `nativo` = RetroArch instalado), `coreWeb`, `threads`, `extensoes`.
Os cores com threads (N64 e DS) precisam do isolamento de origem que o `serve.js` já envia.

Para comparar desempenho: `jogar.html?id=...&core=desmume2015&threads=0`.

## Licenças

Código: MIT. Fontes Sora e Figtree: SIL OFL. EmulatorJS e cores (baixados à parte): GPL-3.
