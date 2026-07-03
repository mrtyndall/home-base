import { getGoogleOAuthStartUrl } from "@/lib/calendar/google";

export async function GET() {
  try {
    return Response.redirect(getGoogleOAuthStartUrl(), 302);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Google OAuth could not be started.",
      },
      { status: 500 },
    );
  }
}
