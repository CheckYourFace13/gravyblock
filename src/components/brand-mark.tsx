import Image from "next/image";
import Link from "next/link";

export function BrandMark({
  href = "/",
  compact = false,
  light = false,
}: {
  href?: string;
  compact?: boolean;
  light?: boolean;
}) {
  return (
    <Link href={href} className="inline-flex items-center gap-2">
      <Image
        src="/icon.png"
        alt=""
        width={compact ? 36 : 44}
        height={compact ? 36 : 44}
        className={`h-auto w-auto shrink-0 ${light ? "brightness-0 invert" : ""}`}
        priority
      />
      <span
        className={`font-semibold tracking-tight ${compact ? "text-base sm:text-lg" : "text-lg sm:text-xl"} ${
          light ? "text-white" : "text-zinc-900"
        }`}
      >
        GravyBlock
      </span>
    </Link>
  );
}
