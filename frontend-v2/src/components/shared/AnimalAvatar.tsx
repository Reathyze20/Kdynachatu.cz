/**
 * AnimalAvatar — displays user avatar (new SVG or legacy emoji)
 * Handles both new avatar IDs ("fox", "bear") and legacy emoji ("🦊").
 */
import { getAvatarById, isAvatarId } from "@/lib/avatars";
import { memberInitial, toMemberColor } from "@/lib/memberPalette";

interface AnimalAvatarProps {
  /** Avatar identifier — new ID ("fox") or legacy emoji ("🦊") */
  icon: string | null | undefined;
  /** Name; its initial is shown when the member has no avatar */
  username: string;
  /** Stored member color; shown as the nearest palette color (#271) */
  color?: string;
  /** Size in px (default 48) */
  size?: number;
  /** Extra className */
  className?: string;
}

export function AnimalAvatar({ icon, username, color: storedColor, size = 48, className = "" }: AnimalAvatarProps) {
  const color = toMemberColor(storedColor);
  const avatarDef = isAvatarId(icon) ? getAvatarById(icon!) : undefined;

  // New-style: SVG image avatar
  if (avatarDef) {
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          overflow: "hidden",
          flexShrink: 0,
          backgroundColor: avatarDef.fallbackColor,
        }}
      >
        <img
          src={avatarDef.src}
          alt={avatarDef.label}
          width={size}
          height={size}
          loading="lazy"
          style={{ display: "block", width: "100%", height: "100%" }}
        />
      </div>
    );
  }

  // Legacy: emoji avatar
  if (icon) {
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: size * 0.5,
          // Jemný nádech barvy člena (8 %) pod emoji
          backgroundColor: `color-mix(in srgb, ${color} 8%, transparent)`,
        }}
      >
        {icon}
      </div>
    );
  }

  // Fallback: white initial on the member color (G4: color never alone, ≥ 4.5:1)
  return (
    <div
      className={className}
      title={username}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: color,
        color: "var(--text-on-primary)",
        fontSize: size * 0.45,
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      <span aria-hidden="true">{memberInitial(username)}</span>
    </div>
  );
}
