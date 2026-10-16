export type NoteSettings = { format: "knowledge" | "html"; detail: "concise" | "balanced" | "detailed"; organization: "topic" | "chapter"; visuals: string[]; formulas: boolean; tables: boolean; examples: boolean; review: boolean; subject: string; level: string; language: "vi" | "en"; instructions: string };
export type NoteResult = { title: string; content: string; warnings: string[] };
export const NOTE_LIMITS: { content: number; source: number; sources: number };
export const NOTE_VISUALS: string[];
export class NoteValidationError extends Error {}
export function emptyNoteSettings(): NoteSettings;
export function validateNoteSettings(value: unknown): NoteSettings;
export function validateNoteResult(value: unknown, format: NoteSettings["format"]): NoteResult;
export function noteInstructions(settings: NoteSettings): string;
