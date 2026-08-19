import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
    CURSOR_MARKER,
    Editor,
    KeybindingsManager,
    parseKey,
    StdinBuffer,
    Text,
    TUI,
    wrapText,
    type Terminal,
} from "../src/index.ts";

function tick(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

class FakeTerminal implements Terminal {
    columns = 40;
    rows = 10;
    writes: string[] = [];
    onInput?: (data: string) => void;
    onResize?: () => void;

    start(onInput: (data: string) => void, onResize: () => void): void {
        this.onInput = onInput;
        this.onResize = onResize;
    }
    stop(): void {}
    write(data: string): void {
        this.writes.push(data);
    }
}

describe("wrapText", () => {
    test("wraps at word boundaries and preserves newlines", () => {
        assert.deepEqual(wrapText("hello brave new world", 11), ["hello brave", "new world"]);
        assert.deepEqual(wrapText("a\n\nb", 10), ["a", "", "b"]);
    });

    test("hard-breaks words longer than the width", () => {
        assert.deepEqual(wrapText("abcdefgh", 3), ["abc", "def", "gh"]);
    });
});

describe("Text", () => {
    test("caches rendered lines until text or width changes", () => {
        const text = new Text("hello world");
        const first = text.render(20);
        assert.equal(text.render(20), first); // same array instance = cache hit
        assert.notEqual(text.render(5), first);
        text.setText("changed");
        assert.deepEqual(text.render(20), ["changed"]);
    });

    test("invalidate clears the cache", () => {
        const text = new Text("hi");
        const first = text.render(20);
        text.invalidate();
        assert.notEqual(text.render(20), first);
        assert.deepEqual(text.render(20), first);
    });
});

describe("parseKey", () => {
    test("parses control characters and named keys", () => {
        assert.equal(parseKey("\r"), "enter");
        assert.equal(parseKey("\n"), "ctrl+j");
        assert.equal(parseKey("\x01"), "ctrl+a");
        assert.equal(parseKey("\x7f"), "backspace");
        assert.equal(parseKey("\x1b[A"), "up");
        assert.equal(parseKey("\x1b[1~"), "home");
        assert.equal(parseKey("\x1b[3~"), "delete");
        assert.equal(parseKey("\x1b[1;5D"), "ctrl+left");
        assert.equal(parseKey("\x1b[13;2u"), "shift+enter");
        assert.equal(parseKey("\x1bb"), "alt+b");
        assert.equal(parseKey("a"), undefined);
        assert.equal(parseKey("pasted text"), undefined);
    });
});

describe("StdinBuffer", () => {
    test("reassembles escape sequences split across chunks", async () => {
        const sequences: string[] = [];
        const buffer = new StdinBuffer((data) => sequences.push(data), 5);
        buffer.feed("\x1b[");
        buffer.feed("A");
        assert.deepEqual(sequences, ["\x1b[A"]);
        buffer.dispose();
    });

    test("splits pasted text from key presses", () => {
        const sequences: string[] = [];
        const buffer = new StdinBuffer((data) => sequences.push(data), 5);
        buffer.feed("hello\rworld\x1b[B");
        assert.deepEqual(sequences, ["hello", "\r", "world", "\x1b[B"]);
        buffer.dispose();
    });

    test("flushes a bare escape after the timeout", async () => {
        const sequences: string[] = [];
        const buffer = new StdinBuffer((data) => sequences.push(data), 5);
        buffer.feed("\x1b");
        assert.deepEqual(sequences, []);
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.deepEqual(sequences, ["\x1b"]);
        buffer.dispose();
    });
});

describe("KeybindingsManager", () => {
    test("matches default keys and honors overrides", () => {
        const kb = new KeybindingsManager();
        assert.ok(kb.isAction("\r", "tui.input.submit"));
        assert.ok(kb.isAction("\x1b[13;2u", "tui.input.newLine"));
        assert.ok(kb.isAction("\x01", "tui.editor.cursorLineStart"));
        kb.setKeys("tui.input.submit", "ctrl+s");
        assert.ok(!kb.isAction("\r", "tui.input.submit"));
        assert.ok(kb.isAction("\x13", "tui.input.submit"));
    });
});

describe("Editor", () => {
    test("inserts text and submits on enter", () => {
        const editor = new Editor();
        let submitted = "";
        editor.onSubmit = (text) => (submitted = text);
        editor.handleInput("hello");
        editor.handleInput("\r");
        assert.equal(submitted, "hello");
        assert.equal(editor.getText(), "");
    });

    test("shift+enter inserts a newline", () => {
        const editor = new Editor();
        editor.handleInput("a");
        editor.handleInput("\x1b[13;2u");
        editor.handleInput("b");
        assert.equal(editor.getText(), "a\nb");
    });

    test("backspace, word delete, and cursor movement", () => {
        const editor = new Editor();
        editor.handleInput("foo bar");
        editor.handleInput("\x7f");
        assert.equal(editor.getText(), "foo ba");
        editor.handleInput("\x17"); // ctrl+w
        assert.equal(editor.getText(), "foo ");
        editor.handleInput("\x01"); // ctrl+a -> line start
        editor.handleInput("x");
        assert.equal(editor.getText(), "xfoo ");
    });

    test("up/down at the edges browse history", () => {
        const editor = new Editor();
        editor.handleInput("first");
        editor.handleInput("\r");
        editor.handleInput("second");
        editor.handleInput("\r");
        editor.handleInput("\x1b[A");
        assert.equal(editor.getText(), "second");
        editor.handleInput("\x1b[A");
        assert.equal(editor.getText(), "first");
        editor.handleInput("\x1b[B");
        assert.equal(editor.getText(), "second");
        editor.handleInput("\x1b[B");
        assert.equal(editor.getText(), "");
    });

    test("render marks the cursor position", () => {
        const editor = new Editor();
        editor.handleInput("ab");
        editor.handleInput("\x1b[D");
        assert.deepEqual(editor.render(40), [`a${CURSOR_MARKER}b`]);
    });
});

describe("TUI", () => {
    test("first frame paints everything, later frames only changed lines", async () => {
        const terminal = new FakeTerminal();
        const tui = new TUI(terminal);
        const title = new Text("title");
        const body = new Text("body");
        tui.addComponent(title);
        tui.addComponent(body);
        tui.start();
        await tick();

        const firstFrame = terminal.writes.join("");
        assert.ok(firstFrame.includes("\x1b[2J"));
        assert.ok(firstFrame.includes("title"));
        assert.ok(firstFrame.includes("body"));

        terminal.writes = [];
        body.setText("body2");
        tui.requestRender();
        await tick();

        const secondFrame = terminal.writes.join("");
        assert.ok(!secondFrame.includes("\x1b[2J"));
        assert.ok(!secondFrame.includes("title"));
        assert.ok(secondFrame.includes("body2"));
        tui.stop();
    });

    test("dispatches input to the focused component and places the cursor", async () => {
        const terminal = new FakeTerminal();
        const tui = new TUI(terminal);
        const editor = new Editor();
        tui.addComponent(new Text("prompt"));
        tui.addComponent(editor);
        tui.setFocus(editor);
        tui.start();
        await tick();

        terminal.writes = [];
        terminal.onInput?.("hi");
        await tick();

        const frame = terminal.writes.join("");
        assert.equal(editor.getText(), "hi");
        assert.ok(frame.includes("hi"));
        assert.ok(!frame.includes(CURSOR_MARKER)); // marker stripped
        assert.ok(frame.includes("\x1b[2;3H\x1b[?25h")); // cursor at row 2, col 3
        tui.stop();
    });

    test("ctrl+c stops the TUI by default", async () => {
        const terminal = new FakeTerminal();
        const tui = new TUI(terminal);
        tui.start();
        await tick();
        terminal.onInput?.("\x03");
        terminal.writes = [];
        tui.requestRender();
        await tick();
        assert.deepEqual(terminal.writes, []); // stopped: no more frames
    });
});
