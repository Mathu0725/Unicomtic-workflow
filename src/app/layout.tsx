import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Unicom TIC - Student Lifecycle Platform",
  description: "Official Student Registration, Application, Workshop, Exam and Selection Management Portal for Unicom TIC",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased text-slate-800 bg-slate-50 min-h-screen">
        {children}
      </body>
    </html>
  );
}
