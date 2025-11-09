document.addEventListener('DOMContentLoaded', () => {
    // --- Referências do DOM ---
    const inputCodigo = document.getElementById('pdv-codigo');
    const inputQtd = document.getElementById('pdv-qtd');
    const formAddItem = document.getElementById('form-add-item');
    const lookupResultado = document.getElementById('lookup-resultado');
    
    const listaCarrinho = document.getElementById('lista-carrinho');
    const itemCarrinhoVazio = document.getElementById('carrinho-vazio');
    const spanTotalItens = document.getElementById('carrinho-total-itens');
    const spanTotalValor = document.getElementById('carrinho-total-valor');
    const btnFinalizarVenda = document.getElementById('btn-finalizar-venda');
    const btnLimparCarrinho = document.getElementById('btn-limpar-carrinho');
    
    const pdvBuscaNome = document.getElementById('pdv-busca-nome');
    const datalistProdutos = document.getElementById('lista-produtos-nome');
    const spinnerFinalizar = document.getElementById('spinner-finalizar');
    const iconFinalizar = document.getElementById('icon-finalizar');

    // --- Referências do Scanner (para o módulo) ---
    const scannerModalEl = document.getElementById('scannerModal');
    const videoElement = document.getElementById('video-scanner');
    const btnSwitchCamera = document.getElementById('btn-switch-camera');

    // --- Variáveis de Estado ---
    let carrinho = [];
    let cacheProdutos = [];

    // --- Funções Principais ---

    /**
     * Busca o /api/estoque e preenche o cache e o datalist de busca por nome.
     */
    async function carregarCacheProdutos() {
        try {
            const response = await fetch('/api/estoque');
            if (!response.ok) throw new Error('Falha ao carregar estoque');
            
            cacheProdutos = await response.json();
            datalistProdutos.innerHTML = ''; // Limpa opções antigas
            
            const fragment = document.createDocumentFragment();
            cacheProdutos.forEach(produto => {
                const option = document.createElement('option');
                option.value = `${produto.nome} (Cod: ${produto.codigo_barras})`;
                fragment.appendChild(option);
            });
            datalistProdutos.appendChild(fragment);

        } catch (error) {
            console.error("Falha ao carregar cache de produtos:", error);
            mostrarMensagem('Falha ao carregar lista de produtos.', 'erro');
        }
    }
    
    /**
     * Busca um produto específico na API e exibe o resultado no card.
     */
    async function buscarProduto(codigo) {
        if (!codigo) return;
        lookupResultado.innerHTML = `<span class="text-muted">Buscando...</span>`;
        try {
            const response = await fetch(`/api/produto/${codigo}`);
            const produto = await response.json();
            
            if (response.ok) {
                // CORREÇÃO: Garante que o preço seja um número para toFixed funcionar
                const precoNum = parseFloat(String(produto.preco).replace(',', '.'));
                lookupResultado.innerHTML = `
                    <div class="alert alert-info p-2">
                        <strong>${produto.nome}</strong>
                        <br>
                        Preço: R$ ${precoNum.toFixed(2)}
                        <span class="float-end">Estoque: ${produto.quantidade}</span>
                    </div>
                `;
            } else {
                lookupResultado.innerHTML = `<div class="alert alert-danger p-2">${produto.erro}</div>`;
            }
        } catch (error) {
            lookupResultado.innerHTML = `<div class="alert alert-danger p-2">Erro de conexão</div>`;
        }
    }

    /**
     * Adiciona um produto ao carrinho ou atualiza a quantidade se já existir.
     */
    async function adicionarProdutoAoCarrinho(codigo, quantidade) {
        if (!codigo || !quantidade || quantidade <= 0) {
            mostrarMensagem('Código ou quantidade inválida.', 'erro');
            return;
        }

        try {
            // Busca o produto no cache local primeiro
            let produto = cacheProdutos.find(p => p.codigo_barras == codigo);
            
            // Se não achar no cache (ex: recém-cadastrado), busca na API
            if (!produto) {
                const response = await fetch(`/api/produto/${codigo}`);
                if (!response.ok) {
                    const erro = await response.json();
                    mostrarMensagem(erro.erro, 'erro');
                    return;
                }
                produto = await response.json();
            }

            const itemExistente = carrinho.find(item => item.codigo_barras === codigo);
            const qtdTotalNecessaria = (itemExistente ? itemExistente.quantidade : 0) + quantidade;

            // Usa a quantidade do cache/api (que é a mais atual)
            const estoqueDisponivel = parseInt(produto.quantidade);

            if (estoqueDisponivel < qtdTotalNecessaria) {
                mostrarMensagem(`Estoque insuficiente. Disponível: ${estoqueDisponivel}`, 'erro');
                return;
            }
            
            // CORREÇÃO: Garante que o preço seja um número para cálculo
            const precoUnit = parseFloat(String(produto.preco).replace(',', '.'));

            if (itemExistente) {
                itemExistente.quantidade += quantidade;
                itemExistente.total = itemExistente.quantidade * itemExistente.preco_unit;
            } else {
                carrinho.push({
                    codigo_barras: produto.codigo_barras,
                    nome: produto.nome,
                    quantidade: quantidade,
                    preco_unit: precoUnit,
                    total: quantidade * precoUnit
                });
            }
            
            atualizarCarrinhoVisual();
            
            formAddItem.reset();
            inputQtd.value = 1;
            lookupResultado.innerHTML = '';
            inputCodigo.focus();

        } catch (error) {
            mostrarMensagem('Erro ao adicionar item.', 'erro');
            console.error(error);
        }
    }

    /**
     * Redesenha a lista do carrinho no HTML com base no array 'carrinho'.
     */
    function atualizarCarrinhoVisual() {
        listaCarrinho.innerHTML = '';
        let totalItens = 0;
        let totalValor = 0;

        if (carrinho.length === 0) {
            listaCarrinho.appendChild(itemCarrinhoVazio);
            itemCarrinhoVazio.style.display = 'block';
        } else {
            itemCarrinhoVazio.style.display = 'none';
            const fragment = document.createDocumentFragment();

            carrinho.forEach((item, index) => {
                totalItens += item.quantidade;
                totalValor += item.total;

                const li = document.createElement('li');
                li.className = 'list-group-item d-flex justify-content-between align-items-center';
                li.innerHTML = `
                    <div>
                        <span class="fw-bold">${item.nome}</span>
                        <br>
                        <small class="text-muted">R$ ${item.preco_unit.toFixed(2)}</small>
                    </div>
                    <div class="d-flex align-items-center">
                        <button class="btn btn-outline-secondary btn-sm" data-index="${index}" data-action="diminuir">
                            <i class="bi bi-dash-lg"></i>
                        </button>
                        <span class="mx-2">${item.quantidade}</span>
                        <button class="btn btn-outline-secondary btn-sm" data-index="${index}" data-action="aumentar">
                            <i class="bi bi-plus-lg"></i>
                        </button>
                        <span class="badge bg-primary rounded-pill fs-6 ms-3" style="min-width: 90px;">R$ ${item.total.toFixed(2)}</span>
                    </div>
                `;
                fragment.appendChild(li);
            });
            listaCarrinho.appendChild(fragment);
        }

        spanTotalItens.textContent = totalItens;
        spanTotalValor.textContent = totalValor.toFixed(2);
        btnFinalizarVenda.disabled = (carrinho.length === 0);
    }
    
    function aumentarItem(index) {
        // Reutiliza a lógica de adicionar, que já checa o estoque
        adicionarProdutoAoCarrinho(carrinho[index].codigo_barras, 1);
    }

    function diminuirItem(index) {
        let item = carrinho[index];
        item.quantidade -= 1;
        if (item.quantidade <= 0) {
            carrinho.splice(index, 1);
        } else {
            item.total = item.quantidade * item.preco_unit;
        }
        atualizarCarrinhoVisual();
    }
    
    /**
     * Envia o carrinho para a API /api/venda.
     */
    async function finalizarVenda() {
        if (carrinho.length === 0) {
            mostrarMensagem('Carrinho está vazio.', 'erro');
            return;
        }

        // Ativa o spinner
        spinnerFinalizar.style.display = 'inline-block';
        iconFinalizar.style.display = 'none';
        btnFinalizarVenda.disabled = true;

        try {
            const response = await fetch('/api/venda', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itens: carrinho })
            });
            
            const resultado = await response.json();

            if (response.ok) {
                mostrarMensagem(`Venda ${resultado.id_venda} registrada com sucesso!`, 'sucesso');
                gerarCupom(resultado.id_venda);
                carrinho = [];
                atualizarCarrinhoVisual();
                carregarCacheProdutos(); // Recarrega o cache para atualizar o estoque
            } else {
                mostrarMensagem(resultado.erro, 'erro');
            }
        } catch (error) {
            mostrarMensagem('Erro de conexão ao finalizar venda.', 'erro');
            console.error(error);
        } finally {
            // Desativa o spinner
            spinnerFinalizar.style.display = 'none';
            iconFinalizar.style.display = 'inline-block';
            btnFinalizarVenda.disabled = (carrinho.length === 0);
        }
    }
    
    function gerarCupom(idVenda) {
        window.open(`/cupom/${idVenda}`, '_blank');
    }

    // --- Event Listeners ---

    formAddItem.addEventListener('submit', (e) => {
        e.preventDefault();
        const codigo = inputCodigo.value;
        const quantidade = parseInt(inputQtd.value);
        adicionarProdutoAoCarrinho(codigo, quantidade);
    });

    inputCodigo.addEventListener('change', () => buscarProduto(inputCodigo.value));
    
    btnLimparCarrinho.addEventListener('click', () => {
        carrinho = [];
        atualizarCarrinhoVisual();
    });
    
    btnFinalizarVenda.addEventListener('click', finalizarVenda);

    // Delegação de eventos para botões +/- do carrinho
    listaCarrinho.addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (!button) return;

        const action = button.dataset.action;
        const index = parseInt(button.dataset.index, 10);

        if (action === 'aumentar') {
            aumentarItem(index);
        } else if (action === 'diminuir') {
            diminuirItem(index);
        }
    });

    // Busca por nome
    pdvBuscaNome.addEventListener('input', (e) => {
        const valorInput = e.target.value;
        const produtoSelecionado = cacheProdutos.find(p => `${p.nome} (Cod: ${p.codigo_barras})` === valorInput);
        
        if (produtoSelecionado) {
            adicionarProdutoAoCarrinho(produtoSelecionado.codigo_barras, 1);
            pdvBuscaNome.value = '';
            inputCodigo.focus();
        }
    });

    // --- Inicialização ---

    // Inicializa o módulo do scanner
    createScanner(
        scannerModalEl, 
        videoElement, 
        btnSwitchCamera,
        (codigoLido) => {
            // Callback de Sucesso
            inputCodigo.value = codigoLido;
            buscarProduto(codigoLido);
        },
        (erro) => {
            // Callback de Erro
            mostrarMensagem(`Erro no scanner: ${erro.message}`, 'erro');
        }
    );

    // Carrega o cache de produtos ao iniciar
    carregarCacheProdutos();
});
