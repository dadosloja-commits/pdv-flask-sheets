document.addEventListener('DOMContentLoaded', () => {
    // --- Referências do DOM ---
    const ctxProdutos = document.getElementById('grafico-produtos');
    const ctxFaturamentoDia = document.getElementById('grafico-faturamento-dia');
    const kpiFaturamento = document.getElementById('kpi-faturamento');
    const kpiVendas = document.getElementById('kpi-vendas');
    const kpiMaisVendido = document.getElementById('kpi-mais-vendido');
    
    // --- Instâncias dos Gráficos ---
    let graficoProdutos = null;
    let graficoFaturamento = null;

    /**
     * Busca os dados brutos das vendas e dispara o processamento.
     */
    async function gerarRelatorio() {
        try {
            const response = await fetch('/api/relatorio/vendas');
            if (!response.ok) {
                mostrarMensagem('Falha ao buscar dados das vendas.', 'erro');
                return;
            }
            const vendas = await response.json();
            
            // Processa todos os dados de uma vez
            processarDadosDeVendas(vendas);
            
            mostrarMensagem('Relatórios atualizados!', 'sucesso');
            
        } catch (error) {
            mostrarMensagem('Erro de conexão ao gerar relatório.', 'erro');
            console.error(error);
        }
    }
    
    /**
     * Processa o array de vendas UMA ÚNICA VEZ,
     * calculando KPIs e preparando dados para os gráficos.
     */
    function processarDadosDeVendas(vendas) {
        if (vendas.length === 0) {
            kpiFaturamento.textContent = 'R$ 0.00';
            kpiVendas.textContent = '0';
            kpiMaisVendido.textContent = '-';
            return;
        }

        let faturamentoTotal = 0;
        const idsVendasUnicas = new Set();
        const vendasPorProduto = {};
        const vendasPorDia = {};

        // Itera sobre as vendas UMA ÚNICA VEZ
        for (const venda of vendas) {
            try {
                // 1. Processa KPIs
                const totalItem = parseFloat(String(venda.total_item).replace(',', '.'));
                faturamentoTotal += totalItem;
                idsVendasUnicas.add(venda.id_venda);

                // 2. Processa Gráfico de Produtos
                const nome = venda.nome_produto;
                const qtd = parseInt(venda.quantidade_vendida, 10);
                vendasPorProduto[nome] = (vendasPorProduto[nome] || 0) + qtd;

                // 3. Processa Gráfico de Faturamento por Dia
                const dia = venda.data_hora.split(' ')[0];
                vendasPorDia[dia] = (vendasPorDia[dia] || 0) + totalItem;
                
            } catch (e) {
                console.warn("Ignorando linha de venda mal formatada:", venda, e);
            }
        }

        // --- Atualiza KPIs ---
        kpiFaturamento.textContent = `R$ ${faturamentoTotal.toFixed(2)}`;
        kpiVendas.textContent = idsVendasUnicas.size;
        
        // Encontra o produto mais vendido (após a iteração)
        let maisVendidoNome = '-';
        let maisVendidoQtd = 0;
        for (const [nome, qtd] of Object.entries(vendasPorProduto)) {
            if (qtd > maisVendidoQtd) {
                maisVendidoQtd = qtd;
                maisVendidoNome = nome;
            }
        }
        kpiMaisVendido.textContent = maisVendidoNome;

        // --- Renderiza Gráficos ---
        renderizarGraficoProdutos(vendasPorProduto);
        renderizarGraficoFaturamentoDia(vendasPorDia);
    }

    /**
     * Desenha ou atualiza o gráfico de produtos (Rosquinha).
     */
    function renderizarGraficoProdutos(dados) {
        if (graficoProdutos) {
            graficoProdutos.destroy();
        }
        graficoProdutos = new Chart(ctxProdutos, {
            type: 'doughnut',
            data: {
                labels: Object.keys(dados),
                datasets: [{
                    label: 'Quantidade Vendida',
                    data: Object.values(dados),
                    borderWidth: 1
                }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false
            }
        });
    }

    /**
     * Desenha ou atualiza o gráfico de faturamento (Linha).
     */
    function renderizarGraficoFaturamentoDia(dados) {
        // Ordena os dias para o gráfico de linha
        const labelsOrdenados = Object.keys(dados).sort();
        const dataOrdenada = labelsOrdenados.map(dia => dados[dia]);
        
        if (graficoFaturamento) {
            graficoFaturamento.destroy();
        }
        graficoFaturamento = new Chart(ctxFaturamentoDia, {
            type: 'line',
            data: {
                labels: labelsOrdenados,
                datasets: [{
                    label: 'Faturamento Diário (R$)',
                    data: dataOrdenada,
                    fill: false,
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1
                }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false
            }
        });
    }

    // --- Event Listeners ---
    document.getElementById('btn-gerar-relatorio').addEventListener('click', gerarRelatorio);
    
    // Carrega o relatório ao iniciar
    gerarRelatorio();
});
