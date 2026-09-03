import { deleteMaterial, getMaterial } from "@/lib/training-db";
import { deleteUpload } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const material = getMaterial(id);
  if (!material) return Response.json({ error: "Not found." }, { status: 404 });

  deleteMaterial(id);
  if (material.filePath) deleteUpload(material.filePath);
  return Response.json({ ok: true });
}
