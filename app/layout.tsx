import type { Metadata } from "next";
import { Inter, Noto_Sans_Khmer } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const notoSansKhmer = Noto_Sans_Khmer({
  subsets: ["khmer"],
  variable: "--font-noto-sans-khmer"
});

export const metadata: Metadata = {
  title: "StoreGenz POS",
  description: "Point of sale dashboard"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${notoSansKhmer.variable}`}>
        {children}
      </body>
    </html>
  );
}
