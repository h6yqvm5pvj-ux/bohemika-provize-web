/** Shared schematic geometry for the overview, loader and measurement illustrations. */
export function CuzkHouse({ roofFill = "#9871d6" }: { roofFill?: string }) {
  return (
    <>
          <path d="m166 162 66-38 66 38-66 39Z" fill="#fff" />
          <path d="m166 162 66 39v53l-66-38Z" fill="#f8f5ff" />
          <path d="m232 201 66-39v54l-66 38Z" fill="#ddd3ef" />
          <path d="m161 165 38-68 70 40-37 69Z" fill={roofFill} />
          <path d="m199 97 70 40 36 28-70-40Z" fill="#b396e8" />
          <path d="m235 125 34 12 36 28-70 41Z" fill="#7851b6" />
          <path d="m179 184 16 9v18l-16-9Z" fill="#c7b2e9" stroke="#fff" strokeWidth="2" />
          <path d="m209 221 13 7v20l-13-7Z" fill="#a48acb" />
          <path d="m249 207 13-8v16l-13 8Z" fill="#a58bcf" stroke="#f6f2ff" strokeWidth="2" />
          <path d="m277 191 12-7v16l-12 7Z" fill="#a58bcf" stroke="#f6f2ff" strokeWidth="2" />
    </>
  );
}
