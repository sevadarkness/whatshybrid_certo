// subscription/subscription-ui.js
// Componentes de UI para assinaturas e créditos

const SubscriptionUI = (function() {
    'use strict';

    // ============================================
    // COMPONENTE: BARRA DE CRÉDITOS NO HEADER
    // ============================================

    function renderCreditsWidget(containerId = 'credits-widget') {
        const container = document.getElementById(containerId);
        if (!container || !window.SubscriptionManager || !window.CreditsManager) return;

        const credits = CreditsManager.getCreditsStatus();
        const subscription = SubscriptionManager.getSubscription();
        const plan = SubscriptionManager.getPlan();

        container.innerHTML = `
            <div class="credits-widget ${credits.status}" onclick="SubscriptionUI.showCreditsDetails()">
                <div class="credits-widget-main">
                    <span class="credits-icon">🤖</span>
                    <span class="credits-value">${credits.remaining}</span>
                    <span class="credits-separator">/</span>
                    <span class="credits-total">${credits.total}</span>
                </div>
                <div class="credits-widget-bar">
                    <div class="credits-widget-fill" style="width: ${100 - credits.percentage}%; background: ${credits.color}"></div>
                </div>
                ${credits.status === 'warning' || credits.status === 'critical' ? 
                    '<span class="credits-warning-icon">⚠️</span>' : ''}
            </div>
            <div class="plan-badge plan-badge--${subscription.planId}">
                ${plan.name}
                ${subscription.status === 'trial' ? 
                    `<span class="trial-badge">${SubscriptionManager.getTrialDaysRemaining()}d trial</span>` : ''}
            </div>
        `;

        // Tooltip
        container.title = `${credits.statusText}\nClique para detalhes`;
    }

    // ============================================
    // MODAL: DETALHES DE CRÉDITOS
    // ============================================

    async function showCreditsDetails() {
        if (!window.CreditsManager || !window.SubscriptionManager) return;

        const credits = CreditsManager.getCreditsStatus();
        let projection = { daysRemaining: -1, avgDailyUsage: 0 };
        try {
            projection = await CreditsManager.getUsageProjection();
        } catch (e) {
            console.warn('[SubscriptionUI] Erro ao obter projeção de uso:', e);
        }

        const content = `
            <div class="credits-details">
                <div class="credits-overview">
                    <div class="credits-circle">
                        <svg viewBox="0 0 100 100">
                            <circle class="credits-circle-bg" cx="50" cy="50" r="45"></circle>
                            <circle class="credits-circle-fill" cx="50" cy="50" r="45" 
                                stroke="${credits.color}"
                                stroke-dasharray="${(100 - credits.percentage) * 2.83} 283"></circle>
                        </svg>
                        <div class="credits-circle-text">
                            <span class="value">${credits.remaining}</span>
                            <span class="label">restantes</span>
                        </div>
                    </div>
                    <div class="credits-info">
                        <h4>Créditos de IA</h4>
                        <p class="status" style="color: ${credits.color}">${credits.statusText}</p>
                        <p>${credits.used} usados de ${credits.total}</p>
                        ${projection.daysRemaining > 0 ? 
                            `<p class="projection">~${projection.daysRemaining} dias restantes</p>` : ''}
                    </div>
                </div>

                <div class="credits-usage-section">
                    <h4>Custo por Operação</h4>
                    <ul class="costs-list">
                        <li><span>Resposta Inteligente</span><span>${CreditsManager.CREDIT_COSTS.smart_reply} crédito</span></li>
                        <li><span>Sugestão do Copiloto</span><span>${CreditsManager.CREDIT_COSTS.copilot_suggestion} créditos</span></li>
                        <li><span>Mensagem Completa IA</span><span>${CreditsManager.CREDIT_COSTS.copilot_full_message} créditos</span></li>
                        <li><span>Análise de Sentimento</span><span>${CreditsManager.CREDIT_COSTS.sentiment_analysis} crédito</span></li>
                        <li><span>Resumir Conversa</span><span>${CreditsManager.CREDIT_COSTS.summarize_chat} créditos</span></li>
                    </ul>
                </div>

                <div class="credits-actions">
                    <button class="btn primary" onclick="SubscriptionUI.showBuyCreditsModal()">
                        Comprar Mais Créditos
                    </button>
                    <button class="btn secondary" onclick="window.open('${SubscriptionManager.getManageUrl()}', '_blank')">
                        Gerenciar Assinatura
                    </button>
                </div>
            </div>
        `;

        if (window.Workspace && typeof Workspace.openModal === 'function') {
            Workspace.openModal('Créditos de IA', content);
        } else {
            showStandaloneModal('Créditos de IA', content);
        }
    }

    // ============================================
    // MODAL: COMPRAR CRÉDITOS
    // ============================================

    function showBuyCreditsModal() {
        const content = `
            <div class="buy-credits-modal">
                <p class="buy-credits-intro">
                    Para <strong>adicionar créditos de IA</strong>, você pode resgatar um voucher (código) ou abrir seu checkout.
                </p>

                <div class="voucher-box">
                    <h4 style="margin:0 0 8px 0;">Resgatar Voucher</h4>
                    <div class="voucher-row">
                        <input id="topup-code-input" type="text" placeholder="Cole aqui seu código de créditos" style="flex:1; padding:10px; border-radius:8px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary);" />
                        <button class="btn primary" id="btn-redeem-topup" style="white-space:nowrap;">Resgatar</button>
                    </div>
                    <div id="topup-result" style="margin-top:8px; font-size:12px; color: var(--text-secondary);"></div>
                </div>

                <div style="height:12px;"></div>

                <details style="background:var(--bg-tertiary); padding:10px; border-radius:10px;">
                    <summary style="cursor:pointer; font-weight:600;">Não tenho voucher (abrir checkout)</summary>
                    <p style="margin:8px 0 0 0; font-size:12px; color: var(--text-secondary);">
                        Você pode integrar seu checkout (Stripe/PIX/etc.) e, após pagamento, gerar um voucher no backend (Admin) para o cliente resgatar aqui.
                    </p>
                    <div class="credits-packages" style="margin-top:10px;">
                        <div class="credits-package" data-credits="100" data-price="9.90">
                            <div class="package-credits">100</div>
                            <div class="package-label">créditos</div>
                            <div class="package-price">R$ 9,90</div>
                            <div class="package-unit">R$ 0,10/crédito</div>
                        </div>

                        <div class="credits-package popular" data-credits="500" data-price="39.90">
                            <span class="package-badge">Popular</span>
                            <div class="package-credits">500</div>
                            <div class="package-label">créditos</div>
                            <div class="package-price">R$ 39,90</div>
                            <div class="package-unit">R$ 0,08/crédito</div>
                        </div>

                        <div class="credits-package" data-credits="1000" data-price="69.90">
                            <div class="package-credits">1.000</div>
                            <div class="package-label">créditos</div>
                            <div class="package-price">R$ 69,90</div>
                            <div class="package-unit">R$ 0,07/crédito</div>
                        </div>

                        <div class="credits-package best-value" data-credits="2500" data-price="149.90">
                            <span class="package-badge">Melhor valor</span>
                            <div class="package-credits">2.500</div>
                            <div class="package-label">créditos</div>
                            <div class="package-price">R$ 149,90</div>
                            <div class="package-unit">R$ 0,06/crédito</div>
                        </div>
                    </div>
                    <div class="buy-credits-footer">
                        <p class="secure-badge">🔒 Checkout externo (configure a URL no seu produto)</p>
                        <button class="btn secondary" id="btn-buy-credits" disabled>Abrir checkout</button>
                    </div>
                </details>
            </div>
        `;

        if (window.Workspace && typeof Workspace.openModal === 'function') {
            Workspace.openModal('Créditos de IA', content, `
                <button class="btn primary" onclick="Workspace.closeModal()">Fechar</button>
            `);
        } else {
            showStandaloneModal('Créditos de IA', content);
        }

        setTimeout(() => {
            // Voucher
            const input = document.getElementById('topup-code-input');
            const btnRedeem = document.getElementById('btn-redeem-topup');
            const resultEl = document.getElementById('topup-result');
            if (btnRedeem) {
                btnRedeem.onclick = async () => {
                    const code = (input?.value || '').trim();
                    if (!code) {
                        if (resultEl) resultEl.textContent = 'Informe um código para resgatar.';
                        return;
                    }
                    btnRedeem.disabled = true;
                    if (resultEl) resultEl.textContent = 'Resgatando...';
                    const out = await redeemTopupCode(code);
                    if (out.ok) {
                        if (resultEl) resultEl.textContent = `✅ Créditos adicionados: +${out.creditsAdded}. Total: ${out.creditsTotal}.`;
                        // Atualizar widget no header
                        try { renderCreditsWidget(); } catch (_) {}
                    } else {
                        if (resultEl) resultEl.textContent = `❌ ${out.error || 'Falha ao resgatar.'}`;
                    }
                    btnRedeem.disabled = false;
                };
            }

            // Pacotes (checkout placeholder)
            document.querySelectorAll('.credits-package').forEach(pkg => {
                pkg.addEventListener('click', () => {
                    document.querySelectorAll('.credits-package').forEach(p => p.classList.remove('selected'));
                    pkg.classList.add('selected');

                    const btn = document.getElementById('btn-buy-credits');
                    if (btn) {
                        btn.disabled = false;
                        btn.textContent = `Abrir checkout (${pkg.dataset.credits} créditos - R$ ${parseFloat(pkg.dataset.price).toFixed(2).replace('.', ',')})`;
                        btn.onclick = () => purchaseCredits(pkg.dataset.credits, pkg.dataset.price);
                    }
                });
            });
        }, 100);
    }

    function purchaseCredits(credits, price) {
        // Placeholder: integre com seu checkout e, após pagamento, gere um voucher para resgate.
        const checkoutUrl = `https://seusite.com/checkout?product=credits&amount=${credits}&price=${price}`;
        window.open(checkoutUrl, '_blank');
    }

    async function redeemTopupCode(code) {
        try {
            if (!chrome?.storage?.sync) {
                return { ok: false, error: 'chrome.storage indisponível' };
            }

            const cfg = await chrome.storage.sync.get(['backendUrl', 'extensionKey', 'licenseKey']);
            const backendUrl = (cfg.backendUrl || '').toString().trim();
            const extensionKey = (cfg.extensionKey || '').toString().trim();
            const licenseKey = (cfg.licenseKey || '').toString().trim();

            if (!backendUrl || !extensionKey || !licenseKey) {
                return { ok: false, error: 'Backend/licença não configurados (Opções + Ativação)' };
            }

            const url = `${backendUrl.replace(/\/$/, '')}/billing/redeem`;
            const resp = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-extension-key': extensionKey,
                    'x-license-key': licenseKey
                },
                body: JSON.stringify({ code })
            });

            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                return { ok: false, error: data?.error || `HTTP ${resp.status}` };
            }

            // Compatibilidade: backend pode retornar `creditsTotal/creditsAdded` (novo)
            // ou `aiCredits/added` (legado).
            const rawTotal = (data && (data.creditsTotal ?? data.aiCredits));
            const rawAdded = (data && (data.creditsAdded ?? data.added));

            const creditsTotal = Number.isFinite(rawTotal) ? rawTotal : parseInt(rawTotal || '0', 10) || 0;
            const creditsAdded = Number.isFinite(rawAdded) ? rawAdded : parseInt(rawAdded || '0', 10) || 0;

            // Atualizar storage (fonte de verdade para o widget)
            await chrome.storage.sync.set({ licenseAiCredits: creditsTotal });
            if (window.CreditsManager?.setCredits) {
                try { await window.CreditsManager.setCredits(creditsTotal); } catch (_) {}
            }

            return { ok: true, creditsTotal, creditsAdded };
        } catch (e) {
            return { ok: false, error: e?.message || String(e) };
        }
    }

    // ============================================
    // MODAL: UPGRADE DE PLANO
    // ============================================

    function showUpgradeModal(reason = 'feature_locked', suggestedPlan = 'starter') {
        if (!window.SubscriptionManager) return;

        const plans = SubscriptionManager.PLANS;
        const currentPlan = SubscriptionManager.getPlanId();

        const reasonMessages = {
            feature_locked: 'Este recurso não está disponível no seu plano atual',
            plan_required: 'Você precisa de um plano superior para acessar este recurso',
            limit_reached: 'Você atingiu o limite do seu plano atual',
            subscription_inactive: 'Sua assinatura não está ativa',
            no_credits: 'Seus créditos de IA acabaram',
            trial: 'Seu período de testes está acabando'
        };

        const content = `
            <div class="upgrade-modal">
                <div class="upgrade-header">
                    <span class="upgrade-icon">⭐</span>
                    <h3>${reasonMessages[reason] || 'Faça upgrade do seu plano'}</h3>
                </div>

                <div class="plans-comparison">
                    ${Object.entries(plans).filter(([id]) => id !== 'free').map(([id, plan]) => `
                        <div class="plan-card ${id === suggestedPlan ? 'recommended' : ''} ${id === currentPlan ? 'current' : ''}">
                            ${id === suggestedPlan ? '<span class="plan-badge">Recomendado</span>' : ''}
                            ${id === currentPlan ? '<span class="plan-badge current">Atual</span>' : ''}

                            <h4>${plan.name}</h4>
                            <div class="plan-price">
                                <span class="currency">R$</span>
                                <span class="amount">${plan.price.toFixed(2).split('.')[0]}</span>
                                <span class="cents">,${plan.price.toFixed(2).split('.')[1]}</span>
                                <span class="period">/mês</span>
                            </div>

                            <ul class="plan-features">
                                <li>${plan.features.maxContacts === -1 ? 'Contatos ilimitados' : `${plan.features.maxContacts.toLocaleString()} contatos`}</li>
                                <li>${plan.features.maxCampaigns === -1 ? 'Campanhas ilimitadas' : `${plan.features.maxCampaigns} campanhas`}</li>
                                <li>${plan.features.maxFlows === -1 ? 'Automações ilimitadas' : `${plan.features.maxFlows} automações`}</li>
                                <li>${plan.features.aiCredits.toLocaleString()} créditos IA/mês</li>
                                ${plan.features.copilot ? '<li class="highlight">✓ Copiloto IA</li>' : '<li class="disabled">✗ Copiloto IA</li>'}
                                ${plan.features.smartReplies ? '<li class="highlight">✓ Respostas Inteligentes</li>' : ''}
                                ${plan.features.analytics ? `<li>Analytics ${plan.features.analytics}</li>` : ''}
                            </ul>

                            <button class="btn ${id === suggestedPlan ? 'primary' : 'secondary'}" 
                                    onclick="SubscriptionUI.selectPlan('${id}')"
                                    ${id === currentPlan ? 'disabled' : ''}>
                                ${id === currentPlan ? 'Plano Atual' : 'Escolher'}
                            </button>
                        </div>
                    `).join('')}
                </div>

                <div class="upgrade-footer">
                    <p>✓ Cancele a qualquer momento</p>
                    <p>✓ Garantia de 7 dias</p>
                    <p>✓ Suporte prioritário</p>
                </div>
            </div>
        `;

        if (window.Workspace && typeof Workspace.openModal === 'function') {
            Workspace.openModal('Escolha seu Plano', content);
        } else {
            showStandaloneModal('Escolha seu Plano', content);
        }
    }

    function selectPlan(planId) {
        if (!window.SubscriptionManager) return;
        window.open(SubscriptionManager.getUpgradeUrl(planId), '_blank');
    }

    // ============================================
    // AVISO DE CRÉDITOS BAIXOS
    // ============================================

    function showCreditsWarning(credits) {
        const warningEl = document.createElement('div');
        warningEl.className = 'credits-warning-banner';
        warningEl.innerHTML = `
            <div class="warning-content">
                <span class="warning-icon">⚠️</span>
                <span class="warning-text">
                    Créditos de IA baixos: <strong>${credits.remaining}</strong> restantes
                </span>
                <button class="btn-buy" onclick="SubscriptionUI.showBuyCreditsModal()">
                    Comprar mais
                </button>
                <button class="btn-dismiss" onclick="this.parentElement.parentElement.remove()">
                    ✕
                </button>
            </div>
        `;

        // Inserir no topo da página
        const existing = document.querySelector('.credits-warning-banner');
        if (existing) existing.remove();

        document.body.insertBefore(warningEl, document.body.firstChild);

        // Auto-remover após 10 segundos
        setTimeout(() => warningEl.remove(), 10000);
    }

    // ============================================
    // TRIAL BANNER
    // ============================================

    function renderTrialBanner(containerId = 'trial-banner') {
        if (!window.SubscriptionManager || !SubscriptionManager.isTrial()) return;

        const daysRemaining = SubscriptionManager.getTrialDaysRemaining();
        const container = document.getElementById(containerId) || document.body;

        const banner = document.createElement('div');
        banner.className = `trial-banner ${daysRemaining <= 2 ? 'urgent' : ''}`;
        banner.innerHTML = `
            <div class="trial-content">
                <span class="trial-icon">🎁</span>
                <span class="trial-text">
                    ${daysRemaining > 0 
                        ? `Seu trial termina em <strong>${daysRemaining} dia${daysRemaining > 1 ? 's' : ''}</strong>`
                        : 'Seu trial termina <strong>hoje</strong>!'
                    }
                </span>
                <button class="btn primary small" onclick="SubscriptionUI.showUpgradeModal('trial')">
                    Assinar Agora
                </button>
                <button class="btn-dismiss" onclick="this.parentElement.parentElement.remove()">✕</button>
            </div>
        `;

        if (containerId && document.getElementById(containerId)) {
            container.appendChild(banner);
        } else {
            document.body.insertBefore(banner, document.body.firstChild);
        }
    }

    // ============================================
    // BLOQUEIO DE FEATURE
    // ============================================

    function showFeatureLockedOverlay(element, featureKey) {
        if (!window.FeatureGate) return;
        const result = FeatureGate.check(featureKey);
        if (result.allowed) return;

        const overlay = document.createElement('div');
        overlay.className = 'feature-locked-overlay';
        overlay.innerHTML = `
            <div class="locked-content">
                <span class="locked-icon">🔒</span>
                <p>${result.message || ''}</p>
                <button class="btn primary small" onclick="SubscriptionUI.showUpgradeModal('${result.reason}', '${result.upgradeRequired || ''}')">
                    ${result.canBuyCredits ? 'Comprar Créditos' : 'Fazer Upgrade'}
                </button>
            </div>
        `;

        element.style.position = 'relative';
        element.appendChild(overlay);
    }

    // ============================================
    // MODAL STANDALONE (sem Workspace)
    // ============================================

    function showStandaloneModal(title, content) {
        const modal = document.createElement('div');
        modal.className = 'subscription-modal-overlay';
        modal.innerHTML = `
            <div class="subscription-modal">
                <div class="modal-header">
                    <h3>${title}</h3>
                    <button class="btn-close">✕</button>
                </div>
                <div class="modal-body">
                    ${content}
                </div>
            </div>
        `;

        // fechar ao clicar no X ou fora
        modal.querySelector('.btn-close').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        document.body.appendChild(modal);
    }

    // ============================================
    // INICIALIZAÇÃO
    // ============================================

    function init() {
        // Renderizar widgets se existirem containers
        renderCreditsWidget();
        renderTrialBanner();

        // Aplicar gates aos elementos marcados
        if (window.FeatureGate) {
            FeatureGate.applyToPage();
        }

        // Listeners para atualizações
        if (window.SubscriptionManager && typeof SubscriptionManager.on === 'function') {
            SubscriptionManager.on('subscription_updated', () => {
                renderCreditsWidget();
                if (window.FeatureGate) {
                    FeatureGate.applyToPage();
                }
            });

            SubscriptionManager.on('credits_low', showCreditsWarning);
        }
    }

    // ============================================
    // EXPORT
    // ============================================

    return {
        init,
        renderCreditsWidget,
        renderTrialBanner,
        showCreditsDetails,
        showBuyCreditsModal,
        showUpgradeModal,
        showCreditsWarning,
        showFeatureLockedOverlay,
        selectPlan
    };
})();

// Export global
window.SubscriptionUI = SubscriptionUI;
