export type KeybindingValidationIssue =
  | {
      kind: "unsupportedSequence";
      binding: string;
      command: string;
    }
  | {
      kind: "duplicate";
      binding: string;
      firstCommand: string;
      secondCommand: string;
    }
  | {
      kind: "prefixConflict";
      binding: string;
      firstCommand: string;
      secondCommand: string;
    };

export function keybindingEditorText(bindings: string[]): string {
  return bindings.join("\n");
}

export function parseKeybindingEditorText(value: string): string[] {
  const normalized = value
    .split(/\r?\n/)
    .map(normalizeBinding)
    .filter(Boolean);
  return [...new Set(normalized)];
}

export function validateKeybindingScopes(
  bindings: Record<string, string[]>,
  lockedBindings: Record<string, string[]>,
  scopes: readonly (readonly string[])[],
): KeybindingValidationIssue | null {
  const merged = { ...lockedBindings, ...bindings };
  for (const scope of scopes) {
    const issue = validateKeybindingScope(merged, new Set(scope));
    if (issue) return issue;
  }
  return null;
}

function validateKeybindingScope(
  bindings: Record<string, string[]>,
  commands: ReadonlySet<string>,
): KeybindingValidationIssue | null {
  const entries: { command: string; binding: string; tokens: string[] }[] = [];
  for (const [command, commandBindings] of Object.entries(bindings)) {
    if (!commands.has(command)) continue;
    for (const rawBinding of commandBindings) {
      const binding = normalizeBinding(rawBinding);
      if (!binding) continue;
      const tokens = binding.split(" ");
      if (tokens.length > 2) {
        return { kind: "unsupportedSequence", binding, command };
      }
      entries.push({ command, binding, tokens });
    }
  }

  const exact = new Map<string, string>();
  for (const entry of entries) {
    const firstCommand = exact.get(entry.binding);
    if (firstCommand && firstCommand !== entry.command) {
      return {
        kind: "duplicate",
        binding: entry.binding,
        firstCommand,
        secondCommand: entry.command,
      };
    }
    exact.set(entry.binding, entry.command);
  }

  const singleKeys = entries.filter((entry) => entry.tokens.length === 1);
  const sequences = entries.filter((entry) => entry.tokens.length === 2);
  for (const single of singleKeys) {
    const sequence = sequences.find((entry) => entry.tokens[0] === single.tokens[0]);
    if (sequence) {
      return {
        kind: "prefixConflict",
        binding: single.binding,
        firstCommand: single.command,
        secondCommand: sequence.command,
      };
    }
  }

  return null;
}

function normalizeBinding(binding: string): string {
  return binding.trim().toLowerCase().split(/\s+/).filter(Boolean).join(" ");
}
