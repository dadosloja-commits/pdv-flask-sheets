document.addEventListener('DOMContentLoaded', () => {
    const btnAtualizarEstoque = document.getElementById('btn-atualizar-estoque');
    const tabelaCorpo = document.getElementById('estoque-tabela-corpo');
    const filtroInput = document.getElementById('filtro-estoque');
    let cacheEstoque = [];

    const scannerModalEl = document.getElementById('scannerModal');
    const scannerModal = new bootstrap.Modal(scannerModalEl);
    const btnSwitchCamera = document.getElementById('btn-switch-camera');

    const editModalEl = document.getElementById('editModal');
    const editModal = new bootstrap.Modal(editModalEl);
    const formEdit = document.getElementById('form-edit-produto');
    const btnSalvarEdicao = document.getElementById('btn-salvar-edicao');
    const spinnerSalvarEdicao = document.getElementById('spinner-salvar-edicao');
    const editModalTitle = document.getElementById('edit-modal-title');

    async function atualizarEstoque() {
        tabelaCorpo.innerHTML = '<tr><td colspan="7" class="text-center">Carregando...</td></tr>';
        try {
            const response = await fetch('/api/estoque');
            const estoque = await response.json();
            
            if (response.ok) {
                cacheEstoque = estoque;
                renderizarTabela(estoque);
            } else {
                tabelaCorpo.innerHTML = `<tr class="table-danger"><td colspan="7" class="text-center">Erro: ${estoque.erro}</td></tr>`;
            }
        } catch (error) {
            tabelaCorpo.innerHTML = `<tr class="table-danger"><td colspan="7" class="text-center">Erro de conexão ao carregar estoque.</td></tr>`;
        }
    }
    
    function renderizarTabela(itens) {
        tabelaCorpo.innerHTML = '';
        if (itens.length === 0) {
            tabelaCorpo.innerHTML = '<tr><td colspan="7" class="text-center">Nenhum produto cadastrado.</td></tr>';
            return;
        }
        itens.forEach(produto => {
            const linha = document.createElement('tr');
            linha.innerHTML = `
                <td>${produto.codigo_barras}</td>
                <td>${produto.nome}</td>
                <td>${parseFloat(produto.preco).toFixed(2)}</td>
                <td>${produto.quantidade}</td>
                <td>${produto.categoria}</td>
                <td>${produto.descricao}</td>
                <td>
                    <button class="btn btn-outline-primary btn-sm" data-produto-codigo="${produto.codigo_barras}" onclick="window.consulta.abrirModalEdicao(this)">
                        <i class="bi bi-pencil"></i>
                    </button>
                </td>
            `;
            if (produto.quantidade <= 5 && produto.quantidade > 0) {
                linha.classList.add('table-warning');
            } else if (produto.quantidade == 0) {
                linha.classList.add('table-danger');
            }
            tabelaCorpo.appendChild(linha);
        });
    }

    filtroInput.addEventListener('keyup', () => {
        const termo = filtroInput.value.toLowerCase();
        const itensFiltrados = cacheEstoque.filter(produto => {
            return produto.nome.toLowerCase().includes(termo) || 
                   produto.codigo_barras.toString().toLowerCase().includes(termo);
        });
        renderizarTabela(itensFiltrados);
    });

    function abrirModalEdicao(button) {
        const codigo = button.getAttribute('data-produto-codigo');
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
        document.getElementById('edit-preco').value = parseFloat(produto.preco).toFixed(2);
        document.getElementById('edit-qtd').value = produto.quantidade;
        
        editModal.show();
    }

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
                await atualizarEstoque();
                filtroInput.dispatchEvent(new Event('keyup', { 'bubbles': true }));
            } else {
                mostrarMensagem(resultado.erro, 'erro');
            }
        } catch (error) {
            mostrarMensagem('Erro de conexão ao salvar.', 'erro');
        } finally {
            spinnerSalvarEdicao.style.display = 'none';
            btnSalvarEdicao.disabled = false;
        }
    }
    
    btnSalvarEdicao.addEventListener('click', salvarEdicao);
    btnAtualizarEstoque.addEventListener('click', atualizarEstoque);
    atualizarEstoque();

    let codeReader = null;
    let videoInputDevices = [];
    let currentCameraIndex = 0;

    function startScanner() {
        if (codeReader && videoInputDevices.length > 0) {
            const deviceId = videoInputDevices[currentCameraIndex].deviceId;
            
            codeReader.decodeFromVideoDevice(deviceId, 'video-scanner', (result, err) => {
                if (result) {
                    filtroInput.value = result.text;
                    scannerModal.hide();
                    if (navigator.vibrate) { navigator.vibrate(100); }
                    filtroInput.dispatchEvent(new Event('keyup', { 'bubbles': true }));
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

    window.consulta = {
        abrirModalEdicao
    };
});