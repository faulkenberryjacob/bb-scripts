export interface ArgDefinition {
  name: string;
  type: "string" | "number" | "boolean";
  required: boolean;
  description?: string;
}

export interface ParsedArgs {
  [key: string]: string | number | boolean | undefined;
}

export function defineArgs(...definitions: ArgDefinition[]): ArgDefinition[] {
  return definitions;
}

export function parseArgs(
  args: (string | number | boolean)[],
  definitions: ArgDefinition[]
): ParsedArgs {
  const result: ParsedArgs = {};
  const requiredArgs = definitions.filter(d => d.required);
  
  // Validate required arguments
  if (args.length < requiredArgs.length) {
    throw new Error(
      `Missing required arguments. Expected ${requiredArgs.length}, got ${args.length}`
    );
  }

  // Parse arguments
  definitions.forEach((def, index) => {
    if (index < args.length) {
      const value = args[index];
      
      // Type coercion
      if (def.type === "number") {
        result[def.name] = Number(value);
      } else if (def.type === "boolean") {
        result[def.name] = value === "true" || value === true || value === 1;
      } else {
        result[def.name] = String(value);
      }
    } else if (def.required) {
      throw new Error(`Required argument "${def.name}" not provided`);
    } else {
      result[def.name] = undefined;
    }
  });

  return result;
}

export function printArgUsage(definitions: ArgDefinition[]): string {
  const lines: string[] = ["Usage:"];
  definitions.forEach(def => {
    const required = def.required ? "[REQUIRED]" : "[optional]";
    const desc = def.description ? ` - ${def.description}` : "";
    lines.push(`  ${def.name} (${def.type}) ${required}${desc}`);
  });
  return lines.join("\n");
}

/* Example usage in a script:

import { defineArgs, parseArgs, printArgUsage } from "@/lib/args";

const argDefinitions = defineArgs(
  { name: "target", type: "string", required: true, description: "Target location for infiltration" },
  { name: "autoTrade", type: "boolean", required: false, description: "Auto-trade rewards" },
  { name: "maxAttempts", type: "number", required: false, description: "Max infiltration attempts" }
);

export  function main(ns: NS) {
  try {
    const parsedArgs = parseArgs(ns.args, argDefinitions);
    
    const target = parsedArgs.target as string;
    const autoTrade = parsedArgs.autoTrade as boolean;
    const maxAttempts = parsedArgs.maxAttempts as number;

    ns.tprint(`Target: ${target}`);
    ns.tprint(`Auto-trade: ${autoTrade ?? false}`);
    ns.tprint(`Max attempts: ${maxAttempts ?? 3}`);
    
  } catch (error) {
    ns.tprint(`Error: ${error}`);
    ns.tprint(printArgUsage(argDefinitions));
  }
}

*/