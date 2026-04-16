import "./globals.css";

export const metadata = {
  title: "AI Interview Assistant",
  description: "Real-time AI-powered interview coaching with multi-provider support",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 antialiased">{children}</body>
    </html>
  );
}
