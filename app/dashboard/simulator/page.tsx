import DashboardLayout from "../../components/DashboardLayout";
import { SimulatorInterface } from "../../components/simulator/SimulatorInterface";
import { promises as fs } from "fs";
import path from "path";
import { type Emote } from "@/lib/emotes";

async function loadEmotes(): Promise<Emote[]> {
  try {
    const filePath = path.join(process.cwd(), ".emote_cache.json");
    const fileContent = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(fileContent);
    return data.emotes || [];
  } catch (error) {
    console.error("Error loading emotes:", error);
    return [];
  }
}

export default async function DashboardSimulatorPage() {
  const emotes = await loadEmotes();

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        <SimulatorInterface emotes={emotes} />
      </div>
    </DashboardLayout>
  );
}
