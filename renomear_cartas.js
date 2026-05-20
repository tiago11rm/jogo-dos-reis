const fs = require('fs');
const path = require('path');

const pastaCartas = './cartas';

// O Dicionário de Tradução Atualizado com o 8, 9 e 10!
const mapaValores = {
    'A': 'Ás',
    'J': 'Valete',
    'Q': 'Dama',
    'K': 'Rei',
    '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7',
    '8': '8', '9': '9', '10': '10' // AS NOVAS CARTAS AQUI
};

const mapaNaipes = {
    'copas': 'Copas',
    'espadas': 'Espadas',
    'ouros': 'Ouros',
    'paus': 'Paus'
};

try {
    const ficheiros = fs.readdirSync(pastaCartas);
    let renomeados = 0;
    let ignorados = 0;

    console.log("=== A RESGATAR AS RESTANTES 12 CARTAS ===\n");

    ficheiros.forEach(ficheiro => {
        if (ficheiro.endsWith('.png')) {
            const partes = ficheiro.replace('.png', '').split('_');
            
            // Só atua se o ficheiro ainda estiver no formato antigo (2 partes)
            if (partes.length === 2) {
                const valorAntigo = partes[0];
                const naipeAntigo = partes[1];

                if (mapaValores[valorAntigo] && mapaNaipes[naipeAntigo]) {
                    const valorNovo = mapaValores[valorAntigo];
                    const naipeNovo = mapaNaipes[naipeAntigo];
                    
                    const nomeNovo = `${valorNovo}_de_${naipeNovo}.png`;
                    
                    fs.renameSync(
                        path.join(pastaCartas, ficheiro),
                        path.join(pastaCartas, nomeNovo)
                    );
                    
                    console.log(`✅ Resgatada e Transformada: ${ficheiro}  -->  ${nomeNovo}`);
                    renomeados++;
                }
            } else {
                // Cartas que já têm o "_de_" no nome (3 partes)
                ignorados++;
            }
        }
    });

    console.log(`\n=== TAREFA CONCLUÍDA! ===`);
    console.log(`Novas cartas resgatadas: ${renomeados}`);
    console.log(`Cartas que já estavam prontas e não foram tocadas: ${ignorados}`);

} catch (erro) {
    console.log(`❌ Erro: Não consegui ler a pasta '${pastaCartas}'.`);
}