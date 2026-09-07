type VigMetalModelProps = {
  className?: string;
};

export function VigMetalModel({ className = "" }: VigMetalModelProps) {
  return (
    <div className={`relative min-h-[190px] w-full select-none overflow-hidden ${className}`}>
      <iframe
        src="/models/vig/index.html?embed=1&bg=transparent&spin=1&lighting=showcase&quality=high&v=2"
        title="Kovové 3D logo Vienna Insurance Group"
        loading="lazy"
        sandbox="allow-scripts"
        tabIndex={-1}
        className="pointer-events-none absolute inset-0 h-full w-full border-0 bg-transparent [color-scheme:light]"
      />
    </div>
  );
}
