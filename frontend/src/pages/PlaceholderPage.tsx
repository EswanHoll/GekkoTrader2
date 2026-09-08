type Props = {
  title: string;
  detail?: string;
};

/** Temporary surface while pages are ported from legacy/. */
export function PlaceholderPage({ title, detail }: Props) {
  return (
    <section className="max-w-3xl">
      <h1 className="text-2xl font-extrabold tracking-tight text-white">{title}</h1>
      <p className="mt-2 text-gekko-muted">
        {detail ||
          "This screen is next to port onto the live React shell. Navigation and Home are live on gekkotrader.com."}
      </p>
      <div className="mt-6 rounded-lg border border-gekko/25 bg-gekko/5 px-4 py-3 text-sm text-gekko">
        GekkoTrader · in-place modernization (GST-114)
      </div>
    </section>
  );
}
