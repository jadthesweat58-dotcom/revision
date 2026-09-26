import type { Metadata, Viewport } from "next";
import Nav from "@/components/Nav";
import { databaseSettingNames, databaseUrl } from "@/lib/db";
import { passwordIsSet } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Revision",
  description: "My GCSE revision command centre",
  appleWebApp: { capable: true, title: "Revision", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
};

// Give slow first loads (database waking up) time to finish.
export const maxDuration = 60;

export const viewport: Viewport = {
  themeColor: "#111110",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const missing = [
    !passwordIsSet() && "APP_PASSWORD (your login password)",
    !databaseUrl() && "a database (the Supabase connection)",
  ].filter(Boolean);

  return (
    <html lang="en-GB">
      <body>
        {missing.length > 0 ? (
          <main>
            <div className="card login">
              <h1>Almost there</h1>
              <p className="dim">The app is online but still needs:</p>
              <ul>
                {missing.map((m) => (
                  <li key={String(m)}>{m}</li>
                ))}
              </ul>
              <p className="dim">Follow the steps in SETUP.md, then redeploy in Vercel.</p>
              {!databaseUrl() && (
                <p className="small muted">
                  Database settings this deployment can see:{" "}
                  {databaseSettingNames().join(", ") || "none — Supabase isn't connected to this project yet"}
                </p>
              )}
            </div>
          </main>
        ) : (
          <>
            <Nav />
            <main>{children}</main>
          </>
        )}
      </body>
    </html>
  );
}
