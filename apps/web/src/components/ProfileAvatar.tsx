import { useState } from "react";

export function ProfileAvatar({ url, name, className = "" }: { url?: string | null; name: string; className?: string }) {
  const [broken, setBroken] = useState<string | null>(null);
  return <span className={`profile-avatar ${className}`} aria-hidden="true">{url && broken !== url
    ? <img alt="" src={url} referrerPolicy="no-referrer" onError={() => setBroken(url)}/>
    : (Array.from(name.trim())[0]?.toLocaleUpperCase() || "M")}</span>;
}
