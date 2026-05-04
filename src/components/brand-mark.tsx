import Image from "next/image";
import Link from "next/link";

export function BrandMark({
  href = "/",
  compact = false,
}: {
  href?: string;
  compact?: boolean;
}) {
  return (
    <Link href={href} className="inline-flex items-center">
      <Image
        src="/brand/logo.png"
        alt="GravyBlock"
        width={compact ? 90 : 160}
        height={compact ? 28 : 50}
        className={compact ? "h-7 w-auto shrink-0" : "h-12 w-auto shrink-0"}
        priority
      />
    </Link>
  );
}
