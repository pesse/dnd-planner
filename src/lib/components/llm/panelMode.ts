export const LLM_MODES = ['chat', 'generate', 'agent', 'debug'] as const;
export type LlmMode = (typeof LLM_MODES)[number];
