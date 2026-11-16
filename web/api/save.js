/* Saves na nuvem (Vercel Blob, store privado: os arquivos so saem por esta funcao).
 *   GET  /api/save?j=<jogo>&t=srm|state           -> bytes do save (404 se nao existe)
 *   GET  /api/save?j=<jogo>&t=srm|state&meta=1    -> { em } (quando foi salvo)
 *   PUT  /api/save?j=<jogo>&t=srm|state           -> grava e devolve { em }
 * Todas as horas sao do servidor, entao relogios diferentes entre aparelhos nao confundem.
 * O codigo de sincronizacao vem no cabecalho x-codigo e vira um hash: a pasta de cada pessoa
 * e saves/<sha256(codigo)>/, impossivel de achar sem o codigo. */
import { put, head, get } from '@vercel/blob';
import { createHash } from 'node:crypto';

const MAX = 4 * 1024 * 1024;   // limite de corpo das funcoes da Vercel e 4,5 MB; state de GBA tem < 1 MB

function caminho(req) {
    const u = new URL(req.url);
    const codigo = req.headers.get('x-codigo') || '';
    const jogo = u.searchParams.get('j') || '';
    const tipo = u.searchParams.get('t');
    if (codigo.length < 8) return { erro: 'Código de sincronização precisa ter pelo menos 8 caracteres' };
    if (!/^[\w\- ]{1,100}$/.test(jogo) || !['srm', 'state'].includes(tipo)) return { erro: 'Pedido inválido' };
    const pasta = createHash('sha256').update('retroteca:' + codigo).digest('hex');
    return { u, nome: `saves/${pasta}/${jogo}.${tipo}` };
}
const json = (obj, status = 200) => Response.json(obj, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(req) {
    const c = caminho(req);
    if (c.erro) return json({ erro: c.erro }, 400);
    if (c.u.searchParams.has('meta')) {
        try { return json({ em: new Date((await head(c.nome)).uploadedAt).getTime() }); }
        catch { return json({ erro: 'sem save' }, 404); }
    }
    // useCache: false le direto da origem, nunca uma versao antiga da CDN
    const r = await get(c.nome, { access: 'private', useCache: false });
    if (!r || !r.stream) return json({ erro: 'sem save' }, 404);
    return new Response(r.stream, { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' } });
}

export async function PUT(req) {
    const c = caminho(req);
    if (c.erro) return json({ erro: c.erro }, 400);
    const dados = new Uint8Array(await req.arrayBuffer());
    if (!dados.length || dados.length > MAX) return json({ erro: 'Tamanho inválido' }, 413);
    await put(c.nome, dados, { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/octet-stream' });
    const salvo = await head(c.nome);
    return json({ ok: true, em: new Date(salvo.uploadedAt).getTime() });
}
