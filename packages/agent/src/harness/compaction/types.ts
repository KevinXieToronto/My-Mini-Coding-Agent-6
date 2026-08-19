export interface CompactionSettings {
	enabled: boolean;
	/** Tokens reserved for the summarization prompt and its output. */
	reserveTokens: number;
	/** Approximate recent-context tokens kept verbatim after compaction. */
	keepRecentTokens: number;
}

/** Default compaction settings used by the harness. */
export const DEFAULT_COMPACTION_SETTINGS: CompactionSettings = {
	enabled: true,
	reserveTokens: 16384, // 为摘要提示词与输出保留的 token
	keepRecentTokens: 20000, // compaction 后大约保留的近期上下文 token
};

export interface CompactionPlan {
	/** Entry ids summarized away. */
	summarizedEntryIds: string[];
	/** First entry kept verbatim; null when everything on the path gets summarized. */
	firstKeptEntryId: string | null;
	/** Approximate context tokens before compaction. */
	tokensBefore: number;
}
