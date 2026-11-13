/* Retroteca - interface: menu lateral + inicio com carrossel + biblioteca lista/pagina.
 * Gamepad: A abrir, B voltar, X som, Y favorito, Start jogar, LB/RB console, LT/RT letra. API em serve.js. */
(function () {
    'use strict';

    var E = {
        sistemas: [], jogos: [], porId: new Map(), dados: { recentes: [], favoritos: [], tempo: {}, vezes: {} },
        emulador: null, quiosque: false,
        vista: 'inicio', foco: null, memPalco: null,
        sel: null, genero: {}, ordem: {}, busca: '',
        jogando: null, mudo: false
    };
    // sem som por padrao; so liga se o usuario escolher no menu
    E.mudo = true;
    try { E.mudo = localStorage.getItem('retroteca.mudo') !== '0'; } catch (e) {}

    var ICO = {
        casa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/></svg>',
        estrela: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/></svg>',
        estrelaV: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/></svg>',
        lupa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.8-4.8"/></svg>',
        play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12-7.5z"/></svg>',
        sair: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 3v9M6.3 6.8a8 8 0 1 0 11.4 0"/></svg>',
        somOn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>',
        somOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/></svg>',
        info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>'
    };
    var SIGLA = { gb: 'GB', gbc: 'GBC', gba: 'GBA', n64: 'N64', nds: 'DS' };

    // ------------------------------------------------------------ utilidades
    var $ = function (s, r) { return (r || document).querySelector(s); };
    function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }
    function html(tag, cls, h) { var n = el(tag, cls); n.innerHTML = h; return n; }
    function api(url, corpo) {
        return fetch(url, corpo ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) } : {})
            .then(function (r) { return r.json(); });
    }
    function aviso(t) { var a = $('#aviso'); a.textContent = t; a.classList.add('on'); clearTimeout(aviso.t); aviso.t = setTimeout(function () { a.classList.remove('on'); }, 3800); }
    function sys(id) { return E.sistemas.find(function (s) { return s.id === id; }) || { id: id, nome: id, curto: id }; }
    function fav(id) { return E.dados.favoritos.indexOf(id) >= 0; }
    function normal(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
    function duracao(seg) { if (!seg) return '—'; var h = Math.floor(seg / 3600), m = Math.round(seg % 3600 / 60); return h ? h + ' h ' + m + ' min' : Math.max(1, m) + ' min'; }
    function haQuanto(ms) { if (!ms) return 'Nunca'; var d = Math.floor((Date.now() - ms) / 864e5); return d <= 0 ? 'Hoje' : d === 1 ? 'Ontem' : 'Há ' + d + ' dias'; }
    function ultimaVez(id) { var r = E.dados.recentes.find(function (x) { return x.id === id; }); return r ? r.quando : 0; }
    function sorteioDoDia(lista, n, sal) {
        var d = new Date(), s = d.getFullYear() * 1000 + d.getMonth() * 40 + d.getDate() + (sal || 0);
        function rnd() { s = (s * 9301 + 49297) % 233280; return s / 233280; }
        var a = lista.slice();
        for (var i = a.length - 1; i > 0; i--) { var k = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[k]; a[k] = t; }
        return a.slice(0, n);
    }
    function inicial(j) { var c = normal(j.nome).charAt(0); return /[a-z]/.test(c) ? c.toUpperCase() : '#'; }
    function meta(j, extra) {
        var m = el('div', 'meta');
        m.appendChild(el('span', 'tag-sys', sys(j.sys).nome));
        if (j.ano) m.appendChild(el('span', '', j.ano));
        if (j.genero) m.appendChild(el('span', '', j.genero));
        if (j.jogadores && j.jogadores !== '1') m.appendChild(el('span', '', j.jogadores + ' jogadores'));
        if (j.nota && extra !== false) m.appendChild(el('span', 'nota', '★ ' + j.nota.toFixed(1)));
        return m;
    }

    // midia com video atrasado (fundo desfocado + caixa ate o video comecar)
    function midia(j, atraso) {
        var box = el('div', 'dest-midia');
        var fundo = el('div', 'dest-fundo');
        if (j.capa) fundo.style.backgroundImage = 'url("' + j.capa + '")';
        box.appendChild(fundo);
        if (j.capa) { var c = el('img', 'dest-caixa'); c.src = j.capa; c.alt = ''; box.appendChild(c); }
        var v = el('video');
        v.loop = true; v.playsInline = true; v.preload = 'none';
        box.appendChild(v);
        if (j.video) box._t = setTimeout(function () {
            v.src = j.video; v.muted = E.mudo; v.volume = 0.45;
            v.onplaying = function () { v.classList.add('on'); box.classList.add('com-video'); };
            v.play().catch(function (e) { if (e && e.name === 'NotAllowedError') { v.muted = true; v.play().catch(function () {}); } });
        }, atraso);
        return box;
    }
    function pararMidia(raiz) {
        (raiz || document).querySelectorAll('.dest-midia').forEach(function (b) {
            clearTimeout(b._t);
            var v = b.querySelector('video'); if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
        });
    }
    function logoOuTitulo(j, pai) {
        var t = el('h1', '', j.nome);
        if (j.logo) {
            var l = el('img', 'dest-logo'); l.alt = j.nome; l.src = j.logo;
            l.onerror = function () { l.replaceWith(t); };
            pai.appendChild(l);
        } else pai.appendChild(t);
    }

    // ------------------------------------------------------------ menu lateral
    function montarRail() {
        var nav = $('#railItens'); nav.innerHTML = '';
        function item(id, ico, nome, sub) {
            // Buscar e um div porque vira um <input> (input dentro de <button> nao recebe foco)
            var b = el(id === 'buscar' ? 'div' : 'button', 'rail-item f c-' + id);
            b.dataset.vista = id;
            b.appendChild(html('span', 'rail-ico', ico));
            var t = el('span', 'rail-txt', nome);
            if (sub) t.appendChild(el('span', 'rail-sub', sub));
            b.appendChild(t);
            return b;
        }
        nav.appendChild(item('inicio', ICO.casa, 'Início'));
        nav.appendChild(el('div', 'rail-sep'));
        E.sistemas.forEach(function (s) { nav.appendChild(item(s.id, SIGLA[s.id] || s.curto, s.nome, s.total + ' jogos')); });
        nav.appendChild(el('div', 'rail-sep'));
        nav.appendChild(item('favoritos', ICO.estrela, 'Favoritos', E.dados.favoritos.length + ' jogos'));
        nav.appendChild(item('buscar', ICO.lupa, 'Buscar'));
        var pe = $('#railPe'); pe.innerHTML = '';
        var bs = item('som', '', '');
        delete bs.dataset.vista;
        bs.dataset.acao = 'som';
        pe.appendChild(bs);
        atualizarItemSom();
        if (E.quiosque) pe.appendChild(item('sair', ICO.sair, 'Sair'));
    }
    function atualizarItemSom() {
        var b = $('.rail-item[data-acao="som"]'); if (!b) return;
        b.querySelector('.rail-ico').innerHTML = E.mudo ? ICO.somOff : ICO.somOn;
        var t = b.querySelector('.rail-txt');
        t.textContent = 'Som das prévias';
        t.appendChild(el('span', 'rail-sub', E.mudo ? 'Desligado' : 'Ligado'));
    }
    // ---------------- busca: o item "Buscar" do menu vira campo de texto e o menu fica aberto
    var buscaTimer = null;
    function itemBusca() { return $('.rail-item[data-vista="buscar"]'); }
    function campoBusca() { return $('#rail .rail-busca'); }
    function abrirBusca() {
        if (E.vista !== 'buscar') abrir('buscar');
        var b = itemBusca(), inp = campoBusca();
        if (!inp) {
            var t = b.querySelector('.rail-txt');
            t.innerHTML = '';
            inp = el('input', 'rail-busca');
            inp.type = 'text'; inp.placeholder = 'Nome do jogo…'; inp.spellcheck = false; inp.autocomplete = 'off';
            inp.value = E.busca;
            inp.addEventListener('input', function () {
                E.busca = inp.value;
                clearTimeout(buscaTimer);
                buscaTimer = setTimeout(atualizarBusca, 140);
            });
            t.appendChild(inp);
        }
        document.body.classList.add('buscando');
        focar(b, true);
    }
    function fecharBusca() {
        document.body.classList.remove('buscando');
        var inp = campoBusca();
        if (inp) inp.closest('.rail-txt').textContent = 'Buscar';
    }
    function railAtivo() { return $('.rail-item[data-vista="' + E.vista + '"]'); }

    // ------------------------------------------------------------ vistas
    function abrir(vista, selId) {
        if (vista === 'sair') { api('/api/sair', {}); return; }
        if (vista !== 'buscar') fecharBusca();
        pararMidia();
        clearInterval(E.rodar);
        E.vista = vista;
        document.querySelectorAll('.rail-item').forEach(function (b) { b.classList.toggle('ativo', b.dataset.vista === vista); });
        var p = $('#palco'); p.innerHTML = '';
        if (vista === 'inicio') vistaInicio(p);
        else vistaBiblioteca(p, vista, selId);
    }

    // ---------------- inicio
    function vistaInicio(p) {
        var raiz = el('div', 'inicio rolavel');
        p.appendChild(raiz);
        var bons = E.jogos.filter(function (j) { return j.video && j.capa && j.logo && j.nota >= 7.5; });
        var dest = sorteioDoDia(bons, 6);
        var d = el('section', 'destaque');
        raiz.appendChild(d);
        var minis = el('div', 'dest-mini');
        dest.forEach(function (j, i) {
            var m = el('button', 'mini f');
            m.dataset.slide = i;
            var im = el('img'); im.src = j.capa; im.alt = j.nome; m.appendChild(im);
            m.appendChild(el('span', 'prog'));
            minis.appendChild(m);
        });
        var atual = -1;
        function mostrar(i) {
            if (i === atual) return;
            atual = i;
            var j = dest[i];
            pararMidia(d);
            Array.prototype.slice.call(d.children).forEach(function (c) { if (c !== minis) c.remove(); });
            d.insertBefore(midia(j, 700), minis);
            d.insertBefore(el('div', 'dest-sombra'), minis);
            var info = el('div', 'dest-info');
            info.appendChild(html('div', 'selo', '<i></i>Sugestão de hoje'));
            logoOuTitulo(j, info);
            info.appendChild(meta(j));
            info.appendChild(el('p', 'dest-desc', j.desc));
            var ac = el('div', 'acoes');
            var bj = html('button', 'btn-jogar f', ICO.play + 'Jogar'); bj.dataset.jogar = j.id;
            var bi = html('button', 'btn-sec f', ICO.info + 'Ver na biblioteca'); bi.dataset.abrir = j.id;
            var bf = html('button', 'btn-sec f' + (fav(j.id) ? ' on' : ''), fav(j.id) ? ICO.estrela : ICO.estrelaV); bf.dataset.fav = j.id;
            ac.appendChild(bj); ac.appendChild(bi); ac.appendChild(bf);
            info.appendChild(ac);
            d.insertBefore(info, minis);
            minis.querySelectorAll('.mini').forEach(function (m, k) {
                m.classList.toggle('atual', k === i);
                var pr = m.querySelector('.prog'); pr.style.transition = 'none'; pr.style.width = '0';
            });
            reiniciarRodizio();
        }
        d.appendChild(minis);
        d._mostrar = mostrar;
        // rodizio do carrossel: troca sozinho depois de 15 s sem mexer no controle
        function reiniciarRodizio() {
            clearInterval(E.rodar);
            var pr = minis.querySelector('.mini.atual .prog');
            if (pr) { void pr.offsetWidth; pr.style.transition = 'width 15s linear'; pr.style.width = '100%'; }
            E.rodar = setInterval(function () {
                if (!document.body.contains(d)) return clearInterval(E.rodar);
                var foiFoco = E.foco && E.foco.closest('.destaque');
                mostrar((atual + 1) % dest.length);
                if (foiFoco) focar($('.btn-jogar', d), true);
            }, 15000);
        }
        E.reiniciarRodizio = reiniciarRodizio;
        mostrar(0);

        // prateleiras
        var rec = E.dados.recentes.map(function (r) { return E.porId.get(r.id); }).filter(Boolean).slice(0, 12);
        if (rec.length) raiz.appendChild(prateleira('Continuar jogando', '', rec, tile));
        else raiz.appendChild(prateleira('Escolhas para você', 'jogue um e ele aparece aqui como "Continuar jogando"',
            sorteioDoDia(bons, 10, 7), tile));
        var favs = E.dados.favoritos.map(function (id) { return E.porId.get(id); }).filter(Boolean);
        if (favs.length) raiz.appendChild(prateleira('Favoritos', favs.length + ' jogos', favs.slice(0, 20), capa));
        E.sistemas.forEach(function (s) {
            var top = E.jogos.filter(function (j) { return j.sys === s.id && j.capa; })
                .sort(function (a, b) { return (b.nota || 0) - (a.nota || 0); }).slice(0, 18);
            var ver = el('button', 'capa ver f'); ver.dataset.vista = s.id;
            ver.appendChild(el('b', '', s.total)); ver.appendChild(el('span', '', 'Ver todos'));
            raiz.appendChild(prateleira(s.nome, 'mais bem avaliados', top, capa, ver));
        });
        var dois = E.jogos.filter(function (j) { return /[2-9]/.test(j.jogadores) && j.capa && j.nota >= 7; });
        raiz.appendChild(prateleira('Para jogar a dois', '', sorteioDoDia(dois, 12, 3), tile));
        focar($('.btn-jogar', d));
    }
    function prateleira(titulo, sub, jogos, fab, final) {
        var s = el('section', 'prateleira');
        var c = el('div', 'prat-cab'); c.appendChild(el('h2', '', titulo)); if (sub) c.appendChild(el('span', '', sub));
        s.appendChild(c);
        var t = el('div', 'trilho');
        jogos.forEach(function (j) { t.appendChild(fab(j)); });
        if (final) t.appendChild(final);
        s.appendChild(t);
        return s;
    }
    function tile(j) {
        var t = el('button', 'tile f'); t.dataset.id = j.id;
        var f = el('div', 't-fundo'); if (j.capa) f.style.backgroundImage = 'url("' + j.capa + '")'; t.appendChild(f);
        if (j.capa) { var i = el('img', 't-caixa'); i.loading = 'lazy'; i.src = j.capa; i.alt = ''; t.appendChild(i); }
        t.appendChild(el('span', 't-sys tag-sys', SIGLA[j.sys] || j.sys));
        var inf = el('div', 't-info');
        inf.appendChild(el('div', 't-nome', j.nome));
        var q = ultimaVez(j.id);
        inf.appendChild(el('div', 't-sub', q ? haQuanto(q) + ' · ' + duracao(E.dados.tempo[j.id]) : [j.ano, j.genero].filter(Boolean).join(' · ')));
        t.appendChild(inf);
        return t;
    }
    function capa(j) {
        var c = el('button', 'capa f'); c.dataset.id = j.id;
        if (j.capa) { var i = el('img'); i.loading = 'lazy'; i.alt = ''; i.src = j.capa; i.onerror = function () { i.replaceWith(el('span', 'c-nome', j.nome)); }; c.appendChild(i); }
        else c.appendChild(el('span', 'c-nome', j.nome));
        if (fav(j.id)) c.appendChild(el('span', 'fav-mark', '★'));
        return c;
    }

    // ---------------- biblioteca (lista + pagina)
    var ORDENS = [['nome', 'A–Z'], ['nota', 'Nota'], ['ano', 'Ano'], ['jogado', 'Jogados']];
    function listaDaVista(v) {
        var l;
        if (v === 'favoritos') l = E.dados.favoritos.map(function (id) { return E.porId.get(id); }).filter(Boolean);
        else if (v === 'buscar') {
            var q = normal(E.busca).split(/\s+/).filter(Boolean);
            l = !q.length ? [] : E.jogos.filter(function (j) { var n = j._n || (j._n = normal(j.nome)); return q.every(function (p) { return n.indexOf(p) >= 0; }); }).slice(0, 80);
        } else l = E.jogos.filter(function (j) { return j.sys === v; });
        var g = E.genero[v];
        if (g) l = l.filter(function (j) { return j.genero === g; });
        var o = E.ordem[v] || 'nome';
        if (o === 'nota') l = l.slice().sort(function (a, b) { return (b.nota || 0) - (a.nota || 0); });
        else if (o === 'ano') l = l.slice().sort(function (a, b) { return (b.ano || 0) - (a.ano || 0); });
        else if (o === 'jogado') l = l.slice().sort(function (a, b) { return ultimaVez(b.id) - ultimaVez(a.id) || (E.dados.tempo[b.id] || 0) - (E.dados.tempo[a.id] || 0); });
        return l;
    }
    function vistaBiblioteca(p, v, selId) {
        var b = el('div', 'biblioteca');
        var lista = el('div', 'lista');
        var cab = el('div', 'lista-cab');
        var titulo = v === 'favoritos' ? 'Favoritos' : v === 'buscar' ? 'Resultados' : sys(v).nome;
        cab.appendChild(el('h2', '', titulo));
        var qtd = el('div', 'qtd'); cab.appendChild(qtd);
        if (v !== 'buscar') {
            var fl = el('div', 'filtros');
            var fg = el('button', 'filtro f'); fg.dataset.filtro = 'genero';
            var fo = el('button', 'filtro f'); fo.dataset.filtro = 'ordem';
            fl.appendChild(fg); fl.appendChild(fo); cab.appendChild(fl);
        }
        lista.appendChild(cab);
        var itens = el('div', 'itens rolavel');
        lista.appendChild(itens);
        var pag = el('div', 'pagina');
        b.appendChild(lista); b.appendChild(pag);
        p.appendChild(b);

        function preencher() {
            var l = listaDaVista(v);
            if (v === 'buscar') {
                qtd.hidden = !E.busca;
            } else {
                fg.innerHTML = ''; fg.appendChild(el('span', '', 'Gênero')); fg.appendChild(el('b', '', E.genero[v] || 'Todos'));
                fo.innerHTML = ''; fo.appendChild(el('span', '', 'Ordem')); fo.appendChild(el('b', '', ORDENS.find(function (o) { return o[0] === (E.ordem[v] || 'nome'); })[1]));
            }
            qtd.textContent = l.length + ' jogos';
            itens.innerHTML = '';
            var frag = document.createDocumentFragment(), letra = null, porLetra = (E.ordem[v] || 'nome') === 'nome' && v !== 'buscar';
            l.forEach(function (j) {
                if (porLetra && inicial(j) !== letra) { letra = inicial(j); frag.appendChild(el('div', 'letra-cab', letra)); }
                var it = el('button', 'item f'); it.dataset.id = j.id;
                if (j.capa) { var im = el('img'); im.loading = 'lazy'; im.src = j.capa; im.alt = ''; it.appendChild(im); } else it.appendChild(el('span', 'sem'));
                var tx = el('span', 'i-txt');
                tx.appendChild(el('span', 'i-nome', j.nome));
                var sub = (v === 'favoritos' || v === 'buscar' ? sys(j.sys).curto + ' · ' : '') + [j.ano, j.genero].filter(Boolean).join(' · ');
                tx.appendChild(el('span', 'i-sub', sub));
                it.appendChild(tx);
                if (fav(j.id)) it.appendChild(el('span', 'i-fav', '★'));
                frag.appendChild(it);
            });
            itens.appendChild(frag);
            if (!l.length) {
                itens.appendChild(el('p', 'vazio', v === 'buscar' ? (E.busca ? 'Nada encontrado para “' + E.busca + '”.' : 'Digite no campo de busca do menu para procurar entre os ' + E.jogos.length + ' jogos.')
                    : v === 'favoritos' ? 'Nenhum favorito ainda. Aperte Y num jogo para favoritar.' : 'Nenhum jogo com esse filtro.'));
                pag.innerHTML = '';
            }
        }
        b._preencher = preencher;
        b._lista = itens;
        b._pagina = pag;
        preencher();
        if (v === 'buscar') return;                 // o foco continua no campo de busca do menu
        var alvo = (selId && $('.item[data-id="' + CSS.escape(selId) + '"]', itens)) || $('.item', itens);
        if (alvo) { focar(alvo); selecionar(alvo.dataset.id); }
        else focar($('.f', lista));
    }

    var selTimer = null;
    function selecionar(id) {
        var j = E.porId.get(id), pag = $('.pagina');
        if (!j || !pag) return;
        document.querySelectorAll('.item.sel').forEach(function (n) { n.classList.remove('sel'); });
        var it = $('.item[data-id="' + CSS.escape(id) + '"]'); if (it) it.classList.add('sel');
        if (E.sel === j && pag.firstChild) return;
        E.sel = j;
        pararMidia(pag);
        pag.innerHTML = '';
        var rol = el('div', 'pag-rolar rolavel');
        var ban = el('div', 'pag-banner');
        ban.appendChild(midia(j, 550));
        ban.appendChild(el('div', 'dest-sombra'));
        var tt = el('div', 'pag-titulo'); logoOuTitulo(j, tt); ban.appendChild(tt);
        rol.appendChild(ban);
        var barra = el('div', 'barra');
        var bj = html('button', 'btn-jogar f', ICO.play + 'Jogar'); bj.dataset.jogar = j.id;
        var bf = html('button', 'btn-sec f' + (fav(j.id) ? ' on' : ''), fav(j.id) ? ICO.estrela : ICO.estrelaV); bf.dataset.fav = j.id;
        barra.appendChild(bj); barra.appendChild(bf);
        var st = el('div', 'stats');
        [['Tempo jogado', duracao(E.dados.tempo[j.id])], ['Última vez', haQuanto(ultimaVez(j.id))],
            ['Nota', j.nota ? '★ ' + j.nota.toFixed(1) : '—'], ['Jogadores', j.jogadores || '1']].forEach(function (x) {
            var s = el('div', 'stat'); s.appendChild(el('small', '', x[0])); s.appendChild(el('span', '', x[1])); st.appendChild(s);
        });
        barra.appendChild(st);
        rol.appendChild(barra);
        var corpo = el('div', 'pag-corpo');
        corpo.appendChild(el('p', 'pag-desc', j.desc || 'Sem descrição.'));
        var f = el('dl', 'ficha');
        [['Console', sys(j.sys).nome], ['Gênero', j.genero], ['Lançamento', j.ano], ['Desenvolvedora', j.dev], ['Editora', j.editora]].forEach(function (x) {
            if (!x[1]) return; f.appendChild(el('dt', '', x[0])); f.appendChild(el('dd', '', x[1]));
        });
        corpo.appendChild(f);
        rol.appendChild(corpo);
        if (j.genero) {
            var mesmos = E.jogos.filter(function (x) { return x.sys === j.sys && x.genero === j.genero && x.id !== j.id && x.capa; })
                .sort(function (a, b) { return (b.nota || 0) - (a.nota || 0); }).slice(0, 14);
            if (mesmos.length) rol.appendChild(prateleira('Mais de ' + j.genero, sys(j.sys).nome, mesmos, capa));
        }
        pag.appendChild(rol);
    }

    // ------------------------------------------------------------ foco e navegacao espacial
    function visivel(n) { return n.offsetParent !== null || n.closest('#rail'); }
    function focar(n, semRolar) {
        if (!n) return;
        if (E.foco) E.foco.classList.remove('foco');
        E.foco = n; n.classList.add('foco');
        var noRail = !!n.closest('#rail');
        var buscando = document.body.classList.contains('buscando');
        $('#rail').classList.toggle('aberto', noRail || buscando);
        // o campo de busca so tem foco de verdade quando o foco esta no item Buscar
        var inp = campoBusca();
        if (inp) { if (n === itemBusca()) inp.focus(); else if (document.activeElement === inp) inp.blur(); }
        if (!noRail) E.memPalco = n;
        var tr = n.closest('.trilho'); if (tr) tr._mem = n;
        if (!semRolar) n.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        if (n.closest('.destaque') && !semRolar) { var r = n.closest('.rolavel'); if (r) r.scrollTo({ top: 0, behavior: 'smooth' }); }
        if (n.dataset.slide) { var d = n.closest('.destaque'); if (d) d._mostrar(+n.dataset.slide); }
        if (n.dataset.jogar) {
            // intencao de jogar: pede ao servidor para ja ler a ROM do HD
            clearTimeout(focar.prep);
            var pid = n.dataset.jogar;
            focar.prep = setTimeout(function () { fetch('/api/preparar/' + b64url(pid)).catch(function () {}); }, 350);
        }
        if (n.classList.contains('item')) { clearTimeout(selTimer); var id = n.dataset.id; selTimer = setTimeout(function () { selecionar(id); }, 90); }
        dicas();
    }
    function mover(dir) {
        var cur = E.foco;
        var itens = Array.prototype.filter.call(document.querySelectorAll('.f'), visivel);
        if (!cur || itens.indexOf(cur) < 0) return focar(itens[0]);
        var noRail = !!cur.closest('#rail');
        if (noRail && dir === 'dir') {
            var m = E.memPalco && document.body.contains(E.memPalco) && visivel(E.memPalco) ? E.memPalco : $('#palco .f');
            return focar(m);
        }
        if (noRail) itens = itens.filter(function (n) { return n.closest('#rail'); });
        var a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
        var melhor = null, md = Infinity;
        itens.forEach(function (n) {
            if (n === cur) return;
            var b = n.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2, prim, orto;
            if (dir === 'dir') { if (bx <= ax + 2 || b.bottom < a.top + 4 || b.top > a.bottom - 4) return; prim = Math.max(0, b.left - a.right); orto = Math.abs(by - ay); }
            else if (dir === 'esq') { if (bx >= ax - 2 || b.bottom < a.top + 4 || b.top > a.bottom - 4) return; prim = Math.max(0, a.left - b.right); orto = Math.abs(by - ay); }
            else if (dir === 'baixo') { if (by <= ay + 2 || b.top < a.top + a.height * 0.5) return; prim = Math.max(0, b.top - a.bottom); orto = Math.abs(bx - ax); }
            else { if (by >= ay - 2 || b.bottom > a.bottom - a.height * 0.5) return; prim = Math.max(0, a.top - b.bottom); orto = Math.abs(bx - ax); }
            var d = prim + orto * 2;
            if (d < md) { md = d; melhor = n; }
        });
        // esquerda sem nada no palco: abre o menu na vista atual
        if (!melhor && dir === 'esq' && !noRail) melhor = railAtivo();
        if (!melhor) return;
        if (!noRail && melhor.closest('#rail')) melhor = railAtivo() || melhor;
        // da lista para a pagina: cai no botao Jogar
        if (dir === 'dir' && cur.classList.contains('item')) melhor = $('.pagina .btn-jogar') || melhor;
        var tr = melhor.closest('.trilho');
        if ((dir === 'cima' || dir === 'baixo') && tr && tr._mem && tr._mem !== melhor && document.body.contains(tr._mem)) {
            var r = tr._mem.getBoundingClientRect(); if (r.left >= 0 && r.right <= innerWidth) melhor = tr._mem;
        }
        focar(melhor);
    }

    // ------------------------------------------------------------ acoes
    function b64url(s) {
        var bytes = new TextEncoder().encode(s), bin = '';
        for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    function jogar(j) {
        if (!j || E.jogando) return;
        if (sys(j.sys).modo !== 'nativo') return jogarWeb(j);
        jogarNativo(j);
    }
    // emulador dentro da interface: iframe proprio (ao sair, o navegador libera toda a memoria do WebAssembly)
    function jogarWeb(j) {
        E.jogando = j;
        pararMidia();
        clearInterval(E.rodar);
        document.body.classList.add('jogando');          // esconde a interface: nada de blur/video competindo com o jogo
        var f = el('iframe', 'tela-jogo');
        f.allow = 'gamepad; autoplay; fullscreen; screen-wake-lock';   // wake lock: tela nao apaga jogando so com o controle
        f.src = '/jogar.html?id=' + b64url(j.id);
        f.onload = function () { try { f.contentWindow.focus(); } catch (e) {} };
        document.body.appendChild(f);
    }
    window.addEventListener('message', function (ev) {
        if (ev.origin !== location.origin || !ev.data) return;
        if (ev.data.tipo === 'iniciou') { var f = $('.tela-jogo'); if (f) f.contentWindow.focus(); }
        if (ev.data.tipo !== 'saiu' || !E.jogando) return;
        var j = E.jogando;
        var f2 = $('.tela-jogo');
        if (f2) { f2.src = 'about:blank'; f2.remove(); }
        document.body.classList.remove('jogando');
        E.jogando = null;
        if (ev.data.dados) E.dados = ev.data.dados;
        window.focus();
        abrir(E.vista === 'inicio' ? 'inicio' : E.vista, j.id);
        if (E.vista !== 'inicio') { var it = $('.item[data-id="' + CSS.escape(j.id) + '"]'); if (it) focar(it); }
    });
    function jogarNativo(j) {
        api('/api/jogar', { id: j.id }).then(function (r) {
            if (!r.ok) return aviso(r.erro || 'Não foi possível abrir o jogo.');
            E.jogando = j;
            pararMidia();
            aviso('Jogando ' + j.nome + ' — Start + Select duas vezes para voltar');
            var t = setInterval(function () {
                api('/api/status').then(function (s) {
                    if (s.jogando) return;
                    clearInterval(t); E.jogando = null; E.dados = s.dados;
                    if (s.erro) aviso(s.erro);
                    var id = j.id; abrir(E.vista, id);
                });
            }, 1000);
        });
    }
    function alternarFav(j) {
        if (!j) return;
        var on = !fav(j.id);
        api('/api/favorito', { id: j.id, on: on }).then(function (r) {
            E.dados.favoritos = r.favoritos;
            document.querySelectorAll('[data-fav="' + CSS.escape(j.id) + '"]').forEach(function (b) { b.classList.toggle('on', on); b.innerHTML = on ? ICO.estrela : ICO.estrelaV; });
            var sub = $('.c-favoritos .rail-sub'); if (sub) sub.textContent = r.favoritos.length + ' jogos';
            aviso(on ? '★ ' + j.nome + ' nos favoritos' : j.nome + ' saiu dos favoritos');
        });
    }
    function jogoEmFoco() {
        var n = E.foco; if (!n) return null;
        var id = n.dataset.id || n.dataset.jogar || n.dataset.fav || n.dataset.abrir;
        if (!id && n.closest('.pagina')) return E.sel;
        return id ? E.porId.get(id) : null;
    }
    function ok() {
        var n = E.foco; if (!n) return;
        if (n.dataset.acao === 'som') return som();
        if (n.dataset.vista === 'buscar') return abrirBusca();
        if (n.dataset.vista) return abrir(n.dataset.vista);
        if (n.dataset.jogar) return jogar(E.porId.get(n.dataset.jogar));
        if (n.dataset.fav) return alternarFav(E.porId.get(n.dataset.fav));
        if (n.dataset.abrir) { var j = E.porId.get(n.dataset.abrir); return abrir(j.sys, j.id); }
        if (n.dataset.slide) return focar($('.destaque .btn-jogar'));
        if (n.dataset.filtro) return girarFiltro(n.dataset.filtro);
        if (n.classList.contains('item')) { selecionar(n.dataset.id); return focar($('.pagina .btn-jogar')); }
        if (n.dataset.id) {
            var g = E.porId.get(n.dataset.id);
            if (n.closest('.pagina')) { var it = $('.item[data-id="' + CSS.escape(g.id) + '"]'); if (it) { focar(it); selecionar(g.id); return; } }
            return abrir(g.sys, g.id);
        }
    }
    function girarFiltro(qual) {
        var v = E.vista, b = $('.biblioteca');
        if (qual === 'genero') {
            var cont = {};
            E.jogos.forEach(function (j) { if ((v === 'favoritos' ? fav(j.id) : j.sys === v) && j.genero) cont[j.genero] = (cont[j.genero] || 0) + 1; });
            var gs = [null].concat(Object.keys(cont).sort(function (a, c) { return cont[c] - cont[a]; }).slice(0, 12));
            E.genero[v] = gs[(gs.indexOf(E.genero[v] || null) + 1) % gs.length];
        } else {
            var os = ORDENS.map(function (o) { return o[0]; });
            E.ordem[v] = os[(os.indexOf(E.ordem[v] || 'nome') + 1) % os.length];
        }
        b._preencher();
        b._lista.scrollTop = 0;
        var pri = $('.item', b._lista); if (pri) selecionar(pri.dataset.id);
    }
    function voltar() {
        var n = E.foco; if (!n) return;
        if (n.closest('#rail')) { if (E.vista !== 'inicio') abrir('inicio'); return; }
        if (n.closest('.pagina')) { var it = E.sel && $('.item[data-id="' + CSS.escape(E.sel.id) + '"]'); if (it) return focar(it); }
        if (E.vista === 'buscar') return focar(itemBusca());     // dos resultados volta para o campo
        focar(railAtivo());
    }
    function atualizarBusca() {
        var b = $('.biblioteca'); if (!b) return;
        b._preencher();
        var pri = $('.item', b._lista);
        if (pri) { selecionar(pri.dataset.id); }
        if (!E.foco || !document.body.contains(E.foco)) focar(pri || $('#palco .f') || railAtivo());
    }
    function trocar(passo) {
        var ids = ['inicio'].concat(E.sistemas.map(function (s) { return s.id; }), ['favoritos']);
        var i = ids.indexOf(E.vista); i = (i < 0 ? 0 : i + passo + ids.length) % ids.length;
        abrir(ids[i]);
    }
    function pularLetra(passo) {
        var n = E.foco; if (!n || !n.classList.contains('item')) return;
        var todos = Array.prototype.slice.call(document.querySelectorAll('.itens .item'));
        var i = todos.indexOf(n), ini = function (x) { return inicial(E.porId.get(x.dataset.id)); }, at = ini(n), k = i;
        if (passo > 0) { while (k < todos.length - 1 && ini(todos[k]) === at) k++; }
        else { while (k > 0 && ini(todos[k - 1]) === at) k--; if (k === i && k > 0) { k--; var an = ini(todos[k]); while (k > 0 && ini(todos[k - 1]) === an) k--; } }
        if (k !== i) focar(todos[k]);
    }
    function som() {
        E.mudo = !E.mudo;
        try { localStorage.setItem('retroteca.mudo', E.mudo ? '1' : '0'); } catch (e) {}
        document.querySelectorAll('.dest-midia video').forEach(function (v) { v.muted = E.mudo; });
        aviso(E.mudo ? 'Som das prévias desligado' : 'Som das prévias ligado');
        atualizarItemSom();
        dicas();
    }
    function acao(a) {
        if (E.jogando) return;
        if (E.reiniciarRodizio && $('.destaque')) E.reiniciarRodizio();
        switch (a) {
            case 'cima': case 'baixo': case 'esq': case 'dir': return mover(a);
            case 'ok': return ok();
            case 'voltar': return voltar();
            case 'fav': return alternarFav(jogoEmFoco());
            case 'jogar': return jogar(jogoEmFoco());
            case 'som': return som();
            case 'lb': return trocar(-1);
            case 'rb': return trocar(1);
            case 'lt': return pularLetra(-1);
            case 'rt': return pularLetra(1);
        }
    }

    function dicas() {
        var f = $('#dicas'); f.innerHTML = '';
        function d(bt, c, t) { var s = el('span', 'dica'); s.appendChild(el('span', 'bt ' + c, bt)); s.appendChild(document.createTextNode(t)); f.appendChild(s); }
        var n = E.foco, temJogo = !!jogoEmFoco();
        if (n && n.classList.contains('item')) { d('A', 'a', 'Abrir'); d('Start', 'r', 'Jogar'); d('LT RT', 'r', 'Letra'); }
        else if (temJogo) { d('A', 'a', n && n.dataset.jogar ? 'Jogar' : 'Abrir'); d('Start', 'r', 'Jogar'); }
        else d('A', 'a', 'Selecionar');
        if (temJogo) d('Y', 'y', 'Favorito');
        d('X', 'x', E.mudo ? 'Ligar som' : 'Desligar som');
        d('LB RB', 'r', 'Console');
        d('B', 'b', 'Voltar');
    }

    // ------------------------------------------------------------ entrada: teclado, mouse, gamepad
    document.addEventListener('keydown', function (ev) {
        if (ev.ctrlKey || ev.altKey || ev.metaKey) return;
        var k = ev.key, a = null;
        if (ev.target.classList && ev.target.classList.contains('rail-busca')) {
            var inp = ev.target;
            if (k === 'Enter' || k === 'ArrowDown' || (k === 'ArrowRight' && inp.selectionStart === inp.value.length)) {
                ev.preventDefault();
                atualizarBusca();
                var pri = $('.itens .item');
                if (pri) { focar(pri); selecionar(pri.dataset.id); }
            } else if (k === 'ArrowUp') { ev.preventDefault(); mover('cima'); }
            else if (k === 'Escape') { ev.preventDefault(); inp.blur(); }
            return;                                  // o resto e digitacao normal no campo
        }
        if (k === 'ArrowUp') a = 'cima'; else if (k === 'ArrowDown') a = 'baixo';
        else if (k === 'ArrowLeft') a = 'esq'; else if (k === 'ArrowRight') a = 'dir';
        else if (k === 'Enter') a = 'ok';
        else if (k === 'Escape' || k === 'Backspace') a = 'voltar';
        else if (k === 'PageUp') a = 'lt'; else if (k === 'PageDown') a = 'rt';
        else if (k === 'Tab') a = ev.shiftKey ? 'lb' : 'rb';
        else if (k === ' ') a = 'ok';
        else if (k === 'f' || k === 'F') a = 'fav'; else if (k === 'p' || k === 'P') a = 'jogar'; else if (k === 'm' || k === 'M') a = 'som';
        if (!a) return;
        ev.preventDefault(); acao(a);
    });
    document.addEventListener('click', function (ev) {
        var n = ev.target.closest('.f'); if (!n || E.jogando) return;
        focar(n, true); ok();
    });
    document.addEventListener('mouseover', function (ev) {
        var n = ev.target.closest('#rail'); $('#rail').classList.toggle('aberto', !!n || !!(E.foco && E.foco.closest('#rail')) || document.body.classList.contains('buscando'));
    });
    var BT = { 0: 'ok', 1: 'voltar', 2: 'som', 3: 'fav', 4: 'lb', 5: 'rb', 6: 'lt', 7: 'rt', 9: 'jogar', 12: 'cima', 13: 'baixo', 14: 'esq', 15: 'dir' };
    var antes = {}, rep = {};
    (function ler() {
        var pads = navigator.getGamepads ? navigator.getGamepads() : [], agora = {};
        for (var i = 0; i < pads.length; i++) {
            var p = pads[i]; if (!p || !p.connected) continue;
            for (var b in BT) { var x = p.buttons[b]; if (x && (x.pressed || x.value > 0.6)) agora[BT[b]] = true; }
            var ex = p.axes[0] || 0, ey = p.axes[1] || 0;
            if (Math.abs(ex) > 0.6 || Math.abs(ey) > 0.6) agora[Math.abs(ex) > Math.abs(ey) ? (ex > 0 ? 'dir' : 'esq') : (ey > 0 ? 'baixo' : 'cima')] = true;
        }
        // jogando no iframe: o controle e do jogo. So acompanha o estado (sem agir) e checa 5x por segundo,
        // assim o botao que fechou o jogo nao dispara nada na interface ao voltar
        if (E.jogando) { antes = agora; setTimeout(ler, 200); return; }
        var t = performance.now();
        Object.keys(agora).forEach(function (a) {
            if (!antes[a]) { acao(a); rep[a] = { prox: t + 380, n: 0 }; }
            else if (/^(cima|baixo|esq|dir|lt|rt)$/.test(a) && t >= rep[a].prox) { acao(a); rep[a].n++; rep[a].prox = t + (rep[a].n > 8 ? 55 : 110); }
        });
        antes = agora;
        requestAnimationFrame(ler);
    })();
    window.addEventListener('gamepadconnected', function (e) { aviso('Controle conectado: ' + e.gamepad.id.replace(/\s*\(.*$/, '')); });

    api('/api/biblioteca').then(function (b) {
        E.sistemas = b.sistemas; E.jogos = b.jogos; E.dados = b.dados; E.emulador = b.emulador; E.quiosque = b.quiosque;
        b.jogos.forEach(function (j) { E.porId.set(j.id, j); });
        montarRail();
        abrir('inicio');
        if (b.emulador.faltando.length) setTimeout(function () {
            aviso(!b.emulador.web ? 'Emulador não instalado: rode node instalar-emulador.js'
                : 'Emulador indisponível para: ' + b.emulador.faltando.map(function (s) { return sys(s).nome; }).join(', '));
        }, 1200);
    });
})();
