/** camelCase from Tauri `get_ai_provider_settings` / `set_ai_provider_settings`. */
export type AiProviderSettings = {
  aiProvider: string;
  deepseekApiKey: string;
  ollamaEndpoint: string;
  ollamaModel: string;
};

export type AiExtractionConfigHint = {
  defaultProvider: string;
  deepseekConfigured: boolean;
  ollamaEndpointResolved: boolean;
};

export type AiDefaultProviderValue = 'mock' | 'deepseek' | 'local';
