import { useRef, useState, type DragEvent } from "react";

type UsePdfDropzoneArgs = {
  isBusy: boolean;
  onPdfFile: (file: File) => void;
  onPdfFiles?: (files: File[]) => void;
  onInvalidFile: () => void;
};

export function usePdfDropzone({ isBusy, onPdfFile, onPdfFiles, onInvalidFile }: UsePdfDropzoneArgs) {
  const dragCounterRef = useRef(0);
  const [isDropActive, setIsDropActive] = useState(false);

  const resetDropState = () => {
    dragCounterRef.current = 0;
    setIsDropActive(false);
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current += 1;
    setIsDropActive(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) {
      setIsDropActive(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    resetDropState();

    if (isBusy) return;

    const files =
      Array.from(event.dataTransfer?.files ?? []).filter(
        (candidate) =>
          candidate.type === "application/pdf" ||
          candidate.name.toLowerCase().endsWith(".pdf")
      );

    if (files.length === 0) {
      onInvalidFile();
      return;
    }

    if (onPdfFiles) onPdfFiles(files);
    else onPdfFile(files[0]);
  };

  return {
    isDropActive,
    resetDropState,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}
