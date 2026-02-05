// src/app/pomucky/skolici-materialy/page.tsx
"use client";

import { AppLayout } from "@/components/AppLayout";
import SplitTitle from "../plan-produkce/SplitTitle";

export default function TrainingMaterialsPage() {
  return (
    <AppLayout active="tools">
      <div className="w-full max-w-5xl">
        <SplitTitle text="Školící materiály" />
      </div>
    </AppLayout>
  );
}
