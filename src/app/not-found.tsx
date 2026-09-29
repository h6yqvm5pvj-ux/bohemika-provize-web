import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-950 px-6 py-16 text-slate-100">
      <div className="max-w-lg text-center">
        <p className="text-sm font-semibold tracking-widest text-violet-300">CHYBA 404</p>
        <h1 className="mt-4 text-3xl font-bold sm:text-4xl">Stránka nebyla nalezena</h1>
        <p className="mt-4 text-base leading-relaxed text-slate-300">
          Odkaz může být neplatný nebo stránka už není dostupná. Zkontrolujte adresu nebo se vraťte na úvodní stránku.
        </p>
        <Link href="/" className="mt-8 inline-flex rounded-full bg-violet-600 px-6 py-3 font-semibold text-white hover:bg-violet-500 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-300">
          Přejít na úvodní stránku
        </Link>
      </div>
    </main>
  );
}
