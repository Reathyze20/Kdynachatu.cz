/** „Také jede“: avatary a jména spolucestujících u pobytu v hlavičce teď → příště (#172, #272, G4). */
import type { ReservationParticipantLite } from "@/api/dashboard";
import { AnimalAvatar } from "@/components/shared/AnimalAvatar";

export function ParticipantStack({ participants }: { participants: ReservationParticipantLite[] | undefined }) {
  if (!participants || participants.length === 0) return null;
  return (
    <div className="status-participants">
      <span className="status-participants-label">Také jede</span>
      <div className="status-participants-avatars">
        {participants.map((p) => (
          <span key={p.userId} className="status-participant" title={p.username}>
            <AnimalAvatar icon={p.userAnimalIcon} username={p.username} color={p.userColor || undefined} size={24} />
          </span>
        ))}
      </div>
      <span className="status-participants-names">{participants.map((p) => p.username).join(", ")}</span>
    </div>
  );
}
