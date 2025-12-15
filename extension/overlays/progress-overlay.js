// overlays/progress-overlay.js
// Overlays de progresso para operações específicas

const ProgressOverlay = (function() {
    'use strict';

    // ============================================
    // ENVIO DE MÍDIA
    // ============================================

    function showMediaUpload(filename, size) {
        return OverlayManager.showProgress('media-upload', {
            icon: '📎',
            title: 'Enviando mídia...',
            subtitle: filename,
            progress: 0,
            current: 0,
            total: formatFileSize(size),
            showCancel: true,
            cancelText: 'Cancelar envio'
        });
    }

    function updateMediaUpload(loaded, total) {
        const progress = Math.round((loaded / total) * 100);
        OverlayManager.update('media-upload', {
            progress,
            current: formatFileSize(loaded),
            total: formatFileSize(total)
        });
    }

    function completeMediaUpload() {
        OverlayManager.completeProgress('media-upload', {
            title: 'Mídia enviada!',
            message: 'O arquivo foi enviado com sucesso'
        });
    }

    function failMediaUpload(error) {
        OverlayManager.failProgress('media-upload', {
            title: 'Falha no envio',
            message: error || 'Não foi possível enviar o arquivo'
        });
    }

    // ============================================
    // CAMPANHA DE MENSAGENS
    // ============================================

    let campaignStartTime = null;
    let campaignCancelled = false;

    function showCampaignProgress(campaignName, totalRecipients) {
        campaignStartTime = Date.now();
        campaignCancelled = false;

        const overlay = OverlayManager.showProgress('campaign', {
            icon: '📨',
            title: 'Enviando campanha...',
            subtitle: campaignName,
            progress: 0,
            current: 0,
            total: totalRecipients,
            showCancel: true,
            cancelText: 'Parar campanha'
        });

        // Bind cancel button
        const cancelBtn = overlay.querySelector('.btn-cancel');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                campaignCancelled = true;
                OverlayManager.update('campaign', {
                    subtitle: 'Cancelando...',
                    showCancel: false
                });
            });
        }

        return overlay;
    }

    function updateCampaignProgress(sent, total, lastRecipient) {
        const progress = Math.round((sent / total) * 100);
        const elapsed = Date.now() - campaignStartTime;
        const avgTime = sent > 0 ? elapsed / sent : 0;
        const remaining = avgTime > 0 ? (total - sent) * avgTime : 0;
        const eta = formatDuration(remaining);

        OverlayManager.update('campaign', {
            progress,
            current: sent,
            total,
            subtitle: lastRecipient ? `Enviando para: ${lastRecipient}` : '',
            eta
        });
    }

    function completeCampaignProgress(stats) {
        OverlayManager.completeProgress('campaign', {
            title: 'Campanha concluída!',
            message: `${stats.sent} mensagens enviadas`,
            details: [
                { label: 'Total enviado', value: stats.sent },
                { label: 'Falhas', value: stats.failed },
                { label: 'Tempo total', value: formatDuration(Date.now() - campaignStartTime) }
            ]
        });
    }

    function isCampaignCancelled() {
        return campaignCancelled;
    }

    // ============================================
    // EXTRAÇÃO DE DADOS
    // ============================================

    function showExtractionProgress(type = 'contacts') {
        const titles = {
            contacts: 'Extraindo contatos...',
            chats: 'Extraindo conversas...',
            groups: 'Extraindo grupos...',
            messages: 'Extraindo mensagens...',
            all: 'Extraindo todos os dados...'
        };

        const icons = {
            contacts: '👥',
            chats: '💬',
            groups: '👨‍👩‍👧‍👦',
            messages: '📝',
            all: '📊'
        };

        return OverlayManager.showProgress('extraction', {
            icon: icons[type] || '📥',
            title: titles[type] || 'Extraindo dados...',
            subtitle: 'Preparando...',
            progress: 0,
            current: 0,
            total: '?',
            showCancel: true
        });
    }

    function updateExtractionProgress(current, total, currentItem) {
        const progress = total > 0 ? Math.round((current / total) * 100) : 0;

        OverlayManager.update('extraction', {
            progress,
            current,
            total,
            subtitle: currentItem || `Processando item ${current}...`
        });
    }

    function completeExtraction(stats) {
        OverlayManager.completeProgress('extraction', {
            title: 'Extração concluída!',
            message: 'Os dados foram extraídos com sucesso',
            details: Object.entries(stats).map(([key, value]) => ({
                label: formatLabel(key),
                value: value.toLocaleString()
            }))
        });
    }

    // ============================================
    // CÓPIA DE LISTA
    // ============================================

    function showCopyProgress(itemCount) {
        return OverlayManager.showProgress('copy', {
            icon: '📋',
            title: 'Copiando lista...',
            subtitle: `${itemCount} itens`,
            progress: 0,
            current: 0,
            total: itemCount,
            showCancel: false
        });
    }

    function completeCopy(count) {
        OverlayManager.completeProgress('copy', {
            title: 'Lista copiada!',
            message: `${count} itens copiados para a área de transferência`,
            autoClose: true
        });

        // Também mostrar toast
        OverlayManager.showToast('Copiado!', `${count} itens na área de transferência`, 'success', 3000);
    }

    // ============================================
    // EXPORTAÇÃO
    // ============================================

    function showExportProgress(format, itemCount) {
        return OverlayManager.showProgress('export', {
            icon: '📥',
            title: `Exportando para ${format.toUpperCase()}...`,
            subtitle: `${itemCount} registros`,
            progress: 0,
            showCancel: true
        });
    }

    function completeExport(filename, format) {
        OverlayManager.completeProgress('export', {
            title: 'Exportação concluída!',
            message: `Arquivo ${filename} baixado`,
            details: [
                { label: 'Formato', value: format.toUpperCase() },
                { label: 'Arquivo', value: filename }
            ]
        });
    }

    // ============================================
    // SINCRONIZAÇÃO
    // ============================================

    function showSyncProgress() {
        return OverlayManager.showProgress('sync', {
            icon: '🔄',
            title: 'Sincronizando...',
            subtitle: 'Conectando ao WhatsApp',
            progress: 0,
            showCancel: false
        });
    }

    function updateSyncProgress(step, totalSteps, description) {
        const progress = Math.round((step / totalSteps) * 100);
        OverlayManager.update('sync', {
            progress,
            current: step,
            total: totalSteps,
            subtitle: description
        });
    }

    function completeSync() {
        OverlayManager.completeProgress('sync', {
            title: 'Sincronizado!',
            message: 'Todos os dados foram atualizados',
            autoClose: true
        });
    }

    // ============================================
    // HELPERS
    // ============================================

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function formatDuration(ms) {
        if (ms < 1000) return '< 1s';
        const seconds = Math.floor(ms / 1000);
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        return `${hours}h ${remainingMinutes}m`;
    }

    function formatLabel(key) {
        const labels = {
            contacts: 'Contatos',
            chats: 'Conversas',
            groups: 'Grupos',
            messages: 'Mensagens',
            labels: 'Rótulos',
            total: 'Total'
        };
        return labels[key] || key;
    }

    // ============================================
    // EXPORT
    // ============================================

    return {
        // Mídia
        showMediaUpload,
        updateMediaUpload,
        completeMediaUpload,
        failMediaUpload,

        // Campanha
        showCampaignProgress,
        updateCampaignProgress,
        completeCampaignProgress,
        isCampaignCancelled,

        // Extração
        showExtractionProgress,
        updateExtractionProgress,
        completeExtraction,

        // Cópia
        showCopyProgress,
        completeCopy,

        // Exportação
        showExportProgress,
        completeExport,

        // Sincronização
        showSyncProgress,
        updateSyncProgress,
        completeSync
    };
})();

// Export global
window.ProgressOverlay = ProgressOverlay;
