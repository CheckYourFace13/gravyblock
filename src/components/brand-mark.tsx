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
        width={compact ? 180 : 183}
        height={compact ? 96 : 97}
        className={compact ? "h-16 w-auto shrink-0" : "h-20 w-auto shrink-0"}
        priority
      />
    </Link>
  );
}
