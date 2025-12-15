// extractor/export_utils.js
// Utilitários para exportação em diferentes formatos

const ExportUtils = {
    
    // ============================================
    // EXPORTAR PARA JSON
    // ============================================
    
    toJSON(data, pretty = true) {
        return pretty 
            ? JSON.stringify(data, null, 2) 
            : JSON.stringify(data);
    },
    
    downloadJSON(data, filename = 'whatsapp_export') {
        const json = this.toJSON(data);
        const blob = new Blob([json], { type: 'application/json' });
        this._downloadBlob(blob, `${filename}_${this._getTimestamp()}.json`);
    },
    
    // ============================================
    // EXPORTAR PARA CSV
    // ============================================
    
    toCSV(data, options = {}) {
        const {
            delimiter = ',',
            includeHeaders = true,
            flattenObjects = true
        } = options;
        
        if (!Array.isArray(data) || data.length === 0) {
            return '';
        }
        
        // Flatten objects if needed
        const flatData = flattenObjects 
            ? data.map(item => this._flattenObject(item))
            : data;
        
        // Get all unique headers
        const headers = [...new Set(flatData.flatMap(obj => Object.keys(obj)))];
        
        const rows = [];
        
        if (includeHeaders) {
            rows.push(headers.map(h => this._escapeCSV(h, delimiter)).join(delimiter));
        }
        
        for (const item of flatData) {
            const row = headers.map(header => {
                const value = item[header];
                return this._escapeCSV(this._formatValue(value), delimiter);
            });
            rows.push(row.join(delimiter));
        }
        
        return rows.join('\n');
    },
    
    downloadCSV(data, filename = 'whatsapp_export', options = {}) {
        const csv = this.toCSV(data, options);
        const BOM = '\uFEFF'; // UTF-8 BOM for Excel compatibility
        const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' });
        this._downloadBlob(blob, `${filename}_${this._getTimestamp()}.csv`);
    },
    
    // ============================================
    // EXPORTAR PARA XLSX (Excel)
    // ============================================
    
    async toXLSX(data, sheetName = 'Data') {
        // Verificar se SheetJS está disponível
        if (typeof XLSX === 'undefined') {
            await this._loadSheetJS();
        }
        
        const flatData = Array.isArray(data) 
            ? data.map(item => this._flattenObject(item))
            : [this._flattenObject(data)];
        
        const worksheet = XLSX.utils.json_to_sheet(flatData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        
        return workbook;
    },
    
    async downloadXLSX(data, filename = 'whatsapp_export', options = {}) {
        const {
            sheetName = 'Dados',
            multiSheet = false,
            sheets = null
        } = options;
        
        if (typeof XLSX === 'undefined') {
            await this._loadSheetJS();
        }
        
        const workbook = XLSX.utils.book_new();
        
        if (multiSheet && sheets) {
            // Múltiplas abas
            for (const [name, sheetData] of Object.entries(sheets)) {
                const flatData = Array.isArray(sheetData) 
                    ? sheetData.map(item => this._flattenObject(item))
                    : [this._flattenObject(sheetData)];
                const worksheet = XLSX.utils.json_to_sheet(flatData);
                XLSX.utils.book_append_sheet(workbook, worksheet, name.substring(0, 31)); // Max 31 chars
            }
        } else {
            // Aba única
            const flatData = Array.isArray(data) 
                ? data.map(item => this._flattenObject(item))
                : [this._flattenObject(data)];
            const worksheet = XLSX.utils.json_to_sheet(flatData);
            XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        }
        
        const xlsxData = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([xlsxData], { 
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
        });
        this._downloadBlob(blob, `${filename}_${this._getTimestamp()}.xlsx`);
    },
    
    // ============================================
    // EXPORTAÇÃO COMPLETA (TUDO EM UM)
    // ============================================
    
    async downloadComplete(extractedData, format = 'xlsx', filename = 'whatsapp_backup') {
        switch (format.toLowerCase()) {
            case 'json':
                this.downloadJSON(extractedData, filename);
                break;
                
            case 'csv':
                // Para CSV, exportar cada tipo separadamente
                if (extractedData.contacts?.length > 0) {
                    this.downloadCSV(extractedData.contacts, `${filename}_contatos`);
                }
                if (extractedData.chats?.length > 0) {
                    this.downloadCSV(extractedData.chats, `${filename}_chats`);
                }
                if (extractedData.groups?.length > 0) {
                    this.downloadCSV(extractedData.groups, `${filename}_grupos`);
                }
                if (extractedData.labels?.length > 0) {
                    this.downloadCSV(extractedData.labels, `${filename}_rotulos`);
                }
                if (extractedData.deletedMessages?.length > 0) {
                    this.downloadCSV(extractedData.deletedMessages, `${filename}_msgs_apagadas`);
                }
                if (extractedData.editedMessages?.length > 0) {
                    this.downloadCSV(extractedData.editedMessages, `${filename}_msgs_editadas`);
                }
                break;
                
            case 'xlsx':
            default:
                await this.downloadXLSX(null, filename, {
                    multiSheet: true,
                    sheets: {
                        'Contatos': extractedData.contacts || [],
                        'Chats': extractedData.chats || [],
                        'Grupos': extractedData.groups || [],
                        'Rótulos': extractedData.labels || [],
                        'Msgs Apagadas': extractedData.deletedMessages || [],
                        'Msgs Editadas': extractedData.editedMessages || [],
                        'Resumo': [{
                            'Data da Extração': extractedData.extractedAt,
                            'Total Contatos': extractedData.summary?.totalContacts || 0,
                            'Total Chats': extractedData.summary?.totalChats || 0,
                            'Total Grupos': extractedData.summary?.totalGroups || 0,
                            'Total Rótulos': extractedData.summary?.totalLabels || 0,
                            'Msgs Apagadas': extractedData.summary?.deletedMessages || 0,
                            'Msgs Editadas': extractedData.summary?.editedMessages || 0
                        }]
                    }
                });
                break;
        }
    },
    
    // ============================================
    // HELPERS PRIVADOS
    // ============================================
    
    _flattenObject(obj, prefix = '', result = {}) {
        if (obj === null || obj === undefined) {
            return result;
        }
        
        for (const [key, value] of Object.entries(obj)) {
            const newKey = prefix ? `${prefix}_${key}` : key;
            
            if (value === null || value === undefined) {
                result[newKey] = '';
            } else if (Array.isArray(value)) {
                // Converter arrays para string
                result[newKey] = value.map(v => 
                    typeof v === 'object' ? JSON.stringify(v) : String(v)
                ).join('; ');
            } else if (typeof value === 'object' && !(value instanceof Date)) {
                // Recursivamente flatten objetos (máximo 2 níveis)
                if (!prefix) {
                    this._flattenObject(value, newKey, result);
                } else {
                    result[newKey] = JSON.stringify(value);
                }
            } else {
                result[newKey] = value;
            }
        }
        
        return result;
    },
    
    _escapeCSV(value, delimiter = ',') {
        if (value === null || value === undefined) {
            return '';
        }
        
        const str = String(value);
        
        // Escapar se contiver delimiter, aspas ou quebra de linha
        if (str.includes(delimiter) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        
        return str;
    },
    
    _formatValue(value) {
        if (value === null || value === undefined) {
            return '';
        }
        
        if (typeof value === 'boolean') {
            return value ? 'Sim' : 'Não';
        }
        
        if (value instanceof Date) {
            return value.toISOString();
        }
        
        if (typeof value === 'object') {
            return JSON.stringify(value);
        }
        
        return String(value);
    },
    
    _getTimestamp() {
        const now = new Date();
        return now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    },
    
    _downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },
    
    async _loadSheetJS() {
        return new Promise((resolve, reject) => {
            if (typeof XLSX !== 'undefined') {
                resolve();
                return;
            }
            
            const script = document.createElement('script');
            script.src = 'https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js';
            script.onload = resolve;
            script.onerror = () => reject(new Error('Falha ao carregar SheetJS'));
            document.head.appendChild(script);
        });
    }
};

// Exportar para uso em módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ExportUtils;
}