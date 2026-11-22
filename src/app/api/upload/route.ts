import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const hasToken = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  return NextResponse.json(
    {
      blobEnabled: hasToken,
      runtime: process.env.VERCEL ? "vercel" : "local",
    },
    {
      headers: { "Cache-Control": "no-store, max-age=0" },
    }
  );
}

export async function POST(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "متغير BLOB_READ_WRITE_TOKEN غير موجود في بيئة المشروع على Vercel." },
      { status: 400 }
    );
  }

  try {
    const body = (await request.json()) as HandleUploadBody;
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        return {
          allowedContentTypes: [
            "application/pdf",
            "image/png",
            "image/jpeg",
            "image/webp",
            "text/plain",
            "text/csv",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/octet-stream",
          ],
          maximumSizeInBytes: 50 * 1024 * 1024, // 50 MB per file
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {
        // Order metadata is saved by POST /api/orders right after direct upload completes
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "فشل رفع الملف." },
      { status: 400 }
    );
  }
}
