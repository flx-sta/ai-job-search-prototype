/**
 * Model configuration state + default values
 */
const modelConfig = {
  intentModel: 'gpt-4o-mini'
};

/**
 * Set model configuration
 * @param {object} next 
 */
export function setModelConfig(next) {
  Object.assign(modelConfig, next);
}

/**
 * Get model configuration
 * @returns {object}
 */
export function getModelConfig() {
  return { ...modelConfig };
}
