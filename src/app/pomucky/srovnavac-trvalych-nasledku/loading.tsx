import { ComparisonLoading } from "./ComparisonLoading";
import styles from "./comparison.module.css";

export default function Loading() {
  return <div className={styles.page}><ComparisonLoading /></div>;
}
