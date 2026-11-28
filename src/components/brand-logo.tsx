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
      src="/tic-removebg-preview.png"
      alt="Unicom TIC logo"
      width={806}
      height={302}
      priority={priority}
      unoptimized
      className={`shrink-0 object-cover object-left ${className}`}
    />
  );
}
