import type { PublicMember } from "@coursebook/domain/friends/types";
import { Link } from "react-router";
import { avatarTone, initials } from "./format";
import { profilePath } from "./paths";
import { AvatarSize } from "./sizes";
import styles from "./social.module.css";

const SIZE_CLASS: Record<AvatarSize, string | undefined> = {
  [AvatarSize.ExtraSmall]: styles.avatarXs,
  [AvatarSize.Small]: styles.avatarSm,
  [AvatarSize.Medium]: undefined,
  [AvatarSize.Large]: styles.avatarLg,
};

/**
 * A member's avatar: a monogram in a gold ring, in a tone that stays the
 * same for that member everywhere. Photos come later (issue #18); the API
 * does not send them yet.
 *
 * @param member - Whose avatar; the display name gives the initials.
 * @param size - Defaults to medium.
 * @param link - When true, the avatar links to the member's profile.
 */
export function Avatar({ member, size = AvatarSize.Medium, link = false }: { member: PublicMember; size?: AvatarSize; link?: boolean }) {
  const className = [styles.avatar, SIZE_CLASS[size]].filter(Boolean).join(" ");
  const text = initials(member.displayName, member.username);
  const tone = avatarTone(member.username);
  if (link)
    return (
      <Link to={profilePath(member.username)} className={className} data-tone={tone} aria-label={member.displayName || member.username}>
        {text}
      </Link>
    );
  return (
    <span className={className} data-tone={tone} aria-hidden="true">
      {text}
    </span>
  );
}
