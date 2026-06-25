import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileSignature, FileText, ClipboardCheck } from "lucide-react";
import { TemplatesPanel } from "./TemplatesPanel";
import { EnvelopesPanel } from "./EnvelopesPanel";
import { PrePitchPanel } from "./PrePitchPanel";

export const ContractsManager = () => {
  const [tab, setTab] = useState("envelopes");
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Contracts</h2>
        <p className="text-muted-foreground">Send contracts for e-signature and manage reusable templates.</p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="envelopes" className="gap-2"><FileSignature className="w-4 h-4" /> Sent Contracts</TabsTrigger>
          <TabsTrigger value="pre-pitch" className="gap-2"><ClipboardCheck className="w-4 h-4" /> Pre-Pitch Agreement</TabsTrigger>
          <TabsTrigger value="templates" className="gap-2"><FileText className="w-4 h-4" /> Templates</TabsTrigger>
        </TabsList>
        <TabsContent value="envelopes" className="mt-4"><EnvelopesPanel /></TabsContent>
        <TabsContent value="pre-pitch" className="mt-4"><PrePitchPanel /></TabsContent>
        <TabsContent value="templates" className="mt-4"><TemplatesPanel /></TabsContent>
      </Tabs>
    </div>
  );
};

export default ContractsManager;
