import "./globals.css";

export const metadata = {
  title: "Pulsefolio — Stock Tracker",
  description: "Personal portfolio and stock watchlist tracker"
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}