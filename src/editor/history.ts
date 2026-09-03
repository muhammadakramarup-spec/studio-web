// src/editor/history.ts
//
// Target 1 (SCOPE.md §1, build order item 1): the undo/redo command stack. Built and testable in
// isolation before anything else is wired through it — every ops.* method below constructs an
// EditorOp and pushes it through this same execute() so every target is undoable "for free"
// (src/editor/SPEC.md target 1).

import type { EditorOp } from "./types.ts";

export interface HistoryApi {
  /** Applies op.do() once and pushes the op onto the undo stack; clears the redo stack. */
  execute(op: EditorOp): void;
  /** Pops the most recent op, calls op.undo(), pushes it onto the redo stack. False if empty. */
  undo(): boolean;
  /** Pops the most recent undone op, calls op.do() again, pushes it back onto the undo stack. */
  redo(): boolean;
  /** Drops all history (used when the underlying scene is reset out from under the editor). */
  clear(): void;
  readonly undoDepth: number;
  readonly redoDepth: number;
}

export function createHistory(): HistoryApi {
  const undoStack: EditorOp[] = [];
  const redoStack: EditorOp[] = [];

  return {
    execute(op: EditorOp): void {
      op.do();
      undoStack.push(op);
      redoStack.length = 0;
    },
    undo(): boolean {
      const op = undoStack.pop();
      if (!op) return false;
      op.undo();
      redoStack.push(op);
      return true;
    },
    redo(): boolean {
      const op = redoStack.pop();
      if (!op) return false;
      op.do();
      undoStack.push(op);
      return true;
    },
    clear(): void {
      undoStack.length = 0;
      redoStack.length = 0;
    },
    get undoDepth() {
      return undoStack.length;
    },
    get redoDepth() {
      return redoStack.length;
    },
  };
}

let counter = 0;
/** Stable, collision-free id for EditorOp.id without depending on crypto.randomUUID availability. */
export function nextOpId(kind: string): string {
  counter += 1;
  return `${kind}-${Date.now().toString(36)}-${counter}`;
}
