"use client";

import { Textarea } from "@/components/ui/textarea";

interface CodeEditorProps {
  code: string;
  setCode: (val: string) => void;
}

export default function CodeEditor({ code, setCode }: CodeEditorProps) {
  return (
    <div className="mb-4">
      <Textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        rows={10}
        className="font-mono"
      />
    </div>
  );
}

