/**
 * flows.js
 * Editor visual de flows com integração ao FlowsEngine/FlowSchema
 */

// Usar FlowSchema se disponível
const Schema = window.FlowSchema || {
  TriggerTypes: {},
  ActionTypes: {},
  createEmptyFlow: () => ({ id: Date.now().toString(), name: 'Novo Flow', triggers: [], steps: [] }),
};

class FlowsEditor {
  constructor() {
    this.flows = [];
    this.currentFlow = null;
    this.unsavedChanges = false;
    
    this.init();
  }
  
  async init() {
    await this.loadFlows();
    this.setupUI();
    this.setupEventListeners();
    this.renderFlowsList();
  }
  
  async loadFlows() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['quantum_flows'], (result) => {
        this.flows = result.quantum_flows || [];
        resolve();
      });
    });
  }
  
  async saveFlows() {
    return new Promise((resolve) => {
      chrome.storage.local.set({ quantum_flows: this.flows }, () => {
        // Notificar background para recarregar no runtime
        chrome.runtime.sendMessage({ type: 'SAVE_FLOWS', flows: this.flows }, () => {
          this.unsavedChanges = false;
          this.showNotification('Flows salvos com sucesso!', 'success');
          resolve();
        });
      });
    });
  }
  
  setupUI() {
    // Renderizar opções de triggers
    const triggerSelect = document.getElementById('trigger-type');
    if (triggerSelect) {
      triggerSelect.innerHTML = '<option value="">Selecione...</option>';
      Object.entries(Schema.TriggerTypes).forEach(([key, value]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = this.formatLabel(key);
        triggerSelect.appendChild(option);
      });
    }
    
    // Renderizar opções de ações
    const actionSelect = document.getElementById('action-type');
    if (actionSelect) {
      actionSelect.innerHTML = '<option value="">Selecione...</option>';
      Object.entries(Schema.ActionTypes).forEach(([key, value]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = this.formatLabel(key);
        actionSelect.appendChild(option);
      });
    }
  }
  
  setupEventListeners() {
    // Botão criar flow
    document.getElementById('btn-new-flow')?.addEventListener('click', () => {
      this.createNewFlow();
    });
    
    // Botão salvar
    document.getElementById('btn-save-flows')?.addEventListener('click', () => {
      this.saveFlows();
    });
    
    // Botão adicionar trigger
    document.getElementById('btn-add-trigger')?.addEventListener('click', () => {
      this.addTriggerToCurrentFlow();
    });
    
    // Botão adicionar ação
    document.getElementById('btn-add-action')?.addEventListener('click', () => {
      this.addStepToCurrentFlow();
    });
    
    // Toggle de flow ativo
    document.getElementById('flow-enabled')?.addEventListener('change', (e) => {
      if (this.currentFlow) {
        this.currentFlow.enabled = e.target.checked;
        this.unsavedChanges = true;
        this.renderFlowsList();
      }
    });
    
    // Nome do flow
    document.getElementById('flow-name')?.addEventListener('input', (e) => {
      if (this.currentFlow) {
        this.currentFlow.name = e.target.value;
        this.unsavedChanges = true;
        this.renderFlowsList();
      }
    });
    
    // Aviso de mudanças não salvas
    window.addEventListener('beforeunload', (e) => {
      if (this.unsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }
  
  createNewFlow() {
    const newFlow = Schema.createEmptyFlow ? Schema.createEmptyFlow() : {
      id: Date.now().toString(),
      name: 'Novo Flow',
      triggers: [],
      steps: [],
      enabled: false,
    };
    this.flows.push(newFlow);
    this.currentFlow = newFlow;
    this.unsavedChanges = true;
    this.renderFlowsList();
    this.renderFlowEditor();
  }
  
  selectFlow(flowId) {
    this.currentFlow = this.flows.find(f => f.id === flowId) || null;
    this.renderFlowEditor();
  }
  
  deleteFlow(flowId) {
    if (!confirm('Tem certeza que deseja excluir este flow?')) return;
    this.flows = this.flows.filter(f => f.id !== flowId);
    if (this.currentFlow?.id === flowId) {
      this.currentFlow = null;
    }
    this.unsavedChanges = true;
    this.renderFlowsList();
    this.renderFlowEditor();
  }
  
  duplicateFlow(flowId) {
    const original = this.flows.find(f => f.id === flowId);
    if (!original) return;
    const copy = JSON.parse(JSON.stringify(original));
    copy.id = Schema.generateId ? Schema.generateId() : Date.now().toString();
    copy.name = `${original.name} (cópia)`;
    copy.enabled = false;
    this.flows.push(copy);
    this.unsavedChanges = true;
    this.renderFlowsList();
  }
  
  addTriggerToCurrentFlow() {
    if (!this.currentFlow) return;
    
    const triggerType = document.getElementById('trigger-type')?.value;
    if (!triggerType) return;
    
    const trigger = Schema.createTrigger ? 
      Schema.createTrigger(triggerType, {}) :
      { id: Date.now().toString(), type: triggerType, enabled: true, config: {}, filters: [] };
    
    this.currentFlow.triggers = this.currentFlow.triggers || [];
    this.currentFlow.triggers.push(trigger);
    this.unsavedChanges = true;
    this.renderFlowEditor();
  }
  
  addStepToCurrentFlow() {
    if (!this.currentFlow) return;
    
    const actionType = document.getElementById('action-type')?.value;
    if (!actionType) return;
    
    const step = Schema.createStep ?
      Schema.createStep(actionType, {}) :
      { id: Date.now().toString(), actionType: actionType, config: {}, conditions: [] };
    
    this.currentFlow.steps = this.currentFlow.steps || [];
    this.currentFlow.steps.push(step);
    this.unsavedChanges = true;
    this.renderFlowEditor();
  }
  
  removeTrigger(triggerId) {
    if (!this.currentFlow) return;
    this.currentFlow.triggers = (this.currentFlow.triggers || []).filter(t => t.id !== triggerId);
    this.unsavedChanges = true;
    this.renderFlowEditor();
  }
  
  removeStep(stepId) {
    if (!this.currentFlow) return;
    this.currentFlow.steps = (this.currentFlow.steps || []).filter(s => s.id !== stepId);
    this.unsavedChanges = true;
    this.renderFlowEditor();
  }
  
  updateTriggerConfig(triggerId, key, value) {
    const trigger = this.currentFlow?.triggers?.find(t => t.id === triggerId);
    if (trigger) {
      trigger.config = trigger.config || {};
      trigger.config[key] = value;
      this.unsavedChanges = true;
    }
  }
  
  updateStepConfig(stepId, key, value) {
    const step = this.currentFlow?.steps?.find(s => s.id === stepId);
    if (step) {
      step.config = step.config || {};
      step.config[key] = value;
      this.unsavedChanges = true;
    }
  }
  
  renderFlowsList() {
    const container = document.getElementById('flows-list');
    if (!container) return;
    
    container.innerHTML = (this.flows || []).map(flow => `
      <div class="flow-item ${this.currentFlow?.id === flow.id ? 'active' : ''}" data-flow-id="${flow.id}">
        <div class="flow-item-header" onclick="flowsEditor.selectFlow('${flow.id}')">
          <span class="flow-status ${flow.enabled ? 'enabled' : 'disabled'}"></span>
          <span class="flow-name">${this.escapeHtml(flow.name)}</span>
          <span class="flow-stats">${(flow.triggers || []).length}T / ${(flow.steps || []).length}A</span>
        </div>
        <div class="flow-item-actions">
          <button onclick="flowsEditor.duplicateFlow('${flow.id}')" title="Duplicar">📋</button>
          <button onclick="flowsEditor.deleteFlow('${flow.id}')" title="Excluir">🗑️</button>
        </div>
      </div>
    `).join('') || '<div class="empty-state">Nenhum flow definido ainda.</div>';
  }
  
  renderFlowEditor() {
    const container = document.getElementById('flow-editor');
    if (!container) return;
    
    if (!this.currentFlow) {
      container.innerHTML = '<div class="empty-state">Selecione ou crie um flow</div>';
      document.getElementById('flow-name').value = '';
      document.getElementById('flow-enabled').checked = false;
      return;
    }
    
    document.getElementById('flow-name').value = this.currentFlow.name || '';
    document.getElementById('flow-enabled').checked = !!this.currentFlow.enabled;
    
    // Renderizar triggers
    const triggersContainer = document.getElementById('triggers-list');
    if (triggersContainer) {
      triggersContainer.innerHTML = (this.currentFlow.triggers || []).map(trigger => `
        <div class="trigger-item" data-trigger-id="${trigger.id}">
          <div class="trigger-header">
            <span class="trigger-type">${this.formatLabel(trigger.type)}</span>
            <button onclick="flowsEditor.removeTrigger('${trigger.id}')" class="btn-remove">×</button>
          </div>
          <div class="trigger-config">
            ${this.renderTriggerConfig(trigger)}
          </div>
        </div>
      `).join('') || '<div class="empty-state">Nenhum gatilho</div>';
    }
    
    // Renderizar steps
    const stepsContainer = document.getElementById('steps-list');
    if (stepsContainer) {
      stepsContainer.innerHTML = (this.currentFlow.steps || []).map((step, index) => `
        <div class="step-item" data-step-id="${step.id}" draggable="true">
          <div class="step-header">
            <span class="step-number">${index + 1}</span>
            <span class="step-type">${this.formatLabel(step.actionType)}</span>
            <button onclick="flowsEditor.removeStep('${step.id}')" class="btn-remove">×</button>
          </div>
          <div class="step-config">
            ${this.renderStepConfig(step)}
          </div>
        </div>
      `).join('') || '<div class="empty-state">Nenhuma ação</div>';
    }
  }
  
  renderTriggerConfig(trigger) {
    switch (trigger.type) {
      case 'keyword_match':
        return `
          <label>Palavras-chave (separadas por vírgula):</label>
          <input type="text" 
                 value="${(trigger.config?.keywords || []).join(', ')}"
                 onchange="flowsEditor.updateTriggerConfig('${trigger.id}', 'keywords', this.value.split(',').map(k => k.trim()))"
                 placeholder="oi, olá, bom dia">
          <label>
            <input type="checkbox" 
                   ${trigger.config?.caseSensitive ? 'checked' : ''}
                   onchange="flowsEditor.updateTriggerConfig('${trigger.id}', 'caseSensitive', this.checked)">
            Diferenciar maiúsculas/minúsculas
          </label>
        `;
      
      case 'silence_timeout':
        return `
          <label>Minutos de silêncio:</label>
          <input type="number" 
                 value="${trigger.config?.minutes || 5}"
                 onchange="flowsEditor.updateTriggerConfig('${trigger.id}', 'minutes', parseInt(this.value, 10))"
                 min="1" max="1440">
        `;
      
      case 'regex_match':
        return `
          <label>Expressão regular:</label>
          <input type="text" 
                 value="${trigger.config?.pattern || ''}"
                 onchange="flowsEditor.updateTriggerConfig('${trigger.id}', 'pattern', this.value)"
                 placeholder="^(oi|olá).*">
        `;
      
      default:
        return '<span class="hint">Sem configuração adicional</span>';
    }
  }
  
  renderStepConfig(step) {
    switch (step.actionType) {
      case 'send_message':
        return `
          <label>Mensagem:</label>
          <textarea 
            onchange="flowsEditor.updateStepConfig('${step.id}', 'message', this.value)"
            placeholder="Use {{contact.name}} para nome do contato">${step.config?.message || ''}</textarea>
          <div class="variables-hint">
            Variáveis: {{contact.name}}, {{contact.phone}}, {{message.body}}, {{system.time}}
          </div>
        `;
      
      case 'delay':
        return `
          <label>Tempo de espera (segundos):</label>
          <input type="number" 
                 value="${step.config?.seconds || 5}"
                 onchange="flowsEditor.updateStepConfig('${step.id}', 'seconds', parseInt(this.value, 10))"
                 min="1" max="3600">
        `;
      
      case 'set_stage':
        return `
          <label>Estágio:</label>
          <select onchange="flowsEditor.updateStepConfig('${step.id}', 'stage', this.value)">
            <option value="lead" ${step.config?.stage === 'lead' ? 'selected' : ''}>Lead</option>
            <option value="contact" ${step.config?.stage === 'contact' ? 'selected' : ''}>Contato</option>
            <option value="negotiation" ${step.config?.stage === 'negotiation' ? 'selected' : ''}>Negociação</option>
            <option value="customer" ${step.config?.stage === 'customer' ? 'selected' : ''}>Cliente</option>
          </select>
        `;
      
      case 'webhook_call':
        return `
          <label>URL:</label>
          <input type="url" 
                 value="${step.config?.url || ''}"
                 onchange="flowsEditor.updateStepConfig('${step.id}', 'url', this.value)"
                 placeholder="https://...">
          <label>Método:</label>
          <select onchange="flowsEditor.updateStepConfig('${step.id}', 'method', this.value)">
            <option value="POST" ${step.config?.method === 'POST' ? 'selected' : ''}>POST</option>
            <option value="GET" ${step.config?.method === 'GET' ? 'selected' : ''}>GET</option>
          </select>
        `;
      
      case 'ai_reply':
        return `
          <label>Prompt do sistema:</label>
          <textarea 
            onchange="flowsEditor.updateStepConfig('${step.id}', 'systemPrompt', this.value)"
            placeholder="Instruções para a IA...">${step.config?.systemPrompt || ''}</textarea>
        `;
      
      default:
        return '<span class="hint">Sem configuração adicional</span>';
    }
  }
  
  formatLabel(key) {
    return String(key || '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  }
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }
  
  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => notification.remove(), 3000);
  }
}

// Inicializar
let flowsEditor;
document.addEventListener('DOMContentLoaded', () => {
  flowsEditor = new FlowsEditor();
  window.flowsEditor = flowsEditor;
});
