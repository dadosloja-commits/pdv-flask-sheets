document.addEventListener('DOMContentLoaded', () => {
    // --- Referências do DOM ---
    const btnAtualizarEstoque = document.getElementById('btn-atualizar-estoque');
    const tabelaCorpo = document.getElementById('estoque-tabela-corpo');
    const filtroInput = document.getElementById('filtro-estoque');
    
    // --- Referências do Modal de Edição ---
    const editModalEl = document.getElementById('editModal');
    const editModal = new bootstrap.Modal(editModalEl);
    const btnSalvarEdicao = document.getElementById('btn-salvar-edicao');
    const spinnerSalvarEdicao = document.getElementById('spinner-salvar-edicao');
    const editModalTitle = document.getElementById('edit-modal-title');

    // --- Referências do Scanner (para o módulo) ---
    const scannerModalEl = document.getElementById('scannerModal');
    const videoElement = document.getElementById('video-scanner');
    const btnSwitchCamera = document.getElementById('btn-switch-camera');
    
    // --- Variáveis de Estado ---
    let cacheEstoque = [];

    /**
     * Busca o /api/estoque, armazena no cache e renderiza a tabela.
     */
    async function atualizarEstoque() {
        tabelaCorpo.innerHTML = '<tr><td colspan="7" class="text-center">Carregando...</td></tr>';
        try {
            const response = await fetch('/api/estoque');
            if (!response.ok) {
                const erro = await response.json();
                throw new Error(erro.erro || 'Falha ao carregar');
            }
            
            cacheEstoque = await response.json();
            renderizarTabela(cacheEstoque);

        } catch (error) {
            tabelaCorpo.innerHTML = `<tr class="table-danger"><td colspan="7" class="text-center">Erro: ${error.message}</td></tr>`;
            console.error(error);
        }
    }
    
    /**
     * Desenha as linhas da tabela com base em uma lista de produtos.
     */
    function renderizarTabela(itens) {
        tabelaCorpo.innerHTML = '';
        if (itens.length === 0) {
            tabelaCorpo.innerHTML = '<tr><td colspan="7" class="text-center">Nenhum produto encontrado.</td></tr>';
            return;
        }
        
        const fragment = document.createDocumentFragment();
        itens.forEach(produto => {
            const linha = document.createElement('tr');
            
            // Garante que o preço seja um número para toFixed funcionar
            const precoNum = parseFloat(String(produto.preco).replace(',', '.'));
            
            linha.innerHTML = `
                <td>${produto.codigo_barras}</td>
                <td>${produto.nome}</td>
                <td>${precoNum.toFixed(2)}</td>
                <td>${produto.quantidade}</td>
                <td>${produto.categoria}</td>
                <td>${produto.descricao}</td>
                <td>
                    <button class="btn btn-outline-primary btn-sm" data-produto-codigo="${produto.codigo_barras}">
                        <i class="bi bi-pencil"></i>
                    </button>
                </td>
            `;
            
            // Adiciona classes de alerta de estoque
            if (produto.quantidade <= 5 && produto.quantidade > 0) {
                linha.classList.add('table-warning');
            } else if (produto.quantidade == 0) {
                linha.classList.add('table-danger');
            }
            
            fragment.appendChild(linha);
        });
        tabelaCorpo.appendChild(fragment);
    }

    /**
     * Filtra o 'cacheEstoque' local com base no termo de busca e renderiza.
     */
    function filtrarTabela() {
        const termo = filtroInput.value.toLowerCase();
        const itensFiltrados = cacheEstoque.filter(produto => {
            return produto.nome.toLowerCase().includes(termo) || 
                   produto.codigo_barras.toString().toLowerCase().includes(termo);
        });
        renderizarTabela(itensFiltrados);
    }

    /**
     * Preenche e abre o modal de edição com dados do produto.
     */
    function abrirModalEdicao(codigo) {
        const produto = cacheEstoque.find(p => p.codigo_barras == codigo);
        
        if (!produto) {
            mostrarMensagem('Produto não encontrado no cache.', 'erro');
            return;
        }

        editModalTitle.textContent = produto.nome;
        document.getElementById('edit-codigo').value = produto.codigo_barras;
        document.getElementById('edit-nome').value = produto.nome;
        document.getElementById('edit-desc').value = produto.descricao;
        document.getElementById('edit-cat').value = produto.categoria;
        
        // Garante que o preço seja um número para toFixed funcionar
        const precoNum = parseFloat(String(produto.preco).replace(',', '.'));
        document.getElementById('edit-preco').value = precoNum.toFixed(2);
        
        document.getElementById('edit-qtd').value = produto.quantidade;
        
        editModal.show();
    }

    /**
     * Envia os dados do modal de edição para a API (PUT).
     */
    async function salvarEdicao() {
        spinnerSalvarEdicao.style.display = 'inline-block';
        btnSalvarEdicao.disabled = true;
        
        const codigo = document.getElementById('edit-codigo').value;
        const dadosAtualizados = {
            nome: document.getElementById('edit-nome').value,
            descricao: document.getElementById('edit-desc').value,
            categoria: document.getElementById('edit-cat').value,
            preco: parseFloat(document.getElementById('edit-preco').value),
            quantidade: parseInt(document.getElementById('edit-qtd').value)
        };

        try {
            const response = await fetch(`/api/produto/${codigo}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dadosAtualizados)
            });
            
            const resultado = await response.json();
            
            if (response.ok) {
                mostrarMensagem('Produto atualizado com sucesso!', 'sucesso');
                editModal.hide();
                await atualizarEstoque(); // Recarrega o cache
                filtrarTabela(); // Re-aplica o filtro
            } else {
                mostrarMensagem(resultado.erro, 'erro');
            }
        } catch (error) {
            mostrarMensagem('Erro de conexão ao salvar.', 'erro');
            console.error(error);
        } finally {
            spinnerSalvarEdicao.style.display = 'none';
            btnSalvarEdicao.disabled = false;
        }
    }
    
    // --- Event Listeners ---
    
    btnSalvarEdicao.addEventListener('click', salvarEdicao);
    btnAtualizarEstoque.addEventListener('click', atualizarEstoque);
    filtroInput.addEventListener('keyup', filtrarTabela);
    
    // Delegação de eventos para o botão "Editar"
    tabelaCorpo.addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (button) {
            const codigo = button.dataset.produtoCodigo;
            abrirModalEdicao(codigo);
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
            filtroInput.value = codigoLido;
            filtrarTabela(); // Dispara a filtragem
        },
        (erro) => {
            // Callback de Erro
            mostrarMensagem(`Erro no scanner: ${erro.message}`, 'erro');
        }
    );
    
    // Carrega o estoque inicial
    atualizarEstoque();

    // Remove a exposição global, já que usamos delegação de eventos
    // window.consulta = {
    //     abrirModalEdicao
    // };
});
