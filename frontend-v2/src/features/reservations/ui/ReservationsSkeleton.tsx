import { TwoColumnLayout } from "@/components/layout/TwoColumnLayout";
import styles from "../Reservations.module.css";

/* Side panel: list skeleton */
const listSkeleton = (
  <div>
    <div className={styles.skeletonNavBlock} style={{ marginBottom: "var(--space-lg)" }} />
    {Array.from({ length: 4 }, (_, i) => (
      <div
        key={i}
        className={styles.skeletonListCard}
        style={{ marginBottom: "var(--space-sm)" }}
      />
    ))}
  </div>
);

export function ReservationsSkeleton() {
  return (
    <TwoColumnLayout asideLabel="Rezervace" aside={listSkeleton}>
      {/* Left: Calendar skeleton */}
      <div className={styles.skeletonCalendarCard}>
        <div className={styles.skeletonHeaderBar}>
          <div className={styles.skeletonNavBlock} />
          <div className={styles.skeletonStatsBlock}>
            <div className={styles.skeletonStatPill} />
            <div className={styles.skeletonStatPill} />
            <div className={styles.skeletonStatPill} />
          </div>
        </div>
        <div className={styles.skeletonGrid}>
          {Array.from({ length: 42 }, (_, i) => (
            <div key={i} className={styles.skeletonCell} />
          ))}
        </div>
      </div>
    </TwoColumnLayout>
  );
}
