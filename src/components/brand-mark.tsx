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
        width={compact ? 170 : 230}
        height={compact ? 54 : 74}
        className="h-auto w-auto shrink-0"
        priority
      />
    </Link>
  );
}
