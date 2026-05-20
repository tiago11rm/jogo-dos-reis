const express = require('express');
const path = require('path');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// O SEGREDO DAS IMAGENS: Lê a public para o HTML, e lê a pasta 'cartas' da tua raiz!
app.use(express.static(path.join(__dirname, 'public')));
app.use('/cartas', express.static(path.join(__dirname, 'cartas')));

let salasativas = {};

function criarNovoJogo(nomeHost) {
    return {
        atual: 0, fase: 'aguardando_jogadores', host: nomeHost,
        baralhador: '', partidor: '', dador: '', pedidor: '',
        pontoCorte: 20, trunfo: '', maos: {},
        representantes: {}, alvoBebida: '', timer: null,
        coposBebidos: 0, historicoCopos: []
    };
}

function gerarBaralho() {
    const naipes = ["Copas", "Ouros", "Espadas", "Paus"];
    // REGRA DE OURO: Apenas as 40 cartas para a distribuição!
    const valores = ["2", "3", "4", "5", "6", "7", "Valete", "Dama", "Rei", "Ás"];
    let b = [];
    for (let n of naipes) for (let v of valores) b.push(`${v} de ${n}`);
    for (let i = b.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
}

function rodarPapeis(salaId) {
    let s = salasativas[salaId];
    const g = s.jogo.atual;
    const nJogadores = s.jogadores.length;
    
    s.jogo.dador = s.jogadores[g % nJogadores];
    s.jogo.baralhador = s.jogadores[(g + 1) % nJogadores];
    s.jogo.partidor = s.jogadores[(g + 2) % nJogadores];
    s.jogo.pedidor = s.jogadores[(g + 3) % nJogadores];
    s.jogo.representantes = {};
    s.jogo.coposBebidos = 0;
    s.jogo.historicoCopos = [];
}

io.on('connection', (socket) => {
    function obterSala() { return salasativas[socket.salaAtual]; }

    socket.on('juntar_sala', (dados) => {
        const { nome, sala } = dados;
        socket.nomeUsuario = nome;
        socket.salaAtual = sala;
        socket.join(sala);

        if (!salasativas[sala]) {
            salasativas[sala] = { jogadores: [], jogo: criarNovoJogo(nome), baralho_global: [] };
        }

        let s = obterSala();
        if (!s.jogadores.includes(nome) && s.jogadores.length < 10 && s.jogo.fase === 'aguardando_jogadores') {
            s.jogadores.push(nome);
        }

        io.to(sala).emit('estado_atual', { jogo: s.jogo, lista: s.jogadores });
    });

    socket.on('iniciar_jogo', () => {
        let s = obterSala(); if(!s) return;
        if (s.jogo.host === socket.nomeUsuario && s.jogadores.length >= 2) {
            s.jogo.fase = 'baralhando';
            rodarPapeis(socket.salaAtual);
            io.to(socket.salaAtual).emit('proxima_fase', s.jogo);
        }
    });

    socket.on('acao_baralhar', () => {
        let s = obterSala(); if(!s) return;
        s.baralho_global = gerarBaralho();
        s.jogo.fase = 'partindo';
        io.to(socket.salaAtual).emit('proxima_fase', s.jogo);
    });

    socket.on('acao_partir', (corte) => {
        let s = obterSala(); if(!s) return;
        const pCima = s.baralho_global.slice(0, corte);
        const pBaixo = s.baralho_global.slice(corte);
        s.baralho_global = pBaixo.concat(pCima);
        s.jogo.pontoCorte = corte;
        s.jogo.fase = 'dando';
        io.to(socket.salaAtual).emit('proxima_fase', s.jogo);
    });

    socket.on('acao_dar', () => {
        let s = obterSala(); if(!s) return;
        s.jogo.fase = 'trunfo';
        io.to(socket.salaAtual).emit('proxima_fase', s.jogo);
    });

    socket.on('acao_trunfo', (naipe) => {
        let s = obterSala(); if(!s) return;
        s.jogo.trunfo = naipe;
        s.jogadores.forEach(j => s.jogo.maos[j] = []);
        
        let c = 0;
        let cartasPorPessoa = Math.floor(s.baralho_global.length / s.jogadores.length);
        
        // 1. Distribuição igual para todos
        s.jogadores.forEach(jogador => {
            for(let i=0; i<cartasPorPessoa; i++) { 
                s.jogo.maos[jogador].push(s.baralho_global[c]); 
                c++; 
            }
        });
        
        // 2. O RESTO FICA PARA O DADOR!
        while (c < s.baralho_global.length) {
            s.jogo.maos[s.jogo.dador].push(s.baralho_global[c]);
            c++;
        }
        
        s.jogo.fase = 'escolhendo_representantes';
        io.to(socket.salaAtual).emit('proxima_fase', s.jogo);
    });

    socket.on('escolher_representante', (cartas) => {
        let s = obterSala(); if(!s) return;
        s.jogo.representantes[socket.nomeUsuario] = cartas;
        if(Object.keys(s.jogo.representantes).length === s.jogadores.length) {
            s.jogo.fase = 'turno_valete'; io.to(socket.salaAtual).emit('proxima_fase', s.jogo);
        }
    });

    socket.on('acao_valete', (decisao) => {
        let s = obterSala(); if(!s) return;
        if(decisao.tipo === 'beber') iniciarContagem(socket.salaAtual, socket.nomeUsuario);
        if(decisao.tipo === 'dama') { s.jogo.fase = 'turno_dama'; io.to(socket.salaAtual).emit('proxima_fase', s.jogo); }
        if(decisao.tipo === 'outro') {
            s.jogo.alvoBebida = decisao.alvo;
            let donoDama = Object.keys(s.jogo.representantes).find(jog => s.jogo.representantes[jog].includes(`Dama de ${s.jogo.trunfo}`));
            if (donoDama) { s.jogo.fase = 'turno_dama_autoriza'; io.to(socket.salaAtual).emit('proxima_fase', s.jogo); }
            else { s.jogo.fase = 'turno_alvo'; io.to(socket.salaAtual).emit('proxima_fase', s.jogo); }
        }
    });

    socket.on('acao_dama_autoriza', (decisao) => {
        let s = obterSala(); if(!s) return;
        if (decisao === 'passar') { s.jogo.fase = 'turno_alvo'; io.to(socket.salaAtual).emit('proxima_fase', s.jogo); }
        else if (decisao === 'cortar') {
            io.to(socket.salaAtual).emit('aviso_geral', `✂️ A Dama cortou a oferta! Ninguém bebe.`);
            setTimeout(() => { if(!salasativas[socket.salaAtual]) return; s.jogo.fase = 'turno_valete'; io.to(socket.salaAtual).emit('proxima_fase', s.jogo); }, 3000);
        }
    });

    socket.on('acao_alvo', () => { let s = obterSala(); if(!s) return; iniciarContagem(socket.salaAtual, s.jogo.alvoBebida); });

    socket.on('acao_dama', (decisao) => {
        let s = obterSala(); if(!s) return;
        if(decisao === 'beber') iniciarContagem(socket.salaAtual, socket.nomeUsuario);
        if(decisao === 'cortar') {
            io.to(socket.salaAtual).emit('aviso_geral', `✂️ A Dama cortou a sua própria jogada! Ninguém bebe.`);
            setTimeout(() => { if(!salasativas[socket.salaAtual]) return; s.jogo.fase = 'turno_valete'; io.to(socket.salaAtual).emit('proxima_fase', s.jogo); }, 3000);
        }
    });

    socket.on('rei_bate', () => {
        let s = obterSala(); if(!s) return;
        clearTimeout(s.jogo.timer); s.jogo.coposBebidos++;
        s.jogo.historicoCopos.push(`${s.jogo.coposBebidos}º copo: ${socket.nomeUsuario} (Rei)`);
        io.to(socket.salaAtual).emit('rei_bateu_aviso', { nomeRei: socket.nomeUsuario, copos: s.jogo.coposBebidos });
        setTimeout(() => {
            if(!salasativas[socket.salaAtual]) return;
            if (s.jogo.coposBebidos >= 3) proximoJogo(socket.salaAtual);
            else { s.jogo.fase = 'turno_valete'; io.to(socket.salaAtual).emit('proxima_fase', s.jogo); }
        }, 4000);
    });

    socket.on('disconnect', () => {
        if (socket.salaAtual && salasativas[socket.salaAtual]) {
            const sala = socket.salaAtual; let s = salasativas[sala];
            s.jogadores = s.jogadores.filter(j => j !== socket.nomeUsuario);
            io.to(sala).emit('estado_atual', { jogo: s.jogo, lista: s.jogadores });
            if (s.jogadores.length === 0) delete salasativas[sala];
        }
    });
});

function iniciarContagem(salaId, nomeAlvo) {
    let s = salasativas[salaId]; if(!s) return;
    s.jogo.alvoBebida = nomeAlvo; s.jogo.fase = 'contagem';
    io.to(salaId).emit('iniciar_contagem', s.jogo);
    s.jogo.timer = setTimeout(() => {
        if(!salasativas[salaId]) return;
        s.jogo.coposBebidos++;
        let papel = s.jogo.representantes[nomeAlvo].join(" / ");
        s.jogo.historicoCopos.push(`${s.jogo.coposBebidos}º copo: ${nomeAlvo} (${papel})`);
        io.to(salaId).emit('aviso_geral', `🍻 Saúde! O ${nomeAlvo} bebeu!`);
        setTimeout(() => {
            if(!salasativas[salaId]) return;
            if (s.jogo.coposBebidos >= 3) proximoJogo(salaId);
            else { s.jogo.fase = 'turno_valete'; io.to(salaId).emit('proxima_fase', s.jogo); }
        }, 4000);
    }, 5000);
}

function proximoJogo(salaId) {
    let s = salasativas[salaId]; if(!s) return;
    s.jogo.atual++;
    if (s.jogo.atual >= s.jogadores.length) { 
        s.jogo.fase = 'fim_jogo'; io.to(salaId).emit('proxima_fase', s.jogo);
    } else {
        s.jogo.fase = 'baralhando'; rodarPapeis(salaId); io.to(salaId).emit('proxima_fase', s.jogo);
    }
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Servidor ativo na porta ${PORT}`));