/* Servidor de teste local da versao web (sem Vercel):
 *   node dev.mjs   ->  http://localhost:8791
 * Serve public/ e simula /api/save em memoria (os saves somem ao fechar). */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORTA = 8791, raiz = path.join(import.meta.dirname, 'public');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const nuvem = new Map();

http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/api/save') {
        const cod = req.headers['x-codigo'] || '', chave = cod + '/' + u.searchParams.get('j') + '.' + u.searchParams.get('t');
        if (cod.length < 8) { res.writeHead(400); return res.end('{"erro":"codigo curto"}'); }
        if (req.method === 'PUT') {
            const partes = [];
            req.on('data', p => partes.push(p)).on('end', () => {
                const em = Date.now(); nuvem.set(chave, { dados: Buffer.concat(partes), em });
                res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, em }));
            });
            return;
        }
        const s = nuvem.get(chave);
        if (!s) { res.writeHead(404); return res.end('{"erro":"sem save"}'); }
        if (u.searchParams.has('meta')) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ em: s.em })); }
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); return res.end(s.dados);
    }
    const arq = path.join(raiz, path.normalize(u.pathname === '/' ? '/index.html' : decodeURIComponent(u.pathname)));
    if (!arq.startsWith(raiz) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arq)] || 'application/octet-stream' });
    fs.createReadStream(arq).pipe(res);
}).listen(PORTA, () => console.log('Retroteca web: http://localhost:' + PORTA));
