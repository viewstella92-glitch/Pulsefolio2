import "./globals.css";
import { Inter, Noto_Sans_Thai } from "next/font/google";

const inter=Inter({subsets:["latin"],display:"swap",variable:"--font-inter"});
const thai=Noto_Sans_Thai({subsets:["thai"],display:"swap",variable:"--font-thai",weight:["400","500","600","700","800"]});

export const metadata={title:"Pulsefolio — US Stock Intelligence",description:"Personal US stock analysis dashboard"};

export default function RootLayout({children}){return <html lang="th" className={`${inter.variable} ${thai.variable}`}><body>{children}</body></html>}
