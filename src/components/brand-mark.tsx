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
    <Link href={href} className="inline-flex items-center gap-3">
      <Image
        src="/brand/logo.png"
        alt="GravyBlock"
        width={compact ? 150 : 210}
        height={compact ? 42 : 58}
        className={`h-auto w-auto ${light ? "brightness-0 invert" : ""}`}
        priority
      />
    </Link>
  );
}
