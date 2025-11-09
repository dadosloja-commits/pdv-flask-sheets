/*
 * Módulo Scanner Reutilizável
 * Encapsula toda a lógica do ZXing para ser usada em qualquer página.
 */
function createScanner(modalEl, videoEl, switchBtnEl, onScanSuccessCallback, onScanErrorCallback) {
    let codeReader = null;
    let videoInputDevices = [];
    let currentCameraIndex = 0;
    const scannerModal = new bootstrap.Modal(modalEl);

    function startScanner() {
        if (codeReader && videoInputDevices.length > 0) {
            const deviceId = videoInputDevices[currentCameraIndex].deviceId;
            
            codeReader.decodeFromVideoDevice(deviceId, videoEl.id, (result, err) => {
                if (result) {
                    scannerModal.hide();
                    if (navigator.vibrate) { navigator.vibrate(100); }
                    onScanSuccessCallback(result.text);
                }
                if (err && !(err instanceof ZXing.NotFoundException)) {
                    console.error(err);
                    if (onScanErrorCallback) onScanErrorCallback(err);
                }
            }).catch(err => {
                console.error("Erro ao decodificar:", err);
                if (onScanErrorCallback) onScanErrorCallback(err);
            });
        }
    }

    modalEl.addEventListener('shown.bs.modal', () => {
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
                switchBtnEl.disabled = videoInputDevices.length <= 1;
                
                startScanner();
            })
            .catch(err => {
                console.error("Erro grave ao listar câmeras:", err);
                if (onScanErrorCallback) onScanErrorCallback(err);
                scannerModal.hide();
            });
    });

    modalEl.addEventListener('hidden.bs.modal', () => {
        if (codeReader) {
            codeReader.reset();
        }
        videoInputDevices = [];
        currentCameraIndex = 0;
    });

    switchBtnEl.addEventListener('click', () => {
        if (codeReader && videoInputDevices.length > 1) {
            codeReader.reset();
            currentCameraIndex = (currentCameraIndex + 1) % videoInputDevices.length;
            startScanner();
        }
    });

    // Retorna a instância do modal para controle externo (se necessário)
    return scannerModal;
}
