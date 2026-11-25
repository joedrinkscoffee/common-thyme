/** One bordered card on a Settings tab. */
export function SettingsCard({
  title,
  hint,
  children,
  tone = "plain",
  id,
}: {
  title: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  tone?: "plain" | "danger";
  id?: string;
}) {
  return (
    <section id={id} className={`rounded-[24px] border-2 bg-paper p-5 sm:p-6 ${tone === "danger" ? "border-tomato" : "border-ink"}`}>
      <h2 className={`m-0 font-display text-xl font-extrabold ${tone === "danger" ? "text-tomato-dark" : ""}`}>{title}</h2>
      {hint && <p className="mb-0 mt-1 text-[15px] text-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
