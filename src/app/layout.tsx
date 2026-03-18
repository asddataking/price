import type { Metadata } from "next";
import "./globals.css";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import type { Viewport } from "next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WPrice – Real-time local wins",
  description:
    "WPrice tracks verified local prices in real time with photo proof.",
  openGraph: {
    title: "WPrice – Real-time local wins",
    description: "Verified local prices, captured with photo proof.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "WPrice – Real-time local wins",
    description: "Verified local prices, captured with photo proof.",
  },
  icons: [
    {
      rel: "icon",
      url: "/window.svg",
    },
    {
      rel: "apple-touch-icon",
      url: "/window.svg",
    },
  ],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-background text-foreground`}
      >
        <ThemeProvider>
          {children}
          <Toaster richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
