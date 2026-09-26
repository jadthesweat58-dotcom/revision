import type { MetadataRoute } from "next";

// Lets the app be added to the iPad / Mac home screen and open like a normal app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Revision command centre",
    short_name: "Revision",
    description: "My GCSE revision command centre",
    start_url: "/",
    display: "standalone",
    background_color: "#111110",
    theme_color: "#111110",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
