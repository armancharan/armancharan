import { Analytics } from "@vercel/analytics/next";
import { PropsWithChildren } from "react";
import { NavigationBar } from "../ui/navigation_bar";

import { Metadata, Viewport } from "next";
import { Footer } from "../ui/footer";
import "./global.css";

export const metadata: Metadata = {
  manifest: "/manifest.json",
  title: "armancharan.com",
  icons: {
    icon: { url: "/favicon.ico", sizes: "any" },
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

const RootLayout = ({ children }: PropsWithChildren) => {
  return (
    <html lang="en">
      <body>
        <NavigationBar />
        {children}
        <Footer />
        <Analytics />
      </body>
    </html>
  );
};

export default RootLayout;
