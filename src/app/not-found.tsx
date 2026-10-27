import Link from "next/link";
export default function NotFound() {
    return <main className="mx-auto max-w-lg p-10 space-y-4"><h1 className="text-2xl font-bold">Page not found</h1><p>This link may have changed. Return to the portal or track your existing application.</p><div className="flex gap-4"><Link className="text-blue-700 underline" href="/">Portal home</Link><Link className="text-blue-700 underline" href="/status">Track application</Link></div></main>;
}
