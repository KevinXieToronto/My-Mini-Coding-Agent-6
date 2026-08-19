import { parseKey } from "./keys.ts";

/**
 * Global keybinding registry.
 * Downstream packages can add keybindings via declaration merging.
 */
export interface Keybindings {
	"tui.editor.cursorUp": true;
	"tui.editor.cursorDown": true;
	"tui.editor.cursorLeft": true;
	"tui.editor.cursorRight": true;
	"tui.editor.cursorWordLeft": true;
	"tui.editor.cursorWordRight": true;
	"tui.editor.cursorLineStart": true;
	"tui.editor.cursorLineEnd": true;
	"tui.editor.deleteCharBackward": true;
	"tui.editor.deleteCharForward": true;
	"tui.editor.deleteWordBackward": true;
	"tui.editor.deleteToLineEnd": true;
	"tui.input.submit": true;
	"tui.input.newLine": true;
	"tui.select.up": true;
	"tui.select.down": true;
	"tui.select.confirm": true;
	"tui.select.cancel": true;
}

export type KeybindingAction = keyof Keybindings;

export interface KeybindingDefinition {
	/** Normalized key id(s) as produced by `parseKey`, e.g. "ctrl+a". */
	defaultKeys: string | string[];
	description: string;
}

export type KeybindingDefinitions = Record<string, KeybindingDefinition>;

export const TUI_KEYBINDINGS = {
	"tui.editor.cursorUp": { defaultKeys: "up", description: "Move cursor up" },
	"tui.editor.cursorDown": { defaultKeys: "down", description: "Move cursor down" },
	"tui.editor.cursorLeft": { defaultKeys: "left", description: "Move cursor left" },
	"tui.editor.cursorRight": { defaultKeys: "right", description: "Move cursor right" },
	"tui.editor.cursorWordLeft": {
		defaultKeys: ["ctrl+left", "alt+b"],
		description: "Move to previous word",
	},
	"tui.editor.cursorWordRight": {
		defaultKeys: ["ctrl+right", "alt+f"],
		description: "Move to next word",
	},
	"tui.editor.cursorLineStart": {
		defaultKeys: ["home", "ctrl+a"],
		description: "Move to line start",
	},
	"tui.editor.cursorLineEnd": {
		defaultKeys: ["end", "ctrl+e"],
		description: "Move to line end",
	},
	"tui.editor.deleteCharBackward": { defaultKeys: "backspace", description: "Delete character before cursor" },
	"tui.editor.deleteCharForward": { defaultKeys: "delete", description: "Delete character after cursor" },
	"tui.editor.deleteWordBackward": {
		defaultKeys: ["ctrl+w", "alt+backspace"],
		description: "Delete word before cursor",
	},
	"tui.editor.deleteToLineEnd": { defaultKeys: "ctrl+k", description: "Delete to end of line" },
	"tui.input.newLine": { defaultKeys: ["shift+enter", "ctrl+j"], description: "Insert newline" },
	"tui.input.submit": { defaultKeys: "enter", description: "Submit input" },
	"tui.select.up": { defaultKeys: "up", description: "Previous option" },
	"tui.select.down": { defaultKeys: "down", description: "Next option" },
	"tui.select.confirm": { defaultKeys: "enter", description: "Confirm selection" },
	"tui.select.cancel": { defaultKeys: ["escape", "ctrl+c"], description: "Cancel selection" },
} as const satisfies KeybindingDefinitions;

/**
 * Resolves actions to key ids. Definitions from any package are registered
 * here; user overrides replace the default keys for an action.
 */
export class KeybindingsManager {
	private definitions = new Map<string, KeybindingDefinition>();
	private overrides = new Map<string, string[]>();
	/** Reverse index: key id -> actions bound to it. */
	private byKey = new Map<string, Set<string>>();

	constructor(definitions: KeybindingDefinitions = TUI_KEYBINDINGS) {
		this.register(definitions);
	}

	register(definitions: KeybindingDefinitions): void {
		for (const [action, definition] of Object.entries(definitions)) {
			this.definitions.set(action, definition);
		}
		this.rebuildIndex();
	}

	/** Replace the keys for an action (pass undefined to restore defaults). */
	setKeys(action: KeybindingAction, keys?: string | string[]): void {
		if (keys === undefined) {
			this.overrides.delete(action);
		} else {
			this.overrides.set(action, Array.isArray(keys) ? keys : [keys]);
		}
		this.rebuildIndex();
	}

	getKeys(action: KeybindingAction): string[] {
		const override = this.overrides.get(action);
		if (override) return override;
		const definition = this.definitions.get(action);
		if (!definition) return [];
		return Array.isArray(definition.defaultKeys) ? [...definition.defaultKeys] : [definition.defaultKeys];
	}

	/** True if the input sequence triggers the given action. */
	isAction(data: string, action: KeybindingAction): boolean {
		const key = parseKey(data);
		if (key === undefined) return false;
		return this.byKey.get(key)?.has(action) ?? false;
	}

	/** All actions triggered by the input sequence. */
	actionsFor(data: string): KeybindingAction[] {
		const key = parseKey(data);
		if (key === undefined) return [];
		return [...(this.byKey.get(key) ?? [])] as KeybindingAction[];
	}

	private rebuildIndex(): void {
		this.byKey.clear();
		for (const action of this.definitions.keys()) {
			for (const key of this.getKeys(action as KeybindingAction)) {
				let actions = this.byKey.get(key);
				if (!actions) {
					actions = new Set();
					this.byKey.set(key, actions);
				}
				actions.add(action);
			}
		}
	}
}

/** Shared default manager used by built-in components. */
export const defaultKeybindings = new KeybindingsManager();
