import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HomeoHub",
    short_name: "HomeoHub",
    description: "Homeopathy care: self care and doctor consultations.",
    start_url: "/",
    display: "standalone",
    theme_color: "#1E6B4E",
    background_color: "#EEF2ED",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
