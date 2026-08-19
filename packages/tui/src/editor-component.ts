import type { Component } from "./component.ts";

/** A single autocomplete suggestion. */
export interface AutocompleteItem {
    /** Text inserted when the item is accepted. */
    value: string;
    /** Optional display label (defaults to value). */
    label?: string;
    description?: string;
}

/** Supplies autocomplete suggestions for the editor's current state. */
export interface AutocompleteProvider {
    /**
     * Return suggestions for the given text and cursor offset,
     * or an empty array when nothing applies.
     */
    getSuggestions(text: string, cursorOffset: number): AutocompleteItem[] | Promise<AutocompleteItem[]>;
}

/**
 * The text editor the user types into. Kept behind an interface so the TUI
 * and downstream apps don't depend on a concrete editor implementation.
 */
export interface EditorComponent extends Component {
    getText(): string;
    setText(text: string): void;
    handleInput(data: string): void;
    onSubmit?: (text: string) => void;
    onChange?: (text: string) => void;
    addToHistory?(text: string): void;
    insertTextAtCursor?(text: string): void;
    setAutocompleteProvider?(provider: AutocompleteProvider): void;
}
