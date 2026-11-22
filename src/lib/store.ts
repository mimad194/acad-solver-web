import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { del, list, put } from "@vercel/blob";
import { StudentOrder, UploadedFileMeta } from "@/types/order";
import { buildDemoSeedOrder } from "./sample-seed";

const BLOB_ORDERS_PREFIX = "acad-solver/orders/";
const BLOB_UPLOADS_PREFIX = "acad-solver/uploads/";

function resolveBlobToken(): string | undefined {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return process.env.BLOB_READ_WRITE_TOKEN;
  }
  const altKey = Object.keys(process.env).find(
    (k) => k.endsWith("_READ_WRITE_TOKEN") && k.toUpperCase().includes("BLOB")
  );
  return altKey ? process.env[altKey] : undefined;
}

function useVercelBlob(): boolean {
  return Boolean(resolveBlobToken() || process.env.BLOB_STORE_ID);
}

// ---------- Local / Fallback Filesystem Helpers ----------

function getDataDir(): string {
  if (process.env.VERCEL || process.env.NETLIFY) {
    return path.join("/tmp", "acad-solver-data");
  }
  return path.join(process.cwd(), ".data");
}

function getOrdersFile(): string {
  return path.join(getDataDir(), "orders.json");
}

function getUploadsDir(): string {
  return path.join(getDataDir(), "uploads");
}

async function ensureLocalInitialized(): Promise<void> {
  await fs.mkdir(getDataDir(), { recursive: true });
  await fs.mkdir(getUploadsDir(), { recursive: true });
  const ordersFile = getOrdersFile();
  try {
    await fs.access(ordersFile);
  } catch {
    await fs.writeFile(ordersFile, JSON.stringify([buildDemoSeedOrder()], null, 2), "utf-8");
  }
}

async function writeLocalOrders(orders: StudentOrder[]): Promise<void> {
  await ensureLocalInitialized();
  await fs.writeFile(getOrdersFile(), JSON.stringify(orders, null, 2), "utf-8");
}

// ---------- Vercel Blob Helpers ----------

async function saveOrderToBlob(order: StudentOrder): Promise<void> {
  await put(`${BLOB_ORDERS_PREFIX}${order.id}.json`, JSON.stringify(order, null, 2), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json; charset=utf-8",
    token: resolveBlobToken(),
  });
}

async function listOrdersFromBlob(): Promise<StudentOrder[]> {
  const { blobs } = await list({ prefix: BLOB_ORDERS_PREFIX, token: resolveBlobToken() });
  if (blobs.length === 0) {
    const demo = buildDemoSeedOrder();
    await saveOrderToBlob(demo);
    return [demo];
  }

  const fetched = await Promise.all(
    blobs
      .filter((b) => b.pathname.endsWith(".json"))
      .map(async (b) => {
        try {
          const res = await fetch(b.url, { cache: "no-store" });
          if (!res.ok) return null;
          return (await res.json()) as StudentOrder;
        } catch {
          return null;
        }
      })
  );

  return fetched
    .filter((o): o is StudentOrder => o !== null)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// ---------- Public Store API ----------

export async function listOrders(): Promise<StudentOrder[]> {
  if (useVercelBlob()) {
    return listOrdersFromBlob();
  }
  await ensureLocalInitialized();
  const raw = await fs.readFile(getOrdersFile(), "utf-8");
  const parsed = JSON.parse(raw) as StudentOrder[];
  return parsed.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getOrderById(id: string): Promise<StudentOrder | null> {
  const orders = await listOrders();
  return orders.find((o) => o.id === id) ?? null;
}

export async function getOrderByTrackingCode(code: string): Promise<StudentOrder | null> {
  const normalized = code.trim().toUpperCase();
  const orders = await listOrders();
  return orders.find((o) => o.trackingCode.toUpperCase() === normalized) ?? null;
}

export function generateTrackingCode(): string {
  const yr = new Date().getFullYear();
  const num = crypto.randomInt(1000, 9999);
  return `ORD-${yr}-${num}`;
}

export async function saveUploadedFile(
  file: File,
  category: "exercise" | "reference"
): Promise<UploadedFileMeta> {
  const id = crypto.randomUUID();
  const ext = path.extname(file.name) || "";
  const storedName = `${id}${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";

  if (useVercelBlob()) {
    const blob = await put(`${BLOB_UPLOADS_PREFIX}${storedName}`, buf, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: mimeType,
      token: resolveBlobToken(),
    });
    return {
      id,
      originalName: file.name,
      storedName,
      blobUrl: blob.url,
      mimeType,
      size: buf.length,
      category,
      uploadedAt: new Date().toISOString(),
    };
  }

  await ensureLocalInitialized();
  await fs.writeFile(path.join(getUploadsDir(), storedName), buf);
  return {
    id,
    originalName: file.name,
    storedName,
    mimeType,
    size: buf.length,
    category,
    uploadedAt: new Date().toISOString(),
  };
}

export async function readUploadedFileBuffer(
  storedName: string,
  blobUrl?: string
): Promise<Buffer | null> {
  if (blobUrl) {
    try {
      const res = await fetch(blobUrl, { cache: "no-store" });
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch {
      return null;
    }
  }

  if (useVercelBlob()) {
    const { blobs } = await list({ prefix: `${BLOB_UPLOADS_PREFIX}${path.basename(storedName)}`, token: resolveBlobToken() });
    const match = blobs[0];
    if (!match) return null;
    try {
      const res = await fetch(match.url, { cache: "no-store" });
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch {
      return null;
    }
  }

  await ensureLocalInitialized();
  const safeName = path.basename(storedName);
  const fullPath = path.join(getUploadsDir(), safeName);
  try {
    return await fs.readFile(fullPath);
  } catch {
    return null;
  }
}

export async function createOrder(
  data: Omit<
    StudentOrder,
    "id" | "trackingCode" | "status" | "adminNote" | "solution" | "createdAt" | "updatedAt"
  >
): Promise<StudentOrder> {
  const orders = await listOrders();
  const now = new Date().toISOString();
  let code = generateTrackingCode();
  while (orders.some((o) => o.trackingCode === code)) {
    code = generateTrackingCode();
  }
  const order: StudentOrder = {
    ...data,
    id: crypto.randomUUID(),
    trackingCode: code,
    status: "pending",
    adminNote: "",
    solution: null,
    createdAt: now,
    updatedAt: now,
  };

  if (useVercelBlob()) {
    await saveOrderToBlob(order);
    return order;
  }

  orders.unshift(order);
  await writeLocalOrders(orders);
  return order;
}

export async function updateOrder(
  id: string,
  updater: (current: StudentOrder) => StudentOrder
): Promise<StudentOrder | null> {
  const orders = await listOrders();
  const idx = orders.findIndex((o) => o.id === id);
  if (idx === -1) return null;
  const updated = updater(orders[idx]);
  updated.updatedAt = new Date().toISOString();

  if (useVercelBlob()) {
    await saveOrderToBlob(updated);
    return updated;
  }

  orders[idx] = updated;
  await writeLocalOrders(orders);
  return updated;
}

export async function deleteOrder(id: string): Promise<boolean> {
  const orders = await listOrders();
  const target = orders.find((o) => o.id === id);
  if (!target) return false;

  if (useVercelBlob()) {
    const urlsToDelete: string[] = [];
    for (const f of target.files) {
      if (f.blobUrl) urlsToDelete.push(f.blobUrl);
    }
    const { blobs } = await list({ prefix: `${BLOB_ORDERS_PREFIX}${id}.json`, token: resolveBlobToken() });
    for (const b of blobs) urlsToDelete.push(b.url);
    if (urlsToDelete.length > 0) {
      await del(urlsToDelete, { token: resolveBlobToken() }).catch(() => {});
    }
    return true;
  }

  for (const f of target.files) {
    const p = path.join(getUploadsDir(), path.basename(f.storedName));
    await fs.unlink(p).catch(() => {});
  }
  await writeLocalOrders(orders.filter((o) => o.id !== id));
  return true;
}
