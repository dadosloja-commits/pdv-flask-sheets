document.addEventListener('DOMContentLoaded', () => {
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
    
    const scannerModalEl = document.getElementById('scannerModal');
    const scannerModal = new bootstrap.Modal(scannerModalEl);
    const btnSwitchCamera = document.getElementById('btn-switch-camera');

    let codeReader = null;
    let videoInputDevices = [];
    let currentCameraIndex = 0;
    
    let estadoFormulario = null;
    let produtoExistente = null;

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
                produtoExistente = produto;
                estadoFormulario = 'atualizacao';
                
                inputNome.value = produto.nome;
                inputDesc.value = produto.descricao;
                inputCat.value = produto.categoria;
                inputPreco.value = produto.preco.toFixed(2);
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
                
            } else if (response.status === 404) {
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
            } else {
                lookupResultado.innerHTML = `<div class="alert alert-danger p-2">Erro: ${produto.erro}</div>`;
            }

        } catch (error) {
            lookupResultado.innerHTML = `<div class="alert alert-danger p-2">Erro de conexão.</div>`;
        }
    }
    
    inputCodigo.addEventListener('change', () => buscarProduto(inputCodigo.value));
    
    formRecebimento.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        btnSubmit.disabled = true;
        spinnerRecebimento.style.display = 'inline-block';
        iconRecebimento.style.display = 'none';

        if (estadoFormulario === 'cadastro') {
            await cadastrarNovoProduto();
        } else if (estadoFormulario === 'atualizacao') {
            await adicionarEstoque();
        }

        spinnerRecebimento.style.display = 'none';
        btnSubmit.disabled = false;
    });

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
        }
    }

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
        }
    }

    function startScanner() {
        if (codeReader && videoInputDevices.length > 0) {
            const deviceId = videoInputDevices[currentCameraIndex].deviceId;
            
            codeReader.decodeFromVideoDevice(deviceId, 'video-scanner', (result, err) => {
                if (result) {
                    inputCodigo.value = result.text;
                    scannerModal.hide();
                    if (navigator.vibrate) { navigator.vibrate(100); }
                    buscarProduto(result.text);
                }
                if (err && !(err instanceof ZXing.NotFoundException)) {
                    console.error(err);
                }
            }).catch(err => console.error("Erro ao decodificar:", err));
        }
    }

    scannerModalEl.addEventListener('shown.bs.modal', () => {
        codeReader = new ZXing.BrowserMultiFormatReader();
        
        codeReader.listVideoInputDevices()
            .then(devices => {
                if (devices.length === 0) {
                    throw new Error('Nenhuma câmera encontrada.');
                }
                videoInputDevices = devices;
                
                let initialCameraIndex = devices.length - 1;
                const rearCamEnv = devices.findIndex(d => d.label.toLowerCase().includes('environment'));
                const rearCamBack = devices.findIndex(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('traseira'));

                if (rearCamEnv !== -1) initialCameraIndex = rearCamEnv;
                else if (rearCamBack !== -1) initialCameraIndex = rearCamBack;
                
                currentCameraIndex = initialCameraIndex;
                btnSwitchCamera.disabled = videoInputDevices.length <= 1;
                
                startScanner();
            })
            .catch(err => {
                console.error("Erro grave ao listar câmeras:", err);
                mostrarMensagem('Falha ao listar câmeras.', 'erro');
                scannerModal.hide();
            });
    });

    scannerModalEl.addEventListener('hidden.bs.modal', () => {
        if (codeReader) {
            codeReader.reset();
        }
        videoInputDevices = [];
        currentCameraIndex = 0;
    });

    btnSwitchCamera.addEventListener('click', () => {
        if (codeReader && videoInputDevices.length > 1) {
            codeReader.reset();
            currentCameraIndex = (currentCameraIndex + 1) % videoInputDevices.length;
            startScanner();
        }
    });

    resetarFormulario();
});