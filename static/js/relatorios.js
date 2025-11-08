document.addEventListener('DOMContentLoaded', () => {
    const ctxProdutos = document.getElementById('grafico-produtos');
    const ctxFaturamentoDia = document.getElementById('grafico-faturamento-dia');
    let graficoProdutos = null;
    let graficoFaturamento = null;

    const kpiFaturamento = document.getElementById('kpi-faturamento');
    const kpiVendas = document.getElementById('kpi-vendas');
    const kpiMaisVendido = document.getElementById('kpi-mais-vendido');

    async function gerarRelatorio() {
        try {
            const response = await fetch('/api/relatorio/vendas');
            if (!response.ok) {
                mostrarMensagem('Falha ao buscar dados das vendas.', 'erro');
                return;
            }
            const vendas = await response.json();
            
            processarKPIs(vendas);
            processarGraficoProdutos(vendas);
            processarGraficoFaturamentoDia(vendas);
            
            mostrarMensagem('Relatórios atualizados!', 'sucesso');
            
        } catch (error) {
            mostrarMensagem('Erro de conexão ao gerar relatório.', 'erro');
        }
    }
    
    function processarKPIs(vendas) {
        if (vendas.length === 0) {
            kpiFaturamento.textContent = 'R$ 0.00';
            kpiVendas.textContent = '0';
            kpiMaisVendido.textContent = '-';
            return;
        }

        // CORRIGIDO: Adiciona replace para tratar vírgula
        const faturamentoTotal = vendas.reduce((acc, venda) => acc + parseFloat(String(venda.total_item).replace(',', '.')), 0);
        kpiFaturamento.textContent = `R$ ${faturamentoTotal.toFixed(2)}`;
        
        const idsVendasUnicas = [...new Set(vendas.map(v => v.id_venda))];
        kpiVendas.textContent = idsVendasUnicas.length;
        
        const vendasPorProduto = {};
        vendas.forEach(venda => {
            const nome = venda.nome_produto;
            const qtd = parseInt(venda.quantidade_vendida);
            vendasPorProduto[nome] = (vendasPorProduto[nome] || 0) + qtd;
        });
        
        let maisVendidoNome = '-';
        let maisVendidoQtd = 0;
        for (const [nome, qtd] of Object.entries(vendasPorProduto)) {
            if (qtd > maisVendidoQtd) {
                maisVendidoQtd = qtd;
                maisVendidoNome = nome;
            }
        }
        kpiMaisVendido.textContent = maisVendidoNome;
    }

    function processarGraficoProdutos(vendas) {
        const vendasPorProduto = {};
        vendas.forEach(venda => {
            const nome = venda.nome_produto;
            const qtd = parseInt(venda.quantidade_vendida);
            vendasPorProduto[nome] = (vendasPorProduto[nome] || 0) + qtd;
        });
        
        if (graficoProdutos) graficoProdutos.destroy();
        
        graficoProdutos = new Chart(ctxProdutos, {
            type: 'doughnut',
            data: {
                labels: Object.keys(vendasPorProduto),
                datasets: [{
                    label: 'Quantidade Vendida',
                    data: Object.values(vendasPorProduto),
                    borderWidth: 1
                }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false
            }
        });
    }

    function processarGraficoFaturamentoDia(vendas) {
        const vendasPorDia = {};
        vendas.forEach(venda => {
            const dia = venda.data_hora.split(' ')[0];
            // CORRIGIDO: Adiciona replace para tratar vírgula
            const total = parseFloat(String(venda.total_item).replace(',', '.'));
            vendasPorDia[dia] = (vendasPorDia[dia] || 0) + total;
        });

        const labelsOrdenados = Object.keys(vendasPorDia).sort();
        const dataOrdenada = labelsOrdenados.map(dia => vendasPorDia[dia]);
        
        if (graficoFaturamento) graficoFaturamento.destroy();

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

    document.getElementById('btn-gerar-relatorio').addEventListener('click', gerarRelatorio);
    
    // CORRIGIDO: Chamada direta da função
    gerarRelatorio();
});