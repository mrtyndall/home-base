import { submitCapture } from "@/lib/capture/service";
import { captureInputSchema } from "@/lib/capture/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = captureInputSchema.parse(body);
    const confirmation = await submitCapture(input);

    return Response.json(confirmation, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Capture request could not be processed.",
      },
      { status: 400 },
    );
  }
}
