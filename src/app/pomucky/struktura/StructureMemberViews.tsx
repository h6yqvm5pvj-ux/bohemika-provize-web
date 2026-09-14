import { ArrowUpRight, Crown, Network, Search, UsersRound } from "lucide-react";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { positionLabel } from "@/app/lib/formatters";
import type { StructureNode } from "./structureTree";
import styles from "./structure.module.css";

type Props = {
  nodes: StructureNode[];
  allNodes: StructureNode[];
  ownEmail: string;
  view: "cards" | "list";
  onShowInMap: (email: string) => void;
};
const roleLabel = (node: StructureNode) => node.accountType === "tipster" ? "Tipař" : positionLabel(node.position);

export function StructureMemberViews({ nodes, allNodes, ownEmail, view, onShowInMap }: Props) {
  const parentName = (node: StructureNode) => allNodes.find((member) => member.email === node.managerEmail)?.name ?? "Vrchol zobrazené struktury";
  if (!nodes.length) return <div className={styles.state}><Search size={30} aria-hidden="true" /><strong>Nikdo neodpovídá hledání</strong><p>Zkus jiné jméno, e-mail nebo pozici.</p></div>;

  if (view === "list") return (
    <div className={styles.listWrap}>
      <table className={styles.memberTable}>
        <caption className="sr-only">Členové struktury, jejich pozice a nadřízení</caption>
        <thead><tr><th>Člen týmu</th><th>Pozice</th><th>Nadřízený</th><th>Podřízení</th><th><span className="sr-only">Zobrazit v mapě</span></th></tr></thead>
        <tbody>{nodes.map((node) => <tr key={node.email} data-current={node.email === ownEmail}>
          <td><div className={styles.listIdentity}><ProfileAvatar src={node.profileAvatar} name={node.name} alt="" className="h-10 w-10 rounded-xl" sizes="40px" /><div><strong>{node.name}{node.email === ownEmail ? <em>Ty</em> : null}</strong><span>{node.email}</span></div></div></td>
          <td><span className={styles.roleBadge} data-manager={node.position?.startsWith("manazer")}>{node.position?.startsWith("manazer") ? <Crown size={11} aria-hidden="true" /> : <UsersRound size={11} aria-hidden="true" />}{roleLabel(node)}</span></td>
          <td className={styles.parentCell}>{parentName(node)}</td>
          <td className={styles.childrenCell}>{node.children}</td>
          <td><button type="button" className={styles.rowAction} onClick={() => onShowInMap(node.email)} aria-label={`Zobrazit v mapě: ${node.name}`}><ArrowUpRight size={16} aria-hidden="true" /></button></td>
        </tr>)}</tbody>
      </table>
      <div className={styles.listFooter}>Celkem {nodes.length} členů · Seřazeno podle jména</div>
    </div>
  );

  return (
    <div className={styles.memberGrid}>
      {nodes.map((node) => <article key={node.email} className={styles.memberCard} data-current={node.email === ownEmail}>
        <div className={styles.memberCover} aria-hidden="true"><span /><i /><b /></div>
        <div className={styles.memberCardTop}>
          <ProfileAvatar src={node.profileAvatar} name={node.name} alt="" className="h-16 w-16 rounded-2xl border-[4px] border-white shadow-sm" sizes="64px" />
          {node.email === ownEmail ? <span className={styles.youBadge}>Tvůj profil</span> : <span className={styles.levelBadge}>Úroveň {node.depth + 1}</span>}
        </div>
        <div className={styles.memberCardBody}>
          <h2>{node.name}</h2>
          <p className={styles.memberEmail}>{node.email}</p>
          <span className={styles.roleBadge} data-manager={node.position?.startsWith("manazer")}>{node.position?.startsWith("manazer") ? <Crown size={12} aria-hidden="true" /> : <UsersRound size={12} aria-hidden="true" />}{roleLabel(node)}</span>
          <div className={styles.memberRelations}>
            <div><span>Nadřízený</span><strong>{parentName(node)}</strong></div>
            <div><span>Přímí podřízení</span><strong>{node.children}</strong></div>
          </div>
          <button type="button" className={styles.showOnMap} onClick={() => onShowInMap(node.email)}><Network size={14} aria-hidden="true" /> Zobrazit v mapě <ArrowUpRight size={14} aria-hidden="true" /></button>
        </div>
      </article>)}
    </div>
  );
}
