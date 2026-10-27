import Image from "next/image";

export default function BrandLogo({
  className = "h-10 w-10",
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/logo.png"
      alt="Unicom TIC logo"
      width={600}
      height={600}
      priority={priority}
      unoptimized
      className={`shrink-0 object-contain ${className}`}
    />
  );
}
