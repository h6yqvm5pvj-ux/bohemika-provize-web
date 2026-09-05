"use client";

import Image from "next/image";
import { useState } from "react";

import { DEFAULT_PROFILE_AVATAR, normalizeProfileAvatar } from "@/lib/profileAvatar";

type ProfileAvatarProps = {
  src?: string | null;
  name?: string | null;
  alt?: string;
  sizes?: string;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
  priority?: boolean;
};

export function ProfileAvatar({
  src,
  name,
  alt,
  sizes = "48px",
  className = "h-12 w-12 rounded-2xl",
  imageClassName = "object-cover",
  fallbackClassName = "bg-[linear-gradient(135deg,#101827_0%,#2d1a62_100%)] text-white",
  priority = false,
}: ProfileAvatarProps) {
  const avatar = normalizeProfileAvatar(src);
  const [failedSrc, setFailedSrc] = useState("");
  const visibleAvatar = avatar && failedSrc !== avatar ? avatar : DEFAULT_PROFILE_AVATAR;

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden ${className} ${
        avatar && failedSrc !== avatar ? "bg-white" : fallbackClassName
      }`}
    >
      <Image
        src={visibleAvatar}
        alt={alt ?? (name ? `Profilový obrázek: ${name}` : "Profilový obrázek")}
        fill
        sizes={sizes}
        className={imageClassName}
        priority={priority}
        unoptimized={visibleAvatar.startsWith("https://")}
        onError={() => {
          if (avatar && visibleAvatar === avatar) setFailedSrc(avatar);
        }}
      />
    </span>
  );
}
