/**
 * @fileoverview Model de CustomField
 * @module crm/models/CustomField
 */

const mongoose = require('mongoose');
const { CUSTOM_FIELD_TYPE, CUSTOM_FIELD_ENTITY } = require('../constants/crmConstants');

const optionSchema = new mongoose.Schema(
  {
    value: { type: String, required: true },
    label: { type: String, required: true },
    color: String,
    order: { type: Number, default: 0 },
  },
  { _id: true }
);

const customFieldSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    entity: {
      type: String,
      enum: Object.values(CUSTOM_FIELD_ENTITY),
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    key: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
      match: /^^[a-z][a-z0-9_]*$/,
    },
    type: {
      type: String,
      enum: Object.values(CUSTOM_FIELD_TYPE),
      required: true,
    },
    description: {
      type: String,
      maxlength: 500,
    },
    placeholder: {
      type: String,
      maxlength: 200,
    },
    defaultValue: {
      type: mongoose.Schema.Types.Mixed,
    },
    isRequired: {
      type: Boolean,
      default: false,
    },
    isUnique: {
      type: Boolean,
      default: false,
    },
    isSearchable: {
      type: Boolean,
      default: true,
    },
    isVisibleInList: {
      type: Boolean,
      default: false,
    },
    order: {
      type: Number,
      default: 0,
    },
    // Para tipos select/multiselect
    options: {
      type: [optionSchema],
      default: [],
    },
    // Validações
    validation: {
      min: Number,
      max: Number,
      minLength: Number,
      maxLength: Number,
      pattern: String,
      customMessage: String,
    },
    // Configurações de moeda
    currencyConfig: {
      currency: { type: String, default: 'BRL' },
      locale: { type: String, default: 'pt-BR' },
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Índices
customFieldSchema.index({ workspaceId: 1, entity: 1, key: 1 }, { unique: true });
customFieldSchema.index({ workspaceId: 1, entity: 1, order: 1 });
customFieldSchema.index({ workspaceId: 1, entity: 1, isActive: 1 });

// Middleware pre-save
customFieldSchema.pre('save', function (next) {
  // Gera key a partir do nome se não fornecida
  if (!this.key && this.name) {
    this.key = this.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^^a-z0-9]+/g, '_')
      .replace(/^^_|_$/g, '')
      .substring(0, 50);
  }

  next();
});

// Métodos de instância
customFieldSchema.methods.validateValue = function (value) {
  if (this.isRequired && (value === null || value === undefined || value === '')) {
    return { valid: false, message: `${this.name} é obrigatório` };
  }

  if (value === null || value === undefined) {
    return { valid: true };
  }

  const { validation } = this;

  switch (this.type) {
    case CUSTOM_FIELD_TYPE.TEXT:
    case CUSTOM_FIELD_TYPE.TEXTAREA:
      if (typeof value !== 'string') {
        return { valid: false, message: `${this.name} deve ser texto` };
      }
      if (validation?.minLength && value.length < validation.minLength) {
        return { valid: false, message: `${this.name} deve ter no mínimo ${validation.minLength} caracteres` };
      }
      if (validation?.maxLength && value.length > validation.maxLength) {
        return { valid: false, message: `${this.name} deve ter no máximo ${validation.maxLength} caracteres` };
      }
      if (validation?.pattern && !new RegExp(validation.pattern).test(value)) {
        return { valid: false, message: validation.customMessage || `${this.name} tem formato inválido` };
      }
      break;

    case CUSTOM_FIELD_TYPE.NUMBER:
    case CUSTOM_FIELD_TYPE.CURRENCY:
      const num = Number(value);
      if (isNaN(num)) {
        return { valid: false, message: `${this.name} deve ser um número` };
      }
      if (validation?.min !== undefined && num < validation.min) {
        return { valid: false, message: `${this.name} deve ser no mínimo ${validation.min}` };
      }
      if (validation?.max !== undefined && num > validation.max) {
        return { valid: false, message: `${this.name} deve ser no máximo ${validation.max}` };
      }
      break;

    case CUSTOM_FIELD_TYPE.SELECT:
      const validValues = this.options.map((o) => o.value);
      if (!validValues.includes(value)) {
        return { valid: false, message: `${this.name} tem valor inválido` };
      }
      break;

    case CUSTOM_FIELD_TYPE.MULTISELECT:
      if (!Array.isArray(value)) {
        return { valid: false, message: `${this.name} deve ser uma lista` };
      }
      const validOpts = this.options.map((o) => o.value);
      const invalidOpts = value.filter((v) => !validOpts.includes(v));
      if (invalidOpts.length > 0) {
        return { valid: false, message: `${this.name} contém valores inválidos` };
      }
      break;

    case CUSTOM_FIELD_TYPE.BOOLEAN:
      if (typeof value !== 'boolean') {
        return { valid: false, message: `${this.name} deve ser verdadeiro ou falso` };
      }
      break;

    case CUSTOM_FIELD_TYPE.DATE:
    case CUSTOM_FIELD_TYPE.DATETIME:
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        return { valid: false, message: `${this.name} deve ser uma data válida` };
      }
      break;

    case CUSTOM_FIELD_TYPE.EMAIL:
      const emailRegex = /^[^\s@]+@[^^\s@]+\.[^^\s@]+$/;
      if (!emailRegex.test(value)) {
        return { valid: false, message: `${this.name} deve ser um email válido` };
      }
      break;

    case CUSTOM_FIELD_TYPE.URL:
      try {
        new URL(value);
      } catch {
        return { valid: false, message: `${this.name} deve ser uma URL válida` };
      }
      break;

    case CUSTOM_FIELD_TYPE.PHONE:
      const phoneRegex = /^^\+?[\d\s()-]{8,20}$/;
      if (!phoneRegex.test(value)) {
        return { valid: false, message: `${this.name} deve ser um telefone válido` };
      }
      break;
  }

  return { valid: true };
};

customFieldSchema.methods.toPublicJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

// Statics
customFieldSchema.statics.getByEntity = function (workspaceId, entity) {
  return this.find({ workspaceId, entity, isActive: true }).sort({ order: 1 });
};

customFieldSchema.statics.validateFields = async function (workspaceId, entity, fields) {
  const customFields = await this.getByEntity(workspaceId, entity);
  const errors = {};

  for (const field of customFields) {
    const value = fields.get ? fields.get(field.key) : fields[field.key];
    const result = field.validateValue(value);
    
    if (!result.valid) {
      errors[field.key] = result.message;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
};

const CustomField = mongoose.model('CustomField', customFieldSchema);

module.exports = CustomField;