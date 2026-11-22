import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

export const dynamic = "force-dynamic";

function resolveBlobToken(): string | undefined {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return process.env.BLOB_READ_WRITE_TOKEN;
  }
  const altKey = Object.keys(process.env).find(
    (k) => k.endsWith("_READ_WRITE_TOKEN") && k.toUpperCase().includes("BLOB")
  );
  return altKey ? process.env[altKey] : undefined;
}

export async function GET() {
  const token = resolveBlobToken();
  const blobEnvKeys = Object.keys(process.env).filter((k) =>
    k.toUpperCase().includes("BLOB")
  );
  return NextResponse.json(
    {
      blobEnabled: Boolean(token || process.env.BLOB_STORE_ID),
      blobEnvKeys,
      runtime: process.env.VERCEL ? "vercel" : "local",
    },
    {
      headers: { "Cache-Control": "no-store, max-age=0" },
    }
  );
}

export async function POST(request: Request) {
  const token = resolveBlobToken();
  if (!token && !process.env.BLOB_STORE_ID) {
    return NextResponse.json(
      { error: "متغير BLOB_READ_WRITE_TOKEN غير موجود في بيئة المشروع على Vercel." },
      { status: 400 }
    );
  }

  try {
    const body = (await request.json()) as HandleUploadBody;
    const jsonResponse = await handleUpload({
      token,
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
