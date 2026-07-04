import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Home Base",
    short_name: "Home Base",
    description: "Personal operations system",
    start_url: "/",
    display: "standalone",
    background_color: "#EFF2EE",
    theme_color: "#EFF2EE",
    icons: [
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/home-base-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
