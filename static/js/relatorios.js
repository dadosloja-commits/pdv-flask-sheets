document.addEventListener('DOMContentLoaded', () => {
    // Referências aos elementos <canvas>
    const ctxFaturamentoDia = document.getElementById('grafico-faturamento-dia');
    const ctxCategorias = document.getElementById('grafico-categorias');
    const ctxTopProdutos = document.getElementById('grafico-top-produtos');
    
    // Variáveis para guardar as instâncias dos gráficos
    let graficoFaturamento = null;
    let graficoCategorias = null;
    let graficoTopProdutos = null;

    // Referências aos KPIs de Vendas
    const kpiFaturamentoHoje = document.getElementById('kpi-faturamento-hoje');
    const kpiPedidosHoje = document.getElementById('kpi-pedidos-hoje');
    const kpiFaturamentoMes = document.getElementById('kpi-faturamento-mes');
    const kpiPedidosMes = document.getElementById('kpi-pedidos-mes');

    // Referências aos KPIs de Estoque
    const kpiValorEstoque = document.getElementById('kpi-valor-estoque');
    const kpiBaixoEstoque = document.getElementById('kpi-baixo-estoque');
    const listaBaixoEstoque = document.getElementById('lista-baixo-estoque');

    // Função para formatar valores como moeda (R$)
    function formatarMoeda(valor) {
        return valor.toLocaleString('pt-br', { style: 'currency', currency: 'BRL' });
    }

    // 1. Função para carregar dados de VENDAS
    async function carregarRelatorioVendas() {
        try {
            const response = await fetch('/api/relatorio/vendas');
            if (!response.ok) {
                mostrarMensagem('Falha ao buscar dados de vendas.', 'erro');
                return;
            }
            const dados = await response.json();

            // Preenche KPIs de Vendas
            kpiFaturamentoHoje.textContent = formatarMoeda(dados.kpis.faturamento_hoje);
            kpiPedidosHoje.textContent = dados.kpis.pedidos_hoje;
            kpiFaturamentoMes.textContent = formatarMoeda(dados.kpis.faturamento_mes);
            kpiPedidosMes.textContent = dados.kpis.pedidos_mes;

            // Renderiza Gráficos de Vendas
            renderizarGraficoFaturamento(dados.graficos.faturamento_ultimos_30_dias);
            renderizarGraficoCategorias(dados.graficos.vendas_por_categoria);
            renderizarGraficoTopProdutos(dados.graficos.produtos_mais_vendidos);

        } catch (error) {
            mostrarMensagem('Erro de conexão ao buscar vendas.', 'erro');
            console.error(error);
        }
    }

    // 2. Função para carregar dados de ESTOQUE
    async function carregarRelatorioEstoque() {
        try {
            const response = await fetch('/api/relatorio/estoque');
            if (!response.ok) {
                mostrarMensagem('Falha ao buscar dados de estoque.', 'erro');
                return;
            }
            const dados = await response.json();

            // Preenche KPIs de Estoque
            kpiValorEstoque.textContent = formatarMoeda(dados.kpis.valor_total_estoque);
            kpiBaixoEstoque.textContent = dados.kpis.itens_baixo_estoque_contagem;

            // Preenche Lista de Baixo Estoque
            listaBaixoEstoque.innerHTML = '';
            if (dados.listas.itens_baixo_estoque_nomes.length === 0) {
                listaBaixoEstoque.innerHTML = '<li class="list-group-item text-success">Nenhum item com baixo estoque.</li>';
            } else {
                dados.listas.itens_baixo_estoque_nomes.forEach(item => {
                    const li = document.createElement('li');
                    li.className = 'list-group-item list-group-item-warning';
                    li.textContent = item;
                    listaBaixoEstoque.appendChild(li);
                });
            }

        } catch (error) {
            mostrarMensagem('Erro de conexão ao buscar estoque.', 'erro');
            console.error(error);
        }
    }

    // 3. Funções para RENDERIZAR os gráficos
    
    function renderizarGraficoFaturamento(dados) {
        if (graficoFaturamento) graficoFaturamento.destroy();
        
        graficoFaturamento = new Chart(ctxFaturamentoDia, {
            type: 'line',
            data: {
                labels: Object.keys(dados),
                datasets: [{
                    label: 'Faturamento Diário (R$)',
                    data: Object.values(dados),
                    fill: false,
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    function renderizarGraficoCategorias(dados) {
        if (graficoCategorias) graficoCategorias.destroy();
        
        graficoCategorias = new Chart(ctxCategorias, {
            type: 'doughnut',
            data: {
                labels: Object.keys(dados),
                datasets: [{
                    label: 'Vendas por Categoria',
                    data: Object.values(dados),
                    borderWidth: 1
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    function renderizarGraficoTopProdutos(dados) {
        if (graficoTopProdutos) graficoTopProdutos.destroy();
        
        graficoTopProdutos = new Chart(ctxTopProdutos, {
            type: 'bar',
            data: {
                labels: Object.keys(dados),
                datasets: [{
                    label: 'Top 5 Produtos (Qtd)',
                    data: Object.values(dados),
                    backgroundColor: 'rgba(54, 162, 235, 0.6)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1
                }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false,
                indexAxis: 'y', // Faz o gráfico de barras deitado
            }
        });
    }

    // Função "Mestra" que chama tudo
    async function atualizarTudo() {
        await carregarRelatorioVendas();
        await carregarRelatorioEstoque();
        mostrarMensagem('Dashboard atualizado!', 'sucesso');
    }

    // Event Listeners
    document.getElementById('btn-atualizar-relatorios').addEventListener('click', atualizarTudo);
    
    // Carrega tudo assim que a página é aberta
    atualizarTudo();
});
