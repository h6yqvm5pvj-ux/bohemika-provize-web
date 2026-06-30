import React from "react";

const splitTitleWords = (text: string): string[] =>
  text
    .normalize("NFC")
    .trim()
    .split(/\s+/u)
    .filter(Boolean);

export default function SplitTitle({
  text,
  wrap = true,
  className = "",
}: {
  text: string;
  wrap?: boolean;
  className?: string;
}) {
  const words = splitTitleWords(text);
  let letterIndex = 0;

  return (
    <div
      className={`relative inline-flex ${
        wrap ? "flex-wrap" : "flex-nowrap whitespace-nowrap"
      } gap-x-[0.22em] gap-y-[0.08em] text-5xl sm:text-6xl font-extrabold tracking-tight text-slate-900 ${className}`}
    >
      <span className="sr-only">{text}</span>
      {words.map((word, wordIndex) => (
        <span
          key={`${word}-${wordIndex}`}
          aria-hidden="true"
          className="inline-flex flex-nowrap whitespace-nowrap"
        >
          {Array.from(word).map((ch) => {
            const delay = letterIndex * 45;
            letterIndex += 1;

            return (
              <span
                key={`${wordIndex}-${letterIndex}`}
                className="inline-block animate-split-fade text-current"
                style={{ animationDelay: `${delay}ms` }}
              >
                {ch}
              </span>
            );
          })}
        </span>
      ))}
      <style jsx>{`
        @keyframes split-fade {
          0% {
            opacity: 0;
            transform: translateY(14px) scale(0.96);
            filter: blur(4px);
          }
          60% {
            opacity: 1;
            transform: translateY(0) scale(1.02);
            filter: blur(0);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
        }
        .animate-split-fade {
          animation: split-fade 0.7s ease both;
        }
      `}</style>
    </div>
  );
}
