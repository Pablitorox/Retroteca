/* Baixa o EmulatorJS e os cores (WebAssembly) do npm e monta public/emu/.
 *   node instalar-emulador.js
 * - junta os fontes do EmulatorJS num unico emulator.min.js (o pacote npm nao traz o minificado;
 *   sem ele o loader cai no modo debug, que desliga caches e loga tudo no console)
 * - copia so o necessario: compressao (zip/7z), cores e relatorios dos cores
 * Licenca do EmulatorJS e dos cores: GPL-3 (ver emu/LICENSE). */
const fs = require('fs'), path = require('path'), { execFileSync, execSync } = require('child_process');

const VERSAO = '4.2.3';
const CORES = ['gambatte', 'mgba', 'mupen64plus_next', 'melonds', 'desmume2015'];
const here = __dirname;
const destino = path.join(here, 'public', 'emu');
const tmp = path.join(here, '.cache', 'emu-download');

function npmPack(pacote) {
    // nomes fixos (sem entrada do usuario), por isso o comando montado em texto e seguro
    const nome = execSync('npm pack ' + pacote + '@' + VERSAO + ' --silent', { cwd: tmp })
        .toString().trim().split(/\r?\n/).pop();
    const pasta = path.join(tmp, nome.replace(/\.tgz$/, ''));
    fs.mkdirSync(pasta, { recursive: true });
    execFileSync('tar', ['-xzf', path.join(tmp, nome), '-C', pasta]);
    return path.join(pasta, 'package');
}
function copiar(de, para) { fs.mkdirSync(path.dirname(para), { recursive: true }); fs.copyFileSync(de, para); }

fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });
fs.rmSync(destino, { recursive: true, force: true });

console.log('EmulatorJS ' + VERSAO + '...');
const ejs = npmPack('@emulatorjs/emulatorjs');
const data = path.join(ejs, 'data');
// mesma ordem do loader.js
const fontes = ['emulator.js', 'nipplejs.js', 'shaders.js', 'storage.js', 'gamepad.js', 'GameManager.js', 'socket.io.min.js', 'compression.js'];
const bundle = fontes.map(f => '/* ' + f + ' */\n' + fs.readFileSync(path.join(data, 'src', f), 'utf8')).join('\n;\n');
fs.mkdirSync(destino, { recursive: true });
fs.writeFileSync(path.join(destino, 'emulator.min.js'), bundle);
copiar(path.join(data, 'emulator.css'), path.join(destino, 'emulator.min.css'));
copiar(path.join(data, 'loader.js'), path.join(destino, 'loader.js'));
copiar(path.join(data, 'version.json'), path.join(destino, 'version.json'));
copiar(path.join(ejs, 'LICENSE'), path.join(destino, 'LICENSE'));
for (const f of ['extract7z.js', 'extractzip.js']) copiar(path.join(data, 'compression', f), path.join(destino, 'compression', f));

for (const c of CORES) {
    console.log('core ' + c + '...');
    const p = npmPack('@emulatorjs/core-' + c);
    for (const f of fs.readdirSync(p)) if (f.endsWith('-wasm.data')) copiar(path.join(p, f), path.join(destino, 'cores', f));
    for (const f of fs.readdirSync(path.join(p, 'reports'))) copiar(path.join(p, 'reports', f), path.join(destino, 'cores', 'reports', f));
}
fs.rmSync(tmp, { recursive: true, force: true });

let total = 0;
(function soma(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) soma(p); else total += fs.statSync(p).size; } })(destino);
console.log('Pronto: ' + destino + ' (' + (total / 1048576).toFixed(1) + ' MB)');
