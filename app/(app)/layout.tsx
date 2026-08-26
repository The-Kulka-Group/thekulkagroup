import { Rail } from "@/components/Rail";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <Rail />
      <main className="field">{children}</main>
    </div>
  );
}
