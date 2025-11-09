function mostrarMensagem(mensagem, tipo = 'sucesso') {
    const toastContainer = document.getElementById('toast-container');
    const toastId = 'toast-' + Date.now();
    const corBg = (tipo === 'sucesso') ? 'bg-success' : 'bg-danger';

    const toastHTML = `
        <div id="${toastId}" class="toast align-items-center text-white ${corBg} border-0" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="d-flex">
                <div class="toast-body">
                    ${mensagem}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        </div>
    `;
    
    toastContainer.insertAdjacentHTML('beforeend', toastHTML);
    const toastElement = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastElement, { delay: 5000 });
    toast.show();
    toastElement.addEventListener('hidden.bs.toast', () => toastElement.remove());
}
