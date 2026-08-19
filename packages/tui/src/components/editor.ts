import type { AutocompleteProvider, EditorComponent } from "../editor-component.ts";
import { defaultKeybindings, KeybindingsManager } from "../keybindings.ts";
import { CURSOR_MARKER, isPrintable } from "../keys.ts";

const WORD_CHARS = /[A-Za-z0-9_]/;

/**
 * Multi-line line editor: cursor movement, word operations, input history,
 * submit on enter and newline on shift+enter / ctrl+j.
 */
export class Editor implements EditorComponent {
    onSubmit?: (text: string) => void;
    onChange?: (text: string) => void;

    private lines: string[] = [""];
    private cursorLine = 0;
    private cursorCol = 0;
    private history: string[] = [];
    private historyIndex = -1;
    /** Text being edited before the user started browsing history. */
    private pendingText?: string;
    private autocompleteProvider?: AutocompleteProvider;
    private readonly keybindings: KeybindingsManager;

    constructor(keybindings: KeybindingsManager = defaultKeybindings) {
        this.keybindings = keybindings;
    }

    getText(): string {
        return this.lines.join("\n");
    }

    setText(text: string): void {
        this.lines = text.split("\n");
        this.cursorLine = this.lines.length - 1;
        this.cursorCol = this.lines[this.cursorLine].length;
        this.onChange?.(this.getText());
    }

    addToHistory(text: string): void {
        if (text.length === 0) return;
        if (this.history[this.history.length - 1] === text) return;
        this.history.push(text);
    }

    insertTextAtCursor(text: string): void {
        const inserted = text.split("\n");
        const line = this.lines[this.cursorLine];
        const before = line.slice(0, this.cursorCol);
        const after = line.slice(this.cursorCol);
        if (inserted.length === 1) {
            this.lines[this.cursorLine] = before + inserted[0] + after;
            this.cursorCol += inserted[0].length;
        } else {
            const tail = inserted[inserted.length - 1];
            this.lines.splice(
                this.cursorLine,
                1,
                before + inserted[0],
                ...inserted.slice(1, -1),
                tail + after,
            );
            this.cursorLine += inserted.length - 1;
            this.cursorCol = tail.length;
        }
        this.onChange?.(this.getText());
    }

    setAutocompleteProvider(provider: AutocompleteProvider): void {
        this.autocompleteProvider = provider;
    }

    handleInput(data: string): void {
        const kb = this.keybindings;

        if (kb.isAction(data, "tui.input.newLine")) {
            this.insertTextAtCursor("\n");
            return;
        }
        if (kb.isAction(data, "tui.input.submit")) {
            const text = this.getText();
            this.addToHistory(text);
            this.historyIndex = -1;
            this.pendingText = undefined;
            this.lines = [""];
            this.cursorLine = 0;
            this.cursorCol = 0;
            this.onChange?.(this.getText());
            this.onSubmit?.(text);
            return;
        }

        if (kb.isAction(data, "tui.editor.cursorUp")) {
            if (this.cursorLine > 0) {
                this.cursorLine--;
                this.cursorCol = Math.min(this.cursorCol, this.lines[this.cursorLine].length);
            } else {
                this.historyPrevious();
            }
            return;
        }
        if (kb.isAction(data, "tui.editor.cursorDown")) {
            if (this.cursorLine < this.lines.length - 1) {
                this.cursorLine++;
                this.cursorCol = Math.min(this.cursorCol, this.lines[this.cursorLine].length);
            } else {
                this.historyNext();
            }
            return;
        }
        if (kb.isAction(data, "tui.editor.cursorLeft")) {
            this.moveLeft();
            return;
        }
        if (kb.isAction(data, "tui.editor.cursorRight")) {
            this.moveRight();
            return;
        }
        if (kb.isAction(data, "tui.editor.cursorWordLeft")) {
            this.cursorCol = this.wordLeftBoundary();
            return;
        }
        if (kb.isAction(data, "tui.editor.cursorWordRight")) {
            this.cursorCol = this.wordRightBoundary();
            return;
        }
        if (kb.isAction(data, "tui.editor.cursorLineStart")) {
            this.cursorCol = 0;
            return;
        }
        if (kb.isAction(data, "tui.editor.cursorLineEnd")) {
            this.cursorCol = this.lines[this.cursorLine].length;
            return;
        }

        if (kb.isAction(data, "tui.editor.deleteCharBackward")) {
            this.deleteBackward();
            return;
        }
        if (kb.isAction(data, "tui.editor.deleteCharForward")) {
            this.deleteForward();
            return;
        }
        if (kb.isAction(data, "tui.editor.deleteWordBackward")) {
            const boundary = this.wordLeftBoundary();
            const line = this.lines[this.cursorLine];
            this.lines[this.cursorLine] = line.slice(0, boundary) + line.slice(this.cursorCol);
            this.cursorCol = boundary;
            this.onChange?.(this.getText());
            return;
        }
        if (kb.isAction(data, "tui.editor.deleteToLineEnd")) {
            this.lines[this.cursorLine] = this.lines[this.cursorLine].slice(0, this.cursorCol);
            this.onChange?.(this.getText());
            return;
        }

        if (isPrintable(data)) {
            this.insertTextAtCursor(data);
        }
    }

    render(width: number): string[] {
        // The editor is cursor-driven and cheap to render; no caching.
        const lines: string[] = [];
        for (let i = 0; i < this.lines.length; i++) {
            let line = this.lines[i];
            if (i === this.cursorLine) {
                line = line.slice(0, this.cursorCol) + CURSOR_MARKER + line.slice(this.cursorCol);
            }
            lines.push(line.length > width ? line.slice(0, width + CURSOR_MARKER.length) : line);
        }
        return lines;
    }

    invalidate(): void {
        // No cached render state.
    }

    private moveLeft(): void {
        if (this.cursorCol > 0) {
            this.cursorCol--;
        } else if (this.cursorLine > 0) {
            this.cursorLine--;
            this.cursorCol = this.lines[this.cursorLine].length;
        }
    }

    private moveRight(): void {
        if (this.cursorCol < this.lines[this.cursorLine].length) {
            this.cursorCol++;
        } else if (this.cursorLine < this.lines.length - 1) {
            this.cursorLine++;
            this.cursorCol = 0;
        }
    }

    private deleteBackward(): void {
        if (this.cursorCol > 0) {
            const line = this.lines[this.cursorLine];
            this.lines[this.cursorLine] = line.slice(0, this.cursorCol - 1) + line.slice(this.cursorCol);
            this.cursorCol--;
        } else if (this.cursorLine > 0) {
            const removed = this.lines.splice(this.cursorLine, 1)[0];
            this.cursorLine--;
            this.cursorCol = this.lines[this.cursorLine].length;
            this.lines[this.cursorLine] += removed;
        } else {
            return;
        }
        this.onChange?.(this.getText());
    }

    private deleteForward(): void {
        const line = this.lines[this.cursorLine];
        if (this.cursorCol < line.length) {
            this.lines[this.cursorLine] = line.slice(0, this.cursorCol) + line.slice(this.cursorCol + 1);
        } else if (this.cursorLine < this.lines.length - 1) {
            this.lines[this.cursorLine] += this.lines.splice(this.cursorLine + 1, 1)[0];
        } else {
            return;
        }
        this.onChange?.(this.getText());
    }

    private wordLeftBoundary(): number {
        const line = this.lines[this.cursorLine];
        let i = this.cursorCol;
        while (i > 0 && !WORD_CHARS.test(line[i - 1])) i--;
        while (i > 0 && WORD_CHARS.test(line[i - 1])) i--;
        return i;
    }

    private wordRightBoundary(): number {
        const line = this.lines[this.cursorLine];
        let i = this.cursorCol;
        while (i < line.length && !WORD_CHARS.test(line[i])) i++;
        while (i < line.length && WORD_CHARS.test(line[i])) i++;
        return i;
    }

    private historyPrevious(): void {
        if (this.history.length === 0) return;
        if (this.historyIndex === -1) {
            this.pendingText = this.getText();
            this.historyIndex = this.history.length - 1;
        } else if (this.historyIndex > 0) {
            this.historyIndex--;
        } else {
            return;
        }
        this.setText(this.history[this.historyIndex]);
    }

    private historyNext(): void {
        if (this.historyIndex === -1) return;
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.setText(this.history[this.historyIndex]);
        } else {
            this.historyIndex = -1;
            this.setText(this.pendingText ?? "");
            this.pendingText = undefined;
        }
    }
}
