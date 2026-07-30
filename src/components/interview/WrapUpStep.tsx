import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, ArrowRight, Loader2 } from "lucide-react";

export interface WrapUpResponses {
  additional_details: string;
  other_suitable_roles: string;
  highlight_skills: string;
  industries_worked: string;
  tools_software: string;
  years_experience: string;
  preferred_schedule: string;
  work_setup: string;
  salary_expectation: string;
  career_goals: string;
}

const EMPTY: WrapUpResponses = {
  additional_details: "",
  other_suitable_roles: "",
  highlight_skills: "",
  industries_worked: "",
  tools_software: "",
  years_experience: "",
  preferred_schedule: "",
  work_setup: "",
  salary_expectation: "",
  career_goals: "",
};

interface WrapUpStepProps {
  onSubmit: (responses: WrapUpResponses) => void;
  submitting?: boolean;
}

export function WrapUpStep({ onSubmit, submitting = false }: WrapUpStepProps) {
  const [values, setValues] = useState<WrapUpResponses>(EMPTY);

  const set = (key: keyof WrapUpResponses, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-muted/30 p-4 space-y-1">
        <div className="flex items-center gap-2 text-primary font-medium">
          <Sparkles className="w-5 h-5" />
          <span className="text-lg">A Few Final Details</span>
        </div>
        <p className="text-sm text-muted-foreground">
          These are optional, but they help us match you with other roles that fit your background.
        </p>
      </div>

      <div className="space-y-5">
        <div className="space-y-2">
          <Label>Any particular details you want to add?</Label>
          <Textarea
            value={values.additional_details}
            onChange={(e) => set("additional_details", e.target.value)}
            placeholder="Anything else you'd like us to know..."
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label>What other suitable role do you think you will fit?</Label>
          <Textarea
            value={values.other_suitable_roles}
            onChange={(e) => set("other_suitable_roles", e.target.value)}
            placeholder="e.g. Executive Assistant, Customer Support, Bookkeeper"
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <Label>Skills you want to highlight for other roles</Label>
          <Textarea
            value={values.highlight_skills}
            onChange={(e) => set("highlight_skills", e.target.value)}
            placeholder="e.g. Data analysis, cold calling, invoicing, social media management"
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <Label>Industries you previously worked for</Label>
          <Textarea
            value={values.industries_worked}
            onChange={(e) => set("industries_worked", e.target.value)}
            placeholder="e.g. Real Estate, Healthcare, E-commerce, Logistics"
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <Label>Software / tools you're proficient in</Label>
          <Textarea
            value={values.tools_software}
            onChange={(e) => set("tools_software", e.target.value)}
            placeholder="e.g. QuickBooks, HubSpot, Excel, Shopify, Zendesk"
            rows={2}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Total years of relevant experience</Label>
            <Input
              value={values.years_experience}
              onChange={(e) => set("years_experience", e.target.value)}
              placeholder="e.g. 5 years"
            />
          </div>
          <div className="space-y-2">
            <Label>Preferred work schedule / shift</Label>
            <Input
              value={values.preferred_schedule}
              onChange={(e) => set("preferred_schedule", e.target.value)}
              placeholder="e.g. Night shift (EST), Day shift"
            />
          </div>
          <div className="space-y-2">
            <Label>Preferred work setup</Label>
            <Input
              value={values.work_setup}
              onChange={(e) => set("work_setup", e.target.value)}
              placeholder="e.g. Remote, Hybrid, Onsite"
            />
          </div>
          <div className="space-y-2">
            <Label>Expected monthly salary</Label>
            <Input
              value={values.salary_expectation}
              onChange={(e) => set("salary_expectation", e.target.value)}
              placeholder="e.g. PHP 40,000"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>What are your career goals for the next 2 years?</Label>
          <Textarea
            value={values.career_goals}
            onChange={(e) => set("career_goals", e.target.value)}
            placeholder="Where you'd like to grow professionally..."
            rows={2}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="lg" onClick={() => onSubmit(values)} disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              Finish Interview
              <ArrowRight className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
