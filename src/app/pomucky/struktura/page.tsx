"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Box, Crown, Crosshair, Expand, Layers3, LayoutGrid, List, Minus, Move, Network, Plus, RotateCcw, Search, UsersRound, X } from "lucide-react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { AppLayout } from "@/components/AppLayout";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { auth } from "@/app/firebase";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { positionLabel } from "@/app/lib/formatters";
import { useEffectiveUserEmail } from "@/app/lib/useAdminImpersonation";
import { normalizeProfileAvatar } from "@/lib/profileAvatar";
import { layoutStructure, NODE_WIDTH, NODE_HEIGHT, type StructureMember } from "./structureTree";
import styles from "./structure.module.css";
import { StructureMemberViews } from "./StructureMemberViews";

type TeamResponse = {
  ok: boolean;
  members?: (Partial<StructureMember> & { teamParentEmail?: string | null; tipRecipientEmail?: string | null })[];
};
const MIN_ZOOM = .3;
const MAX_ZOOM = 1.6;
const clamp = (value: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(value * 100) / 100));
const emailKey = (value?: string | null) => (value ?? "").trim().toLowerCase();
const nameFromEmail = (email: string) => email.split("@")[0].split(/[.\-_]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");

export default function StructurePage() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const effectiveEmail = useEffectiveUserEmail(user?.email);
  const [members, setMembers] = useState<StructureMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [zoom, setZoom] = useState(.85);
  const [is3D, setIs3D] = useState(true);
  const [view, setView] = useState<"map" | "cards" | "list">("map");
  const [search, setSearch] = useState("");
  const [focusedEmail, setFocusedEmail] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLDivElement>());
  const dragRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  useEffect(() => onAuthStateChanged(auth, (next) => { setUser(next); if (!next) setLoading(false); }), []);
  useEffect(() => {
    if (!user || !effectiveEmail) return;
    let cancelled = false;
    const load = async () => {
    setLoading(true);
    setError(null);
    setMembers([]);
    await fetchAuthedJsonOrThrow<TeamResponse>(user, "/api/team-overview?action=members&includeAncestors=1")
      .then((payload) => {
        if (cancelled) return;
        const map = new Map<string, StructureMember>();
        for (const member of payload.members ?? []) {
          const email = emailKey(member.email);
          if (!email) continue;
          map.set(email, {
            email, name: member.name?.trim() || nameFromEmail(email), position: member.position ?? null,
            managerEmail: emailKey(member.teamParentEmail || (member.accountType === "tipster" ? member.tipRecipientEmail : member.managerEmail)) || null,
            accountType: member.accountType === "tipster" ? "tipster" : "advisor",
            profileAvatar: normalizeProfileAvatar(member.profileAvatar),
          });
        }
        if (!map.has(effectiveEmail)) map.set(effectiveEmail, { email: effectiveEmail, name: nameFromEmail(effectiveEmail), position: null, managerEmail: null });
        setMembers([...map.values()]);
      }).catch(() => { if (!cancelled) setError("Strukturu se nepodařilo načíst. Zkus to prosím znovu."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    };
    void load();
    return () => { cancelled = true; };
  }, [user, effectiveEmail, refresh]);

  const layout = useMemo(() => layoutStructure(members, effectiveEmail ?? ""), [members, effectiveEmail]);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom((value) => clamp(value + (event.deltaY < 0 ? .1 : -.1)));
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [loading, layout.nodes.length, view]);
  const managers = layout.nodes.filter((member) => member.position?.startsWith("manazer")).length;
  const centerOnMember = useCallback((email: string) => {
    const viewport = viewportRef.current;
    const card = nodeRefs.current.get(email);
    if (!viewport || !card) return;
    const frame = viewport.getBoundingClientRect();
    const rect = card.getBoundingClientRect();
    viewport.scrollTo({ left: viewport.scrollLeft + rect.left - frame.left - (frame.width - rect.width) / 2, top: viewport.scrollTop + rect.top - frame.top - (frame.height - rect.height) / 2, behavior: "auto" });
  }, []);
  const centerOnMe = useCallback(() => {
    setFocusedEmail(effectiveEmail ?? null);
    centerOnMember(effectiveEmail ?? "");
  }, [centerOnMember, effectiveEmail]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => centerOnMember(focusedEmail ?? effectiveEmail ?? ""));
    return () => cancelAnimationFrame(frame);
  }, [layout, zoom, is3D, view, focusedEmail, effectiveEmail, centerOnMember]);
  const visibleMembers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("cs");
    return layout.nodes.filter((node) => !term || `${node.name} ${node.email} ${node.accountType === "tipster" ? "Tipař" : positionLabel(node.position)}`.toLocaleLowerCase("cs").includes(term))
      .sort((a, b) => a.name.localeCompare(b.name, "cs"));
  }, [layout.nodes, search]);
  const showInMap = (email: string) => { setFocusedEmail(email); setView("map"); };
  const fitTree = () => {
    const viewport = viewportRef.current;
    if (!viewport || !layout.width) return;
    setZoom(clamp(Math.min(viewport.clientWidth / (layout.width + 100), viewport.clientHeight / (layout.height + 100))));
  };
  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const viewport = event.currentTarget;
    event.preventDefault();
    dragRef.current = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
    viewport.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    event.currentTarget.scrollLeft = drag.left + drag.x - event.clientX;
    event.currentTarget.scrollTop = drag.top + drag.y - event.clientY;
  };
  const endDrag = () => { dragRef.current = null; setDragging(false); };

  return (
    <AppLayout active="tools">
      <div className={styles.page}>
        <header className={styles.header}>
          <div className={styles.headerCopy}>
            <div className={styles.eyebrow}><Network size={14} aria-hidden="true" /> Lidé a jejich propojení</div>
            <h1>Struktura týmu<span>.</span></h1>
            <p>Tvoji lidé, jejich role a vzájemné propojení.<br />Získej nadhled nad celým týmem.</p>
            <Link href="/muj-tym" className={styles.teamLink}>Přejít na výsledky týmu <ArrowUpRight size={15} aria-hidden="true" /></Link>
          </div>
          <div className={styles.heroVisual} aria-hidden="true">
            <div className={styles.heroHalo} />
            <Image src="/illustrations/team/structure-3d.webp" alt="" width={620} height={420} className={styles.heroImage} priority />
            <span className={styles.heroCaption}><span /> Každý má své místo</span>
          </div>
        </header>

        <div className={styles.stats}>
          <div><span className={styles.statIcon}><UsersRound size={18} /></span><span><strong>{loading ? "—" : layout.nodes.length}</strong><small>Lidí ve struktuře</small></span></div>
          <div><span className={styles.statIcon}><Crown size={18} /></span><span><strong>{loading ? "—" : managers}</strong><small>Manažeři</small></span></div>
          <div><span className={styles.statIcon}><Layers3 size={18} /></span><span><strong>{loading ? "—" : layout.levels}</strong><small>Úrovně propojení</small></span></div>
        </div>

        <div className={styles.workspaceBar}>
          <div className={styles.workspaceTabs} role="group" aria-label="Přepnout zobrazení členů">
            <button type="button" aria-pressed={view === "map"} onClick={() => setView("map")}><Network size={15} aria-hidden="true" /> Mapa týmu</button>
            <button type="button" aria-pressed={view === "cards"} onClick={() => setView("cards")}><LayoutGrid size={15} aria-hidden="true" /> Karty</button>
            <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}><List size={16} aria-hidden="true" /> Seznam</button>
          </div>
          {view !== "map" ? <div className={styles.memberSearch}><Search size={15} aria-hidden="true" /><input type="search" aria-label="Hledat členy struktury" placeholder="Jméno, e-mail nebo pozice…" value={search} onChange={(event) => setSearch(event.target.value)} />{search ? <button type="button" aria-label="Vymazat hledání" onClick={() => setSearch("")}><X size={14} aria-hidden="true" /></button> : null}</div> : <span className={styles.workspaceHint}><Box size={14} aria-hidden="true" /> Prostor pro tvůj tým</span>}
        </div>
        <section className={styles.map} aria-label="Týmová struktura">
          {view !== "map" && !loading && !error ? (
            <StructureMemberViews nodes={visibleMembers} allNodes={layout.nodes} ownEmail={effectiveEmail ?? ""} view={view} onShowInMap={showInMap} />
          ) : <>
          <div className={styles.toolbar}>
            <div className={styles.viewToggle} role="group" aria-label="Zobrazení struktury">
              <button type="button" aria-pressed={is3D} onClick={() => setIs3D(true)}><Box size={14} /> 3D pohled</button>
              <button type="button" aria-pressed={!is3D} onClick={() => setIs3D(false)}><Network size={14} /> Rovný pohled</button>
            </div>
            <div className={styles.tools}>
              <button type="button" onClick={centerOnMe} disabled={!layout.nodes.length} className={styles.findMe}><Crosshair size={15} /> Najít mě</button>
              <span className={styles.toolDivider} />
              <button type="button" onClick={() => setZoom((value) => clamp(value - .1))} disabled={zoom <= MIN_ZOOM} aria-label="Oddálit strukturu"><Minus size={16} /></button>
              <button type="button" onClick={() => setZoom(.85)} aria-label="Obnovit výchozí přiblížení" className={styles.zoomValue}>{Math.round(zoom * 100)} %</button>
              <button type="button" onClick={() => setZoom((value) => clamp(value + .1))} disabled={zoom >= MAX_ZOOM} aria-label="Přiblížit strukturu"><Plus size={16} /></button>
              <button type="button" onClick={fitTree} disabled={!layout.nodes.length} aria-label="Přizpůsobit strukturu oknu" title="Přizpůsobit oknu"><Expand size={16} /></button>
            </div>
          </div>
          {loading ? (
            <div className={styles.state} role="status"><Box size={32} /><strong>Propojujeme tvůj tým</strong><p>Načítáme členy a jejich místo ve struktuře.</p></div>
          ) : error ? (
            <div className={styles.state} role="alert"><Network size={32} /><strong>{error}</strong><button type="button" onClick={() => setRefresh((value) => value + 1)}><RotateCcw size={14} /> Zkusit znovu</button></div>
          ) : !layout.nodes.length ? (
            <div className={styles.state}><UsersRound size={32} /><strong>Struktura zatím není k dispozici</strong></div>
          ) : (
            <div ref={viewportRef} className={styles.viewport} data-dragging={dragging} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag} tabIndex={0} aria-label="Prostorová mapa. Posuň ji tažením nebo šipkami na klávesnici.">
              <div className={styles.stage} style={{ width: (layout.width + 140) * zoom, height: (layout.height + 140) * zoom }}>
                <div className={styles.scaled} style={{ width: layout.width, height: layout.height, transform: `scale(${zoom})` }}>
                  <div className={styles.scene} data-3d={is3D} style={{ width: layout.width, height: layout.height }}>
                    <div className={styles.floor} aria-hidden="true" />
                    <svg className={styles.connections} width={layout.width} height={layout.height} aria-hidden="true">
                      {layout.edges.map(({ from, to }) => {
                        const x1 = from.x + NODE_WIDTH / 2, x2 = to.x + NODE_WIDTH / 2;
                        const y1 = from.y + NODE_HEIGHT, y2 = to.y, middle = (y1 + y2) / 2;
                        return <g key={`${from.email}-${to.email}`}><path d={`M ${x1} ${y1} V ${middle} H ${x2} V ${y2}`} /><circle cx={x2} cy={y2} r="4" /></g>;
                      })}
                    </svg>
                    {layout.nodes.map((member) => {
                      const isOwn = member.email === effectiveEmail;
                      const isManager = member.position?.startsWith("manazer");
                      return (
                        <div key={member.email} ref={(element) => { if (element) nodeRefs.current.set(member.email, element); else nodeRefs.current.delete(member.email); }} className={styles.node} role="group" data-own={isOwn} data-manager={isManager} data-focused={member.email === focusedEmail} style={{ left: member.x, top: member.y, width: NODE_WIDTH, height: NODE_HEIGHT }} aria-label={`${member.name}, ${isOwn ? "ty, " : ""}${member.accountType === "tipster" ? "Tipař" : positionLabel(member.position)}`}>
                          <div className={styles.nodeTop}><span>{isManager ? <Crown size={12} /> : <UsersRound size={12} />}{member.accountType === "tipster" ? "Tipař" : positionLabel(member.position)}</span>{isOwn ? <b>To jsi ty</b> : <i />}</div>
                          <div className={styles.identity}><ProfileAvatar src={member.profileAvatar} name={member.name} alt="" className="h-12 w-12 rounded-xl" sizes="48px" /><div><strong title={member.name}>{member.name}</strong><span title={member.email}>{member.email}</span></div></div>
                          <div className={styles.nodeFoot}><span><Network size={11} /> {member.children ? `Přímí podřízení: ${member.children}` : "Člen struktury"}</span><span>Úroveň {member.depth + 1}</span></div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
          <footer className={styles.mapFooter}><div className={styles.legend}><span><i data-tone="own" /> Ty</span><span><i data-tone="manager" /> Manažer</span><span><i /> Poradce / tipař</span></div><span className={styles.dragHint}><Move size={13} /> Posuň mapu tažením</span></footer>
          </>}
        </section>
        <p className={styles.footnote}>Zobrazuje tvoje nadřízené a členy tvé vlastní struktury.</p>
      </div>
    </AppLayout>
  );
}
