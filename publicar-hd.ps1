# Publica a Retroteca num HD externo, pronta para abrir com dois cliques:
#   <HD>\Retroteca.exe        lancador (sem janela de console)
#   <HD>\Retroteca\           app (servidor, interface, emulador, fontes)
#   <HD>\Jogos\               ROMs (formato Batocera) - config aponta para "../Jogos"
# Uso:  powershell -ExecutionPolicy Bypass -File publicar-hd.ps1 [-Destino E:\] [-PastaJogos Jogos]
# Republicar atualiza o codigo e preserva dados.json (favoritos, recentes, tempo) do HD.
# Arquivo 100% ASCII (PowerShell 5.1 le .ps1 sem BOM como ANSI).
param(
    [string]$Destino = 'E:\',
    [string]$PastaJogos = 'Jogos'
)
$ErrorActionPreference = 'Stop'
$raiz = $PSScriptRoot
$alvo = Join-Path $Destino 'Retroteca'
$build = Join-Path $raiz '.cache\launcher'
New-Item -ItemType Directory -Force $build | Out-Null

if (-not (Test-Path $Destino)) { throw "Destino $Destino nao existe (HD conectado?)" }
if (-not (Test-Path (Join-Path $Destino $PastaJogos))) { Write-Warning "Nao achei $(Join-Path $Destino $PastaJogos) - ajuste romsDir no config.json do HD." }

# ---------------------------------------------------------------- icone (R branco em quadrado vermelho, 256 px, PNG dentro do .ico)
Add-Type -AssemblyName System.Drawing
$ico = Join-Path $build 'retroteca.ico'
$bmp = New-Object System.Drawing.Bitmap 256, 256
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.TextRenderingHint = 'AntiAliasGridFit'
$g.Clear([System.Drawing.Color]::Transparent)
$caminho = New-Object System.Drawing.Drawing2D.GraphicsPath
$r = 56; $t = 240; $o = 8
$caminho.AddArc($o, $o, $r, $r, 180, 90); $caminho.AddArc($o + $t - $r, $o, $r, $r, 270, 90)
$caminho.AddArc($o + $t - $r, $o + $t - $r, $r, $r, 0, 90); $caminho.AddArc($o, $o + $t - $r, $r, $r, 90, 90)
$caminho.CloseFigure()
$g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(229, 9, 20))), $caminho)
$fonte = New-Object System.Drawing.Font 'Segoe UI Black', 150, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = 'Center'; $fmt.LineAlignment = 'Center'
$g.DrawString('R', $fonte, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF 0, 6, 256, 256), $fmt)
$g.Dispose()
$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$png = $ms.ToArray()
$bw = New-Object System.IO.BinaryWriter ([System.IO.File]::Create($ico))
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]1)           # cabecalho: 1 imagem
$bw.Write([Byte]0); $bw.Write([Byte]0); $bw.Write([Byte]0); $bw.Write([Byte]0) # 256x256 (0 = 256)
$bw.Write([UInt16]1); $bw.Write([UInt16]32); $bw.Write([UInt32]$png.Length); $bw.Write([UInt32]22)
$bw.Write($png); $bw.Close()

# ---------------------------------------------------------------- compila o lancador
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
$exe = Join-Path $build 'Retroteca.exe'
& $csc /nologo /target:winexe /optimize+ /codepage:65001 "/win32icon:$ico" "/out:$exe" /reference:System.Windows.Forms.dll (Join-Path $raiz 'launcher\Retroteca.cs')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar o lancador' }

# ---------------------------------------------------------------- emulador
if (-not (Test-Path (Join-Path $raiz 'public\emu\emulator.min.js'))) {
    Write-Host 'Emulador nao instalado; baixando...'
    & node (Join-Path $raiz 'instalar-emulador.js')
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar o emulador' }
}

# ---------------------------------------------------------------- copia o app
New-Item -ItemType Directory -Force $alvo | Out-Null
foreach ($d in 'public', 'fonts') {
    robocopy (Join-Path $raiz $d) (Join-Path $alvo $d) /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Falha ao copiar $d" }
}
foreach ($f in 'serve.js', 'instalar-emulador.js', 'LICENSE', 'README.md') { Copy-Item (Join-Path $raiz $f) $alvo -Force }

# config: pasta de jogos relativa ao app (a letra do HD muda de PC para PC)
$utf8 = New-Object System.Text.UTF8Encoding $false
$cfg = [System.IO.File]::ReadAllText((Join-Path $raiz 'config.json'), $utf8)
$cfg = [regex]::Replace($cfg, '"romsDir"\s*:\s*"[^"]*"', '"romsDir": "../' + $PastaJogos + '"')
[System.IO.File]::WriteAllText((Join-Path $alvo 'config.json'), $cfg, $utf8)

Copy-Item $exe (Join-Path $Destino 'Retroteca.exe') -Force
$mb = [math]::Round(((Get-ChildItem $alvo -Recurse -File | Measure-Object Length -Sum).Sum / 1MB), 1)
Write-Host "Pronto: $(Join-Path $Destino 'Retroteca.exe') + $alvo ($mb MB)"
