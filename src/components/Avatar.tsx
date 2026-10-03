import { cn } from "../lib/hooks";

export function Avatar({
  name,
  color,
  size = 28,
  ring,
  title,
}: {
  name: string;
  color: string;
  size?: number;
  ring?: boolean;
  title?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span
      title={title ?? name}
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full font-semibold text-white select-none",
        ring && "ring-2 ring-bg",
      )}
      style={{ background: color, width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials || "?"}
    </span>
  );
}

