import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LaserCraft AI · Plantillas paramétricas para láser",
  description: "Diseña plantillas de corte y grabado láser de forma conversacional. Genera SVG con finger joints matemáticamente correctos, ensamblaje 3D y exportación a SVG/DXF/LightBurn.",
  keywords: ["láser", "corte láser", "finger joints", "SVG", "DXF", "LightBurn", "Boxes.py", "Next.js"],
  authors: [{ name: "LaserCraft AI" }],
  openGraph: {
    title: "LaserCraft AI",
    description: "Plantillas paramétricas para corte láser generadas con IA",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <Toaster richColors position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
