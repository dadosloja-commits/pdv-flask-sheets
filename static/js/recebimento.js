document.addEventListener('DOMContentLoaded', () => {
    // --- Referências do DOM ---
    const formRecebimento = document.getElementById('form-recebimento');
    const inputCodigo = document.getElementById('rec-codigo');
    const inputNome = document.getElementById('rec-nome');
    const inputDesc = document.getElementById('rec-desc');
    const inputCat = document.getElementById('rec-cat');
    const inputPreco = document.getElementById('rec-preco');
    const inputQtd = document.getElementById('rec-qtd');
    
    const btnSubmit = document.getElementById('btn-submit-recebimento');
    const spinnerRecebimento = document.getElementById('spinner-recebimento');
    const iconRecebimento = document.getElementById('icon-recebimento');
    const lookupResultado = document.getElementById('lookup-resultado');
    
    // --- Referências do Scanner (para o módulo) ---
    const scannerModalEl = document.getElementById('scannerModal');
    const videoElement = document.getElementById('video-scanner');
    const btnSwitchCamera = document.getElementById('btn-switch-camera');

    // --- Variáveis de Estado ---
    let estadoFormulario = null; // 'cadastro' ou 'atualizacao'
    let produtoExistente = null;

    /**
     * Reseta o formulário para o estado inicial (travado).
     */
    function resetarFormulario() {
        formRecebimento.reset();
        inputNome.disabled = true;
        inputDesc.disabled = true;
        inputCat.disabled = true;
        inputPreco.disabled = true;
        
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = `<i class="bi bi-search" id="icon-recebimento"></i> Digite um código para começar`;
        iconRecebimento.style.display = 'inline-block';
        spinnerRecebimento.style.display = 'none';
        
        lookupResultado.innerHTML = '';
        estadoFormulario = null;
        produtoExistente = null;
        inputCodigo.focus();
    }

    /**
     * Alterna a UI do formulário para o modo de cadastro de novo produto.
     */
    function modoCadastro() {
        produtoExistente = null;
        estadoFormulario = 'cadastro';
        
        inputNome.value = '';
        inputDesc.value = '';
        inputCat.value = '';
        inputPreco.value = '';
        inputQtd.value = 1;

        inputNome.disabled = false;
        inputDesc.disabled = false;
        inputCat.disabled = false;
        inputPreco.disabled = false;
        inputQtd.disabled = false;

        lookupResultado.innerHTML = `<div class="alert alert-warning p-2">Produto não encontrado. Preencha os campos para cadastrá-lo.</div>`;
        btnSubmit.innerHTML = `<i class="bi bi-save" id="icon-recebimento"></i> Cadastrar Novo Produto`;
        btnSubmit.disabled = false;
        inputNome.focus();
    }

    /**
     * Alterna a UI do formulário para o modo de atualização de estoque.
     */
    function modoAtualizacao(produto) {
        produtoExistente = produto;
        estadoFormulario = 'atualizacao';
        
        inputNome.value = produto.nome;
        inputDesc.value = produto.descricao;
        inputCat.value = produto.categoria;
        inputPreco.value = parseFloat(String(produto.preco).replace(',', '.')).toFixed(2);
        inputQtd.value = 1;
        
        inputNome.disabled = true;
        inputDesc.disabled = true;
        inputCat.disabled = true;
        inputPreco.disabled = true;
        inputQtd.disabled = false;
        
        lookupResultado.innerHTML = `<div class="alert alert-info p-2">Produto encontrado: <strong>${produto.nome}</strong>. (Estoque atual: ${produto.quantidade})</div>`;
        btnSubmit.innerHTML = `<i class="bi bi-plus-circle" id="icon-recebimento"></i> Adicionar ao Estoque`;
        btnSubmit.disabled = false;
        inputQtd.focus();
    }

    /**
     * Busca o produto na API e decide se entra em modo 'cadastro' ou 'atualizacao'.
     */
    async function buscarProduto(codigo) {
        if (!codigo) {
            resetarFormulario();
            return;
        }

        lookupResultado.innerHTML = `<span class="text-muted">Buscando...</span>`;
        btnSubmit.disabled = true;

        try {
            const response = await fetch(`/api/produto/${codigo}`);
            const produto = await response.json();

            if (response.ok) {
                modoAtualizacao(produto);
            } else if (response.status === 404) {
                modoCadastro();
            } else {
                lookupResultado.innerHTML = `<div class="alert alert-danger p-2">Erro: ${produto.erro}</div>`;
            }

        } catch (error) {
            lookupResultado.innerHTML = `<div class="alert alert-danger p-2">Erro de conexão.</div>`;
            console.error(error);
        }
    }
    
    /**
     * Envia os dados para a API de cadastro (POST).
     */
    async function cadastrarNovoProduto() {
        const dadosProduto = {
            codigo_barras: inputCodigo.value,
            nome: inputNome.value,
            descricao: inputDesc.value,
            categoria: inputCat.value,
            preco: inputPreco.value,
            quantidade: inputQtd.value
        };

        try {
            const response = await fetch('/api/produto', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dadosProduto)
            });
            const resultado = await response.json();
            if (response.ok) {
                mostrarMensagem(resultado.sucesso, 'sucesso');
                resetarFormulario();
            } else {
                mostrarMensagem(resultado.erro, 'erro');
            }
        } catch (error) {
            mostrarMensagem('Erro de conexão com o servidor.', 'erro');
            console.error(error);
        }
    }

    /**
     * Envia os dados para a API de atualização (PUT).
     */
    async function adicionarEstoque() {
        const quantidadeAdicionar = parseInt(inputQtd.value);
        if (quantidadeAdicionar <= 0) {
            mostrarMensagem('Quantidade a adicionar deve ser positiva.', 'erro');
            return;
        }

        const novaQuantidade = produtoExistente.quantidade + quantidadeAdicionar;

        try {
            const response = await fetch(`/api/produto/${produtoExistente.codigo_barras}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quantidade: novaQuantidade })
            });
            const resultado = await response.json();
            if (response.ok) {
                mostrarMensagem(`Estoque atualizado para ${novaQuantidade} unidades.`, 'sucesso');
                resetarFormulario();
            } else {
                mostrarMensagem(resultado.erro, 'erro');
            }
        } catch (error) {
            mostrarMensagem('Erro de conexão com o servidor.', 'erro');
            console.error(error);
        }
    }
    
    // --- Event Listeners ---

    inputCodigo.addEventListener('change', () => buscarProduto(inputCodigo.value));
    
    formRecebimento.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        btnSubmit.disabled = true;
        spinnerRecebimento.style.display = 'inline-block';
        iconRecebimento.style.display = 'none';

        try {
            if (estadoFormulario === 'cadastro') {
                await cadastrarNovoProduto();
            } else if (estadoFormulario === 'atualizacao') {
                await adicionarEstoque();
            }
        } finally {
            spinnerRecebimento.style.display = 'none';
            btnSubmit.disabled = false;
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

    // Define o estado inicial do formulário
    resetarFormulario();
});
