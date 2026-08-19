/**
 * Invisible marker a component embeds in its rendered output to indicate
 * where the hardware cursor should be placed. Encoded as an APC sequence
 * so terminals that ever see it ignore it; the TUI strips it before writing.
 */
export const CURSOR_MARKER = "\x1b_pi:c\x07";

const CSI_KEY_NAMES: Record<string, string> = {
    A: "up",
    B: "down",
    C: "right",
    D: "left",
    F: "end",
    H: "home",
    Z: "shift+tab",
};

const CSI_TILDE_NAMES: Record<string, string> = {
    "1": "home",
    "2": "insert",
    "3": "delete",
    "4": "end",
    "5": "pageup",
    "6": "pagedown",
};

/** Functional key codes used by the Kitty keyboard protocol's CSI-u encoding. */
const CSI_U_NAMES: Record<string, string> = {
    "9": "tab",
    "13": "enter",
    "27": "escape",
    "127": "backspace",
};

/** Turn a modifier parameter (1-based bitmask) into a "ctrl+alt+shift+" prefix. */
function modifierPrefix(param: number): string {
    const mask = param - 1;
    let prefix = "";
    if (mask & 4) prefix += "ctrl+";
    if (mask & 2) prefix += "alt+";
    if (mask & 1) prefix += "shift+";
    return prefix;
}

/**
 * Parse a single input sequence into a normalized key id such as
 * "ctrl+a", "shift+enter", "up", or "home". Returns undefined for plain
 * printable text (which editors insert verbatim) and unknown sequences.
 */
export function parseKey(data: string): string | undefined {
    if (data.length === 0) return undefined;

    // Single-byte controls
    if (data === "\r") return "enter";
    if (data === "\n") return "ctrl+j";
    if (data === "\t") return "tab";
    if (data === "\x7f") return "backspace";
    if (data === "\x1b") return "escape";
    if (data === "\0") return "ctrl+space";
    if (data.length === 1) {
        const code = data.charCodeAt(0);
        if (code >= 1 && code <= 26) {
            return `ctrl+${String.fromCharCode(code + 96)}`;
        }
        return undefined; // printable character
    }

    if (!data.startsWith("\x1b")) return undefined; // multi-char paste

    // SS3 sequences (\x1bOA etc. — application cursor keys)
    if (data.length === 3 && data[1] === "O") {
        const name = CSI_KEY_NAMES[data[2]];
        return name ?? undefined;
    }

    // CSI sequences
    if (data[1] === "[") {
        const body = data.slice(2);
        const final = body.slice(-1);
        const params = body.slice(0, -1).split(";");

        if (final >= "A" && final <= "Z") {
            const name = CSI_KEY_NAMES[final];
            if (!name) return undefined;
            const mod = params.length >= 2 ? Number.parseInt(params[1], 10) : 1;
            return modifierPrefix(mod) + name;
        }
        if (final === "~") {
            const name = CSI_TILDE_NAMES[params[0]];
            if (!name) return undefined;
            const mod = params.length >= 2 ? Number.parseInt(params[1], 10) : 1;
            return modifierPrefix(mod) + name;
        }
        // Kitty CSI-u: \x1b[<code>;<modifiers>[:<event>]u
        if (final === "u") {
            const [modPart] = (params[1] ?? "1").split(":");
            const mod = Number.parseInt(modPart, 10) || 1;
            const code = Number.parseInt(params[0], 10);
            const name = CSI_U_NAMES[params[0]] ?? (code >= 32 ? String.fromCodePoint(code) : undefined);
            if (name === undefined) return undefined;
            return modifierPrefix(mod) + name;
        }
        return undefined;
    }

    // Alt+key (\x1b prefix on a single character or control)
    if (data.length === 2) {
        const rest = parseKey(data[1]);
        if (rest) return `alt+${rest}`;
        return `alt+${data[1]}`;
    }

    return undefined;
}

/** True if the Kitty CSI-u sequence encodes a key *release* event. */
export function isKeyRelease(data: string): boolean {
    const match = /^\x1b\[[0-9]+;[0-9]+:3u$/.exec(data);
    return match !== null;
}

/** True when the input is plain text an editor should insert verbatim. */
export function isPrintable(data: string): boolean {
    if (data.length === 0 || data.includes("\x1b")) return false;
    return parseKey(data) === undefined;
}

/** Check whether an input sequence matches a normalized key id. */
export function matchesKey(data: string, key: string): boolean {
    return parseKey(data) === key;
}
