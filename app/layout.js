import "./globals.css";

export const metadata = {
  title: "Pulsefolio — Stock Tracker",
  description: "Personal US stock analysis dashboard"
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}