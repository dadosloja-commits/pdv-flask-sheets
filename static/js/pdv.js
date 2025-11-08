document.addEventListener('DOMContentLoaded', () => {
    const scannerModalEl = document.getElementById('scannerModal');
    const scannerModal = new bootstrap.Modal(scannerModalEl);
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
    
    const btnSwitchCamera = document.getElementById('btn-switch-camera');
    
    const pdvBuscaNome = document.getElementById('pdv-busca-nome');
    const datalistProdutos = document.getElementById('lista-produtos-nome');

    const spinnerFinalizar = document.getElementById('spinner-finalizar');
    const iconFinalizar = document.getElementById('icon-finalizar');

    let codeReader = null;
    let carrinho = [];
    let videoInputDevices = [];
    let currentCameraIndex = 0;
    
    let cacheProdutos = [];

    async function carregarCacheProdutos() {
        try {
            const response = await fetch('/api/estoque');
            if (response.ok) {
                cacheProdutos = await response.json();
                datalistProdutos.innerHTML = '';
                cacheProdutos.forEach(produto => {
                    const option = document.createElement('option');
                    option.value = `${produto.nome} (Cod: ${produto.codigo_barras})`;
                    datalistProdutos.appendChild(option);
                });
            }
        } catch (error) {
            console.error("Falha ao carregar cache de produtos:", error);
        }
    }
    
    pdvBuscaNome.addEventListener('input', (e) => {
        const valorInput = e.target.value;
        const produtoSelecionado = cacheProdutos.find(p => `${p.nome} (Cod: ${p.codigo_barras})` === valorInput);
        
        if (produtoSelecionado) {
            adicionarProdutoAoCarrinho(produtoSelecionado.codigo_barras, 1);
            pdvBuscaNome.value = '';
        }
    });

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

    inputCodigo.addEventListener('change', () => {
        if (inputCodigo.value) {
            buscarProduto(inputCodigo.value);
        }
    });

    async function buscarProduto(codigo) {
        lookupResultado.innerHTML = `<span class="text-muted">Buscando...</span>`;
        try {
            const response = await fetch(`/api/produto/${codigo}`);
            const produto = await response.json();
            
            if (response.ok) {
                lookupResultado.innerHTML = `
                    <div class="alert alert-info p-2">
                        <strong>${produto.nome}</strong>
                        <br>
                        Preço: R$ ${produto.preco.toFixed(2)}
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

    formAddItem.addEventListener('submit', (e) => {
        e.preventDefault();
        const codigo = inputCodigo.value;
        const quantidade = parseInt(inputQtd.value);
        adicionarProdutoAoCarrinho(codigo, quantidade);
    });

    async function adicionarProdutoAoCarrinho(codigo, quantidade) {
        if (!codigo || !quantidade || quantidade <= 0) {
            mostrarMensagem('Código ou quantidade inválida.', 'erro');
            return;
        }

        try {
            const response = await fetch(`/api/produto/${codigo}`);
            const produto = await response.json();
            
            if (!response.ok) {
                mostrarMensagem(produto.erro, 'erro');
                return;
            }

            const itemExistente = carrinho.find(item => item.codigo_barras === codigo);
            const qtdTotalNecessaria = (itemExistente ? itemExistente.quantidade : 0) + quantidade;

            if (produto.quantidade < qtdTotalNecessaria) {
                mostrarMensagem(`Estoque insuficiente. Disponível: ${produto.quantidade}`, 'erro');
                return;
            }
            
            if (itemExistente) {
                itemExistente.quantidade += quantidade;
                itemExistente.total = itemExistente.quantidade * itemExistente.preco_unit;
            } else {
                carrinho.push({
                    codigo_barras: produto.codigo_barras,
                    nome: produto.nome,
                    quantidade: quantidade,
                    preco_unit: produto.preco,
                    total: quantidade * produto.preco
                });
            }
            
            atualizarCarrinhoVisual();
            
            formAddItem.reset();
            inputQtd.value = 1;
            lookupResultado.innerHTML = '';
            inputCodigo.focus();

        } catch (error) {
            mostrarMensagem('Erro ao adicionar item.', 'erro');
        }
    }

    function atualizarCarrinhoVisual() {
        if (carrinho.length === 0) {
            itemCarrinhoVazio.style.display = 'block';
            listaCarrinho.innerHTML = '';
            listaCarrinho.appendChild(itemCarrinhoVazio);
        } else {
            itemCarrinhoVazio.style.display = 'none';
            listaCarrinho.innerHTML = '';
        }
        
        let totalItens = 0;
        let totalValor = 0;

        carrinho.forEach((item, index) => {
            totalItens += item.quantidade;
            totalValor += item.total;

            const itemHTML = `
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                        <span class="fw-bold">${item.nome}</span>
                        <br>
                        <small class="text-muted">R$ ${item.preco_unit.toFixed(2)}</small>
                    </div>
                    <div class="d-flex align-items-center">
                        <button class="btn btn-outline-secondary btn-sm" onclick="window.pdv.diminuirItem(${index})">
                            <i class="bi bi-dash-lg"></i>
                        </button>
                        <span class="mx-2">${item.quantidade}</span>
                        <button class="btn btn-outline-secondary btn-sm" onclick="window.pdv.aumentarItem(${index})">
                            <i class="bi bi-plus-lg"></i>
                        </button>
                        
                        <span class="badge bg-primary rounded-pill fs-6 ms-3" style="min-width: 90px;">R$ ${item.total.toFixed(2)}</span>
                        
                    </div>
                </li>
            `;
            listaCarrinho.insertAdjacentHTML('beforeend', itemHTML);
        });

        spanTotalItens.textContent = totalItens;
        spanTotalValor.textContent = totalValor.toFixed(2);
        btnFinalizarVenda.disabled = (carrinho.length === 0);
    }
    
    function aumentarItem(index) {
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
    
    btnLimparCarrinho.addEventListener('click', () => {
        carrinho = [];
        atualizarCarrinhoVisual();
    });
    
    async function finalizarVenda() {
        if (carrinho.length === 0) {
            mostrarMensagem('Carrinho está vazio.', 'erro');
            return;
        }

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
                carregarCacheProdutos();
            } else {
                mostrarMensagem(resultado.erro, 'erro');
            }
        } catch (error) {
            mostrarMensagem('Erro de conexão ao finalizar venda.', 'erro');
        } finally {
            spinnerFinalizar.style.display = 'none';
            iconFinalizar.style.display = 'inline-block';
            btnFinalizarVenda.disabled = (carrinho.length === 0);
        }
    }
    
    btnFinalizarVenda.addEventListener('click', finalizarVenda);

    function gerarCupom(idVenda) {
        window.open(`/cupom/${idVenda}`, '_blank');
    }

    window.pdv = {
        aumentarItem,
        diminuirItem
    };

    carregarCacheProdutos();
});