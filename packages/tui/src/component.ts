/**
 * A component turns a viewport width into lines of text.
 * The TUI concatenates all component lines and renders them differentially.
 */
export interface Component {
    /**
     * Render the component to lines for the given viewport width
     * @param width - Current viewport width
     * @returns Array of strings, each representing a line
     */
    render(width: number): string[];

    /** Optional handler for keyboard input when component has focus */
    handleInput?(data: string): void;

    /** If true, component receives key release events (Kitty protocol). Default false. */
    wantsKeyRelease?: boolean;

    /** Invalidate any cached rendering state (theme change, forced re-render). */
    invalidate(): void;
}
