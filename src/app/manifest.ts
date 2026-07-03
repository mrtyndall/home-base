import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Home Base",
    short_name: "Home Base",
    description: "Personal operations system",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f3ef",
    theme_color: "#0f766e",
    icons: [
      {
        src: "/home-base-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
