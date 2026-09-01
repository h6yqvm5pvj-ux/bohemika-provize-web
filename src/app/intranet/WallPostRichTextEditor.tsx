"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

import { wallPostTextToEditorHtml } from "./wallPostRichText";

export type WallPostRichTextEditorHandle = {
  focus: () => void;
  insertText: (value: string) => void;
  toggleBold: () => void;
};

type WallPostRichTextEditorProps = {
  id: string;
  value: string;
  maxLength: number;
  placeholder: string;
  onChange: (value: string) => void;
};

const BLOCK_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "BLOCKQUOTE",
  "DIV",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "LI",
  "P",
  "PRE",
]);

const elementIsBold = (element: HTMLElement): boolean => {
  if (element.tagName === "B" || element.tagName === "STRONG") return true;
  const weight = element.style.fontWeight.trim().toLowerCase();
  if (weight === "bold" || weight === "bolder") return true;
  const numericWeight = Number(weight);
  return Number.isFinite(numericWeight) && numericWeight >= 600;
};

const serializeEditorChildren = (
  parent: Node,
  inheritedBold = false
): string => {
  let result = "";
  const children = Array.from(parent.childNodes);

  children.forEach((child, index) => {
    if (child.nodeType === Node.TEXT_NODE) {
      result += String(child.nodeValue ?? "")
        .replace(/\u00a0/g, " ")
        .replace(/[\u200b\ufeff]/g, "");
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;

    const element = child as HTMLElement;
    if (element.tagName === "BR") {
      result += "\n";
      return;
    }

    const isBlock = BLOCK_TAGS.has(element.tagName);
    if (isBlock && result && !result.endsWith("\n")) result += "\n";

    const bold = inheritedBold || elementIsBold(element);
    const inner = serializeEditorChildren(element, bold);
    result += bold && !inheritedBold && inner ? `**${inner}**` : inner;

    if (
      isBlock &&
      index < children.length - 1 &&
      result &&
      !result.endsWith("\n")
    ) {
      result += "\n";
    }
  });

  return result;
};

const editorText = (editor: HTMLElement): string =>
  serializeEditorChildren(editor).replace(/\r/g, "").replace(/\n$/, "");

const selectionBelongsToEditor = (
  selection: Selection,
  editor: HTMLElement
): boolean => {
  if (selection.rangeCount === 0) return false;
  const range = selection.getRangeAt(0);
  const ancestor = range.commonAncestorContainer;
  return ancestor === editor || editor.contains(ancestor);
};

const placeCaretAtEnd = (editor: HTMLElement) => {
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
};

export const WallPostRichTextEditor = forwardRef<
  WallPostRichTextEditorHandle,
  WallPostRichTextEditorProps
>(function WallPostRichTextEditor(
  { id, value, maxLength, placeholder, onChange },
  forwardedRef
) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const lastValidValueRef = useRef(value);
  const lastEmittedValueRef = useRef<string | null>(null);

  const saveSelection = useCallback(() => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || !selectionBelongsToEditor(selection, editor)) return;
    savedRangeRef.current = selection.getRangeAt(0).cloneRange();
  }, []);

  const restoreSelection = useCallback(() => {
    const editor = editorRef.current;
    const range = savedRangeRef.current;
    if (!editor) return;
    editor.focus();
    if (!range || !editor.contains(range.commonAncestorContainer)) {
      placeCaretAtEnd(editor);
      return;
    }
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, []);

  const emitEditorValue = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const nextValue = editorText(editor);
    if (nextValue.length > maxLength) {
      editor.innerHTML = wallPostTextToEditorHtml(lastValidValueRef.current);
      placeCaretAtEnd(editor);
      return;
    }
    lastValidValueRef.current = nextValue;
    lastEmittedValueRef.current = nextValue;
    onChange(nextValue);
    saveSelection();
  }, [maxLength, onChange, saveSelection]);

  const runEditorCommand = useCallback(
    (command: "bold" | "insertText", commandValue?: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      restoreSelection();
      document.execCommand(command, false, commandValue);
      emitEditorValue();
    },
    [emitEditorValue, restoreSelection]
  );

  useImperativeHandle(
    forwardedRef,
    () => ({
      focus: () => editorRef.current?.focus(),
      insertText: (nextValue) => runEditorCommand("insertText", nextValue),
      toggleBold: () => runEditorCommand("bold"),
    }),
    [runEditorCommand]
  );

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (lastEmittedValueRef.current === value) {
      lastEmittedValueRef.current = null;
      lastValidValueRef.current = value;
      return;
    }
    if (editorText(editor) !== value) {
      editor.innerHTML = wallPostTextToEditorHtml(value);
    }
    lastValidValueRef.current = value;
  }, [value]);

  return (
    <div
      id={id}
      ref={editorRef}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label="Text příspěvku"
      data-placeholder={placeholder}
      onInput={emitEditorValue}
      onFocus={saveSelection}
      onBlur={saveSelection}
      onKeyUp={saveSelection}
      onMouseUp={saveSelection}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
          event.preventDefault();
          runEditorCommand("bold");
        }
      }}
      onPaste={(event) => {
        event.preventDefault();
        runEditorCommand("insertText", event.clipboardData.getData("text/plain"));
      }}
      className="min-h-52 max-h-[28rem] w-full overflow-y-auto whitespace-pre-wrap rounded-2xl border border-slate-300 bg-white px-3 py-3 text-[15px] leading-6 text-slate-900 outline-none transition empty:before:pointer-events-none empty:before:text-slate-400 empty:before:content-[attr(data-placeholder)] focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 [&_b]:font-bold [&_strong]:font-bold"
    />
  );
});
