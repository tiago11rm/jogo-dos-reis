const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

const JOGADORES = ["Tiago", "João", "Pedro", "Maria"];
let conexoes = {}; 
let baralho_global = [];

let jogo = {
    atual: 0, fase: 'aguardando_jogadores',
    baralhador: '', partidor: '', dador: '', pedidor: '',
    pontoCorte: 20, trunfo: '', maos: {},
    representantes: {}, alvoBebida: '', timer: null,
    coposBebidos: 0,
    historicoCopos: [] // O nosso bloco de notas dos copos!
};

function gerarBaralho() {
    const naipes = ["Copas", "Ouros", "Espadas", "Paus"];
    const valores = ["2", "3", "4", "5", "6", "7", "Valete", "Dama", "Rei", "Ás"];
    let b = [];
    for (let n of naipes) for (let v of valores) b.push(`${v} de ${n}`);
    for (let i = b.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
}

function rodarPapeis() {
    const g = jogo.atual;
    jogo.dador = JOGADORES[g];
    jogo.baralhador = JOGADORES[(g + 1) % 4];
    jogo.partidor = JOGADORES[(g + 2) % 4];
    jogo.pedidor = JOGADORES[(g + 3) % 4];
    jogo.representantes = {};
    jogo.coposBebidos = 0; 
    jogo.historicoCopos = []; // Apaga o quadro histórico no início da garrafa
}

io.on('connection', (socket) => {
    socket.emit('estado_atual', { jogo, lista: Object.values(conexoes) });

    socket.on('entrar_como', (nome) => {
        socket.nomeUsuario = nome;
        conexoes[socket.id] = nome;
        io.emit('atualizar_lista', Object.values(conexoes));

        if (Object.keys(conexoes).length === 4 && jogo.fase === 'aguardando_jogadores') {
            jogo.fase = 'baralhando';
            rodarPapeis();
            io.emit('proxima_fase', jogo);
        }
    });

    socket.on('acao_baralhar', () => {
        baralho_global = gerarBaralho();
        jogo.fase = 'partindo';
        io.emit('proxima_fase', jogo);
    });

    socket.on('acao_partir', (corte) => {
        const pCima = baralho_global.slice(0, corte);
        const pBaixo = baralho_global.slice(corte);
        baralho_global = pBaixo.concat(pCima);
        jogo.pontoCorte = corte;
        jogo.fase = 'dando';
        io.emit('proxima_fase', jogo);
    });

    socket.on('acao_dar', () => {
        jogo.fase = 'trunfo';
        io.emit('proxima_fase', jogo);
    });

    socket.on('acao_trunfo', (naipe) => {
        jogo.trunfo = naipe;
        JOGADORES.forEach(j => jogo.maos[j] = []);
        let c = 0;
        JOGADORES.forEach(jogador => {
            for(let i=0; i<10; i++) { jogo.maos[jogador].push(baralho_global[c]); c++; }
        });
        jogo.fase = 'escolhendo_representantes';
        io.emit('proxima_fase', jogo);
    });

    socket.on('escolher_representante', (cartas) => {
        jogo.representantes[socket.nomeUsuario] = cartas; 
        if(Object.keys(jogo.representantes).length === 4) {
            jogo.fase = 'turno_valete';
            io.emit('proxima_fase', jogo);
        }
    });

    socket.on('acao_valete', (decisao) => {
        if(decisao.tipo === 'beber') iniciarContagem(socket.nomeUsuario);
        if(decisao.tipo === 'dama') {
            jogo.fase = 'turno_dama';
            io.emit('proxima_fase', jogo);
        }
        if(decisao.tipo === 'outro') {
            jogo.alvoBebida = decisao.alvo;
            // Verifica se alguém tem a Dama na mesa
            let donoDama = Object.keys(jogo.representantes).find(jog => jogo.representantes[jog].includes(`Dama de ${jogo.trunfo}`));
            
            if (donoDama) {
                jogo.fase = 'turno_dama_autoriza'; // A Dama decide se passa!
                io.emit('proxima_fase', jogo);
            } else {
                jogo.fase = 'turno_alvo'; // Não há dama (está no resto), passa direto!
                io.emit('proxima_fase', jogo);
            }
        }
    });

    // O INTERRUPTOR DA DAMA
    socket.on('acao_dama_autoriza', (decisao) => {
        if (decisao === 'passar') {
            jogo.fase = 'turno_alvo';
            io.emit('proxima_fase', jogo);
        } else if (decisao === 'cortar') {
            io.emit('aviso_geral', `✂️ A Dama cortou a oferta! Ninguém bebe.`);
            setTimeout(() => {
                jogo.fase = 'turno_valete';
                io.emit('proxima_fase', jogo);
            }, 3000);
        }
    });

    // O ALVO SÓ PODE BEBER
    socket.on('acao_alvo', () => {
        iniciarContagem(jogo.alvoBebida);
    });

    // QUANDO É A PRÓPRIA DAMA A DECIDIR O SEU DESTINO
    socket.on('acao_dama', (decisao) => {
        if(decisao === 'beber') iniciarContagem(socket.nomeUsuario);
        if(decisao === 'cortar') {
            io.emit('aviso_geral', `✂️ A Dama cortou a sua própria jogada! Ninguém bebe.`);
            setTimeout(() => {
                jogo.fase = 'turno_valete';
                io.emit('proxima_fase', jogo);
            }, 3000);
        }
    });

    socket.on('rei_bate', () => {
        clearTimeout(jogo.timer);
        jogo.coposBebidos++; 
        
        // Regista que o Rei bebeu
        jogo.historicoCopos.push(`${jogo.coposBebidos}º copo: ${socket.nomeUsuario} (Rei)`);
        
        io.emit('rei_bateu_aviso', { nomeRei: socket.nomeUsuario, copos: jogo.coposBebidos });
        
        setTimeout(() => {
            if (jogo.coposBebidos >= 3) proximoJogo(); 
            else { jogo.fase = 'turno_valete'; io.emit('proxima_fase', jogo); }
        }, 4000);
    });

    socket.on('disconnect', () => {
        delete conexoes[socket.id];
        io.emit('atualizar_lista', Object.values(conexoes));
    });
});

function iniciarContagem(nomeAlvo) {
    jogo.alvoBebida = nomeAlvo;
    jogo.fase = 'contagem';
    io.emit('iniciar_contagem', jogo);
    
    jogo.timer = setTimeout(() => {
        jogo.coposBebidos++;
        
        // Regista que o alvo bebeu
        let papel = jogo.representantes[nomeAlvo].join(" / ");
        jogo.historicoCopos.push(`${jogo.coposBebidos}º copo: ${nomeAlvo} (${papel})`);
        
        io.emit('aviso_geral', `🍻 Saúde! O ${nomeAlvo} bebeu!`);
        
        setTimeout(() => {
            if (jogo.coposBebidos >= 3) proximoJogo(); 
            else { jogo.fase = 'turno_valete'; io.emit('proxima_fase', jogo); }
        }, 4000);
    }, 5000);
}

// GESTÃO DAS 4 JOGADAS TOTAIS
function proximoJogo() {
    jogo.atual++;
    if (jogo.atual >= 4) { // Acabaram as 4 jogadas!
        jogo.fase = 'fim_jogo';
        io.emit('proxima_fase', jogo);
    } else {
        jogo.fase = 'baralhando'; 
        rodarPapeis();
        io.emit('proxima_fase', jogo);
    }
}

http.listen(3000, () => {
    console.log('Servidor ativo em http://localhost:3000');
});