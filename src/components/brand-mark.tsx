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
        width={compact ? 122 : 183}
        height={compact ? 65 : 97}
        className={compact ? "h-9 w-auto shrink-0" : "h-14 w-auto shrink-0"}
        priority
      />
    </Link>
  );
}
