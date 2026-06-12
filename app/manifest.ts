import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Parapost Network",
    short_name: "Parapost",
    description:
      "Parapost Network is a social platform for the paranormal community. Connect with members, share posts, watch Reels, message friends, and join Live shows.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#05050b",
    theme_color: "#05050b",
    icons: [
      {
        src: "/icons/parapost-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/parapost-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/parapost-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}