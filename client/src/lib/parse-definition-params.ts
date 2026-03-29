import type { ObjectParameter } from '@/types/schema';

export interface ParsedVariable {
  name: string;
  data_type: string;
  default_value: string | null;
}

/**
 * Parse parameters from the CREATE PROCEDURE/FUNCTION header.
 * Used as fallback when sys.parameters is unavailable or empty.
 */
export function parseParamsFromDefinition(definition: string | undefined): ObjectParameter[] {
  if (!definition) return [];

  // Extract the section between CREATE PROC/FUNC and AS\b
  const headerMatch = definition.match(
    /CREATE\s+(?:PROCEDURE|PROC|FUNCTION)\s+[\s\S]*?\bas\b/i
  );
  if (!headerMatch) return [];
  const header = headerMatch[0];

  const params: ObjectParameter[] = [];
  // Match: @name type[(size)] [= default] [OUTPUT|OUT]
  const paramRegex = /(@\w+)\s+([\w]+(?:\s*\([^)]*\))?)\s*(?:=\s*('(?:[^']|'')*'|-?\d+(?:\.\d+)?|NULL))?\s*(?:\b(OUT(?:PUT)?)\b)?/gi;
  let match;
  let ordinal = 0;

  while ((match = paramRegex.exec(header)) !== null) {
    ordinal++;
    const name = match[1];
    const rawType = match[2].trim();
    const defaultVal = match[3] ?? null;
    const isOutput = !!match[4];

    // Parse type and size
    const typeMatch = rawType.match(/^(\w+)(?:\s*\(([^)]*)\))?$/);
    const dataType = typeMatch ? typeMatch[1].toLowerCase() : rawType.toLowerCase();
    const sizeStr = typeMatch?.[2];

    let maxLength: number | null = null;
    let precision: number | null = null;
    let scale: number | null = null;

    if (sizeStr) {
      if (['varchar', 'nvarchar', 'char', 'nchar', 'varbinary'].includes(dataType)) {
        maxLength = sizeStr.toUpperCase() === 'MAX' ? -1 : parseInt(sizeStr, 10) || null;
      } else if (['decimal', 'numeric'].includes(dataType)) {
        const parts = sizeStr.split(',').map((s) => parseInt(s.trim(), 10));
        precision = parts[0] ?? null;
        scale = parts[1] ?? null;
      }
    }

    let cleanDefault: string | null = null;
    if (defaultVal !== null) {
      cleanDefault = defaultVal;
      if (cleanDefault.startsWith("'") && cleanDefault.endsWith("'")) {
        cleanDefault = cleanDefault.slice(1, -1).replace(/''/g, "'");
      }
    }

    params.push({
      name,
      data_type: dataType,
      max_length: maxLength,
      precision,
      scale,
      is_output: isOutput,
      has_default_value: defaultVal !== null,
      default_value: cleanDefault,
      ordinal_position: ordinal,
    });
  }

  return params;
}

/**
 * Parse DECLARE variables from the procedure/function body (after AS).
 */
export function parseVariablesFromDefinition(definition: string | undefined): ParsedVariable[] {
  if (!definition) return [];

  // Get the body after AS
  const bodyMatch = definition.match(/\bAS\b\s+([\s\S]*)/i);
  if (!bodyMatch) return [];
  const body = bodyMatch[1];

  const vars: ParsedVariable[] = [];
  // Match: DECLARE @name type [= value]
  const declareRegex = /\bDECLARE\s+(@\w+)\s+([\w]+(?:\s*\([^)]*\))?)\s*(?:=\s*('(?:[^']|'')*'|-?\d+(?:\.\d+)?|NULL))?/gi;
  let match;

  while ((match = declareRegex.exec(body)) !== null) {
    const name = match[1];
    const rawType = match[2].trim();
    const defaultVal = match[3] ?? null;

    const typeMatch = rawType.match(/^(\w+)(?:\s*\(([^)]*)\))?$/);
    const dataType = typeMatch ? typeMatch[1].toLowerCase() : rawType.toLowerCase();
    const sizeStr = typeMatch?.[2];
    let displayType = dataType;
    if (sizeStr) {
      displayType += `(${sizeStr})`;
    }

    let cleanDefault: string | null = null;
    if (defaultVal !== null) {
      cleanDefault = defaultVal;
      if (cleanDefault.startsWith("'") && cleanDefault.endsWith("'")) {
        cleanDefault = cleanDefault.slice(1, -1).replace(/''/g, "'");
      }
    }

    vars.push({ name, data_type: displayType, default_value: cleanDefault });
  }

  return vars;
}
