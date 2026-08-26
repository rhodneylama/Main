import Link from "next/link";

export default function NotFound() {
  return (
    <div className="panel grid place-items-center p-12 text-center">
      <div>
        <h1 className="text-lg font-semibold">Not found</h1>
        <p className="mt-1 text-sm text-muted">
          That call or prospect doesn't exist — it may have been deleted.
        </p>
        <Link href="/" className="btn-primary mt-5">
          Back to practice
        </Link>
      </div>
    </div>
  );
}
