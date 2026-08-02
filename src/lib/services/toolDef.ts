/**
 * Die eine Tool-Deklaration und ihre zwei Provider-Formate.
 * Jedes `*Tools.ts` hält nur noch seine Liste und seinen Executor.
 */
import type Anthropic from '@anthropic-ai/sdk';

export interface ToolDef {
  name: string;
  description: string;
  params: Anthropic.Tool.InputSchema;
}

export function toolDefsToOpenAi(list: ToolDef[]) {
  return list.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.params },
  }));
}

export function toolDefsToAnthropic(list: ToolDef[]): Anthropic.Tool[] {
  return list.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.params,
  }));
}
