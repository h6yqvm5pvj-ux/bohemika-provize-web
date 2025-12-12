import React from "react";

export default function SplitTitle({ text }: { text: string }) {
  const letters = text.split("");

  return (
    <div className="relative inline-flex flex-wrap text-5xl sm:text-6xl font-extrabold tracking-tight text-white">
      {letters.map((ch, idx) => (
        <span
          key={idx}
          className="inline-block animate-split-fade"
          style={{ animationDelay: `${idx * 45}ms` }}
        >
          {ch === " " ? "\u00A0" : ch}
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
          animation: split-fade 0.7s ease forwards;
        }
      `}</style>
    </div>
  );
}
