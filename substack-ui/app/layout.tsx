export const metadata = {
  title: "Substack Agent",
  description: "Chat UI for Substack automation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

